---
title: MySQL 主从复制实战：原理、Position 复制与 GTID 复制两种部署
date: 2026-09-07
description: 从三个线程怎么协作，到基于 Position 和基于 GTID 两套主从的完整部署、排错、延迟优化与切换，一篇把 MySQL 复制讲透。
category: mysql
tags:
  - mysql
  - 主从复制
  - 高可用
---

单台 MySQL 的问题是"一个鸡蛋放一个篮子"：机器一挂，业务全停；想把读压力分出去也没地方分。主从复制就是那个把鸡蛋分到多个篮子、并且让篮子之间自动对齐的机制。

我见过不少人搭主从卡在"配完了但 `Seconds_Behind_Master` 一直 NULL"或者"切换之后主库报 GTID 冲突"，基本都是原理没吃透。所以这篇先讲清 binlog 是怎么流到从库的，再给两套可以直接抄的部署方案。

## 一、主从架构在解决什么问题

最少两台 MySQL 组成集群，角色不同：

- **master（主）**：接收业务端的增删改请求，把变更写进 **binlog 二进制日志**
- **slave（从）**：从 master 拉取 binlog，在本地回放，保持数据一致

一主一从是最小单元，往上可以扩展成**一主多从**、**多级主从（级联复制）**、**双主互主（主主复制）**。

它的价值有四条，按重要程度排：

| 价值 | 说明 |
| --- | --- |
| 读写分离 | master 写、slave 读，把读流量分摊出去，提升整体并发 |
| 数据备份 | slave 是 master 的准实时热备，故障时能快速顶上 |
| 高可用基础 | 配合 MHA / Orchestrator / MGR 才能实现自动故障切换 |
| 异地容灾 | 跨机房部署 slave，抗整个机房级别的故障 |

注意第三条：**主从复制本身不等于高可用**。它只保证"有一份一样的数据"，不保证"挂了自动切"。这是很多人对主从最大的误解。

## 二、三种复制模式

MySQL 默认是**异步复制**，所以主从之间不需要维持长连接。三种模式对比：

| 模式 | 机制 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 同步复制 | 必须等 slave 同步完成，master 才能继续下一个事务 | 两端数据高度一致 | 阻塞主库事务，性能很差 |
| **异步复制** | master 提交即返回，slave 空闲时自己来拉 | 不阻塞主库，性能高 | 可能有主从延迟，极端情况丢数据 |
| 半同步复制 | master 提交后，至少等**一个** slave 确认收到 binlog 才返回客户端 | 折中，大幅降低丢数据风险 | 仍有延迟，网络抖动会退化成异步 |

MySQL 原生不支持纯同步复制，半同步靠插件：

```sql
-- 主库
INSTALL PLUGIN rpl_semi_sync_master SONAME 'semisync_master.so';
SET GLOBAL rpl_semi_sync_master_enabled = ON;

-- 从库
INSTALL PLUGIN rpl_semi_sync_slave SONAME 'semisync_slave.so';
SET GLOBAL rpl_semi_sync_slave_enabled = ON;
```

（MySQL 8.0.26 起参数改名为 `rpl_semi_sync_source_enabled` / `rpl_semi_sync_replica_enabled`。）

## 三、工作原理：三个线程把日志搬过去

假设一主一从：

```
              DML 请求
                 │
                 ▼
      ┌────────────────────────┐
      │   master 主服务器        │
      │   · 写 binlog           │
      │   · Binlog Dump 线程 ───┼──┐  网络：发送 binlog 事件
      └────────────────────────┘  │
                                 ▼
      ┌──────────────────────────────────────┐
      │   slave 从服务器                       │
      │   · IO 线程 ──► 写入 relay log        │
      │   · relay log 中继日志                 │
      │   · SQL 线程 ──► 回放 relay log 到数据 │
      └──────────────────────────────────────┘
```

| 线程 | 位置 | 作用 | 数量 |
| --- | --- | --- | --- |
| Binlog Dump Thread | 主库 | 读取 binlog 并发送给 slave | 每个 slave 一个 |
| IO Thread | 从库 | 接收 binlog，写入本地 relay log | 1 |
| SQL Thread | 从库 | 读取 relay log 并按序回放，落到数据 | 1（开并行后是 1 + N 个 worker） |

完整流程五步：

1. 用户对 master 执行 DML（INSERT/UPDATE/DELETE），变更自动写入 **binlog**
2. slave 的 **IO 线程**发起连接，master 为它创建 **Binlog Dump 线程**，读取 binlog 事件通过网络发送
3. slave IO 线程收到事件后写入本地 **relay log**，并把连接信息记录到 `mysql.slave_master_info` 系统表（8.0 默认存表，不再是 `master.info` 文件）
4. slave **SQL 线程**读取 relay log，按序重放事件应用到数据，进度记录在 `mysql.slave_relay_log_info`
5. 循环往复——主从复制的全部意义就是让两端数据高度一致

### 前提条件清单

配之前先把这四条核对掉，绝大多数"配不起来"都栽在这里：

- master 必须开 `log_bin`（记录增删改，复制的数据来源）
- slave 必须开 `relay_log`（存放同步过来的日志）
- master 与 slave 的 **`server_id` 必须不同**且集群内唯一
- master 上要为 slave 建一个有 `REPLICATION SLAVE` 权限的复制账号

补充两条经验值：主从两端 **MySQL 大版本保持一致**；跨版本时要求 slave 版本 ≥ master 版本。

还有一个隐蔽但致命的：**同步数据前，slave 的 datadir 里要删掉 `auto.cnf`**。里面存的 `server_uuid` 如果和 master 撞了，GTID 模式下从库会认为"这些事务是我自己产生的"，直接不回放或者报冲突。

## 四、方案一：基于 Position 的传统主从

这是最经典的 AB 复制，靠"binlog 文件名 + 位点"定位同步进度。

### 环境规划

| 角色 | 主机名 | IP | server_id | 版本 |
| --- | --- | --- | --- | --- |
| master | db01 | 192.168.88.101 | 1 | 8.0.x |
| slave | db02 | 192.168.88.102 | 2 | 8.0.x |

两台都已装好 MySQL 8.0，且**初始数据一致**（可通过 mysqldump 或 Clone 插件完成，见下文）。

### 1. master 端配置

`/etc/my.cnf`：

```ini
[mysqld]
server_id                      = 1
log_bin                        = /data/mysql/binlog/mysql-bin
binlog_format                  = ROW
max_binlog_size                = 256M
binlog_expire_logs_seconds     = 604800        # 保留 7 天，生产建议 7~30 天
log_slave_updates              = ON            # 从库也记 binlog，为级联/双主留后路

# 本方案是传统 position 模式，GTID 先关着
gtid_mode                      = OFF
enforce_gtid_consistency       = OFF
```

```bash
mkdir -p /data/mysql/binlog
chown -R mysql:mysql /data/mysql/binlog
systemctl restart mysqld
```

验证：

```sql
SHOW VARIABLES LIKE 'log_bin%';
+---------------------------------+------------------------------+
| Variable_name                   | Value                        |
+---------------------------------+------------------------------+
| log_bin                         | ON                           |
| log_bin_basename                | /data/mysql/binlog/mysql-bin |
+---------------------------------+------------------------------+

SHOW MASTER STATUS;
+------------------+----------+--------------+------------------+
| File             | Position | Binlog_Do_DB | Binlog_Ignore_DB |
+------------------+----------+--------------+------------------+
| mysql-bin.000003 |      157 |              |                  |
+------------------+----------+--------------+------------------+
```

**记下这个 File 和 Position**，稍后配从库要用。

### 2. slave 端配置

```ini
[mysqld]
server_id                      = 2             # 必须和 master 不同
relay_log                      = /data/mysql/relaylog/relay-bin

# 普通从库可以不开 binlog；级联复制或双主要开
log_bin                        = /data/mysql/binlog/mysql-bin
log_slave_updates              = ON

read_only                      = ON            # 防止误写从库导致数据不一致
super_read_only                = ON

binlog_format                  = ROW
gtid_mode                      = OFF
enforce_gtid_consistency       = OFF
```

```bash
mkdir -p /data/mysql/relaylog /data/mysql/binlog
chown -R mysql:mysql /data/mysql
systemctl restart mysqld
```

`super_read_only` 比 `read_only` 更狠，连 `SUPER`/`CONNECTION_ADMIN` 权限的账号也不能写。**从库一定开它**，"顺手在从库改了条数据"是主从不一致的头号成因。例外是双主和多源复制场景，那时必须关掉。

### 3. master 创建复制账号

```sql
CREATE USER 'repl'@'192.168.88.%' IDENTIFIED BY 'Repl@123456';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'192.168.88.%';
FLUSH PRIVILEGES;

-- 验证
SHOW GRANTS FOR 'repl'@'192.168.88.%';
```

host 尽量收窄到网段，别写 `'%'`。这个账号能被任意 IP 用，等于给整个内网开了一道读你全部数据的口子。

### 4. master 数据初始化同步

在 master 上加全局读锁，保证 dump 期间数据不动：

```sql
FLUSH TABLES WITH READ LOCK;
SHOW MASTER STATUS;      -- 再确认一次位点，例如 mysql-bin.000003 / 157
```

**新开一个终端**执行导出（锁只在原会话有效，同会话里跑 shell 命令会先解锁）：

```bash
mysqldump -uroot -p --all-databases --triggers --routines --events \
  --single-transaction --master-data=2 > /tmp/full.sql
```

导完回原会话释放锁：

```sql
UNLOCK TABLES;
```

传到 slave：

```bash
scp /tmp/full.sql root@192.168.88.102:/tmp/
```

> 严格说 `--single-transaction` 和 `FLUSH TABLES WITH READ LOCK` 只需要一个：开事务快照就不用全局读锁。上面这套是"最保险"的写法，代价是备份期间全库不可写。生产上用 `--single-transaction --master-data=2` 即可，位点会自动写进 SQL 文件的注释里。
> 数据量大到 mysqldump 扛不住时，直接用 Clone 插件（本文第九节）。

### 5. slave 配置复制源

先导入数据：

```bash
mysql -uroot -p < /tmp/full.sql
```

再指定 master（MySQL 8.0 用 `CHANGE REPLICATION SOURCE TO`）：

```sql
CHANGE REPLICATION SOURCE TO
    SOURCE_HOST='192.168.88.101',
    SOURCE_PORT=3306,
    SOURCE_USER='repl',
    SOURCE_PASSWORD='Repl@123456',
    SOURCE_LOG_FILE='mysql-bin.000003',
    SOURCE_LOG_POS=157,
    SOURCE_CONNECT_RETRY=10;
```

5.x 语法对照，看老代码时要用：

```sql
CHANGE MASTER TO
  MASTER_HOST='192.168.88.101',
  MASTER_PORT=3306,
  MASTER_USER='repl',
  MASTER_PASSWORD='Repl@123456',
  MASTER_LOG_FILE='mysql-bin.000003',
  MASTER_LOG_POS=157,
  MASTER_CONNECT_RETRY=10;
```

### 6. 启动并验证

```sql
START REPLICA;              -- MySQL 8.0；5.x 是 START SLAVE
SHOW REPLICA STATUS\G
```

两个字段必须都是 `Yes`，缺一不可：

```
Replica_IO_Running:  Yes     -- IO 线程：拉日志的
Replica_SQL_Running: Yes     -- SQL 线程：放日志的
```

`IO=Yes, SQL=No` 说明日志拉到了但回放出错（多半是数据冲突）；`IO=No` 说明连不上主库或位点无效，看 `Last_IO_Error`。

写入测试：

```sql
-- master
CREATE DATABASE testdb;
USE testdb;
CREATE TABLE t1 (id INT PRIMARY KEY, name VARCHAR(20));
INSERT INTO t1 VALUES (1,'tom');

-- slave
SELECT * FROM testdb.t1;
+----+------+
| id | name |
+----+------+
|  1 | tom  |
+----+------+
```

### 7. Position 方案的硬伤

用一段时间就会碰到问题：

- **位点是主库本地概念**。master 一重启或者 `RESET MASTER`，文件名从 `000003` 跳回 `000001`，从库立刻断
- **主从切换要人工算位点**，新主库的哪个位点对应老从库已经执行到哪里，全靠人肉核对，极易出错
- binlog 被 `PURGE` 掉之后，落后的从库**永远追不回来**，只能重做全备

这三条就是 GTID 存在的理由。

## 五、方案二：基于 GTID 的主从复制

MySQL 5.6 引入、5.7 成熟、8.0 推荐默认，也是 MGR 的强制前置。

### 1. GTID 是什么

**GTID（Global Transaction Identifier，全局事务标识符）** 的格式：

```
server_uuid:sequence_number
例：3E11FA47-71CA-11E1-9E33-C80AA942CF6C:23
```

三个特点：

- 每个事务在**整个集群内全局唯一**，由产生它的 master 的 `server_uuid` + 递增序号组成
- slave 靠 GTID 自动定位要复制哪个位置，**不再依赖 FILE + POSITION**
- 主从切换、崩溃恢复更可靠，不会丢事务也不会重复执行

一个从库上的 `gtid_executed` 通常长这样，表示来自两台服务器的连续事务区间：

```
3e11fa47-...:1-200,
7b9c2d1a-...:1-45
```

### 2. 两端配置

**master** `/etc/my.cnf`：

```ini
[mysqld]
server_id                       = 1
log_bin                         = /data/mysql/binlog/mysql-bin
binlog_format                   = ROW

# GTID 必备三件套
gtid_mode                       = ON
enforce_gtid_consistency        = ON
log_slave_updates               = ON

binlog_expire_logs_seconds      = 604800
```

**slave** `/etc/my.cnf`：

```ini
[mysqld]
server_id                       = 2
relay_log                       = /data/mysql/relaylog/relay-bin
log_bin                         = /data/mysql/binlog/mysql-bin
binlog_format                   = ROW

gtid_mode                       = ON
enforce_gtid_consistency        = ON
log_slave_updates               = ON

read_only                       = ON
super_read_only                 = ON
```

```bash
systemctl restart mysqld
```

验证：

```sql
SHOW VARIABLES LIKE 'gtid_mode';
SHOW GLOBAL VARIABLES LIKE '%gtid%';
```

三件套里 `log_slave_updates` 的作用经常被误解：它让从库**把回放的事务也写进自己的 binlog**。不开它，级联复制（A→B→C）的 C 就拿不到数据；对 GTID 而言，它保证从库自己有一份完整的事务历史可追溯。

### 3. 复制账号

和传统方案完全一样：

```sql
CREATE USER 'repl'@'192.168.88.%' IDENTIFIED BY 'Repl@123456';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'192.168.88.%';
FLUSH PRIVILEGES;
```

### 4. 数据初始化：必须加一个参数

GTID 模式下用 mysqldump，**必须**加 `--set-gtid-purged=ON`，让 dump 文件带上 `SET @@GLOBAL.gtid_purged` 语句：

```bash
mysqldump -uroot -p --all-databases --triggers --routines --events \
  --single-transaction --set-gtid-purged=ON > /tmp/full_gtid.sql
```

它的作用是把"这份备份已经包含了哪些 GTID 事务"告诉从库。不加的话，从库会以为那些事务还没执行过，重新回放一遍就报主键冲突。

slave 端导入前先清空自己的 GTID 历史：

```bash
scp /tmp/full_gtid.sql root@192.168.88.102:/tmp/

mysql -uroot -p -e "RESET MASTER;"     # 清空 gtid_executed 和 binlog
mysql -uroot -p < /tmp/full_gtid.sql
mysql -uroot -p -e "SHOW GLOBAL VARIABLES LIKE 'gtid_executed';"
```

> 更高效的替代方案是 Clone 插件或 MySQL Shell 的 `util.dumpInstance()`，几十 G 的库差距是数量级的。

### 5. 用 AUTO_POSITION 建立复制

```sql
CHANGE REPLICATION SOURCE TO
    SOURCE_HOST='192.168.88.101',
    SOURCE_PORT=3306,
    SOURCE_USER='repl',
    SOURCE_PASSWORD='Repl@123456',
    SOURCE_AUTO_POSITION=1,             -- 关键：不再需要 FILE / POS
    SOURCE_CONNECT_RETRY=10;

-- 5.x 写法：CHANGE MASTER TO ... MASTER_AUTO_POSITION=1;
```

从库会把自己已执行的 GTID 集合发给主库，主库自动把自己有、从库没有的事务推过来。位点这件事从此交给引擎。

### 6. 启动与验证

```sql
START REPLICA;
SHOW REPLICA STATUS\G
```

重点字段：

```
Replica_IO_Running:   Yes
Replica_SQL_Running:  Yes
Auto_Position:        1
Retrieved_Gtid_Set:   3e11fa47-...:1-100     -- 从主库收到（写进 relay log）的
Executed_Gtid_Set:    3e11fa47-...:1-100     -- 已经在本机回放完的
```

`Retrieved` 和 `Executed` 差距持续变大 = 从库回放跟不上，也就是主从延迟。

### 7. GTID 的限制（这是它的代价）

开了 `enforce_gtid_consistency=ON`，MySQL 会拒绝那些**无法被唯一 GTID 标识**的语句：

- ❌ `CREATE TABLE ... SELECT`（一个语句同时是 DDL 和 DML，拆不成两个事务）
- ❌ `CREATE TEMPORARY TABLE` / `DROP TEMPORARY TABLE` 出现在事务内部
- ❌ 在事务里设 `sql_log_bin = 0`
- ❌ `CREATE TABLE ... ENGINE=MyISAM` 这类非事务表混在事务中

传统主从迁到 GTID，**必须先把这些语句改掉**，否则从库回放直接停在这里。改 `gtid_mode` 也不能一步到位，必须按状态机过渡：

```
OFF → OFF_PERMISSIVE → ON_PERMISSIVE → ON
```

（反向同理倒过来走，中间两个 PERMISSIVE 状态用于"新旧事务并存"的平滑迁移。）

## 六、运维：常用命令与排错

### 1. 日常查看

```sql
-- 从库：复制状态（最常用，没有之一）
SHOW REPLICA STATUS\G

-- 主库：当前 binlog 位点
SHOW MASTER STATUS;

-- 主库：看有哪些从库连上来（能看到 Binlog Dump 线程）
SHOW PROCESSLIST;
SELECT * FROM information_schema.processlist WHERE Command='Binlog Dump';

-- 看 binlog 里到底记了什么
SHOW BINLOG EVENTS IN 'mysql-bin.000003' FROM 157 LIMIT 10;

-- GTID 执行进度
SHOW GLOBAL VARIABLES LIKE 'gtid_executed';
SELECT * FROM performance_schema.replication_connection_status;
SELECT * FROM performance_schema.replication_applier_status_by_worker;
```

判断延迟最直接的字段：

```
Seconds_Behind_Master: 0
```

含义是"从库 SQL 线程正在执行的事件，与主库当前时间的差距"。它有几个反直觉的地方：`NULL` 表示**复制断了**（不是延迟无限大）；`0` 也不一定真的没延迟，如果 IO 线程卡住而 SQL 线程恰好回放完了，也会显示 0。

### 2. 故障对照表

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `Replica_IO_Running: No` | 网络不通 / 账号密码错 / master binlog 已被清理 | 看 `Last_IO_Error`；确认 `repl` 账号和 host 限制；确认 binlog 没被过早 `PURGE` |
| `Replica_SQL_Running: No` | 在从库上执行了和主库冲突的 DML | 看 `Last_SQL_Error`；确认数据可自行处理冲突后跳事务 |
| `Fatal error: ... transaction with GTID ... already present` | 从库的 `gtid_executed` 里已有该事务 | 从库 `RESET MASTER;` 清掉 `gtid_executed`，再 `START REPLICA` |
| 延迟持续增大 | 网络/IO 瓶颈，或 SQL 单线程回放不过来 | 开多线程复制；拆小主库大事务；换 SSD |
| 主从数据不一致 | 从库被误写 / `sql_log_bin=0` 偷跑 / 非事务表 | `pt-table-checksum` 校验 + `pt-table-sync` 修复 |

跳过事务（**只在确认这条变更可以丢弃时用**，本质是拿一致性换可用性）：

```sql
-- 非 GTID 模式
STOP REPLICA;
SET GLOBAL SQL_SLAVE_SKIP_COUNTER = 1;
START REPLICA;

-- GTID 模式：注入一个空事务占掉那个 GTID
STOP REPLICA;
SET GTID_NEXT='3e11fa47-...:88';
BEGIN; COMMIT;
SET GTID_NEXT='AUTOMATIC';
START REPLICA;
```

彻底重做复制关系：

```sql
STOP REPLICA;
RESET REPLICA ALL;        -- 清掉 relay log 和复制配置信息

-- 主库侧重置 binlog（会让所有从库断，仅在复制关系完全重建时用）
RESET MASTER;
```

### 3. 主从延迟优化

单线程回放是延迟的最大来源。MySQL 5.7+ 支持多线程复制（MTS），把一个 relay log 拆给多个 worker 并行执行：

```sql
STOP REPLICA;
SET GLOBAL replica_parallel_workers = 8;                    -- 并行线程数
SET GLOBAL replica_parallel_type = 'LOGICAL_CLOCK';         -- 按主库提交时间判断可并行
SET GLOBAL replica_preserve_commit_order = ON;              -- 保证从库提交顺序与主库一致
START REPLICA;
```

`replica_parallel_type` 两种模式：

| 模式 | 并行依据 | 效果 |
| --- | --- | --- |
| `DATABASE`（默认） | 同一个库内串行 | 单库场景等于没并行，聊胜于无 |
| `LOGICAL_CLOCK` | 主库上并发提交的事务可以并行 | 常用 |
| `WRITESET`（8.0） | 只要**改的行不冲突**就能并行 | 效果最好，需要 `binlog_transaction_dependency_tracking=WRITESET` |

除了并行，工程上更要紧的是：

- **拆主库大事务**：一个 `DELETE` 删 500 万行，从库回放必然卡住几分钟，改成 LIMIT 分批删
- **给从库更好的读盘**：从库是"写回放"密集型，SSD 收益明显
- **网络**：跨地域复制带宽和 RTT 是硬天花板，考虑级联降低从库数量
- **主库刷盘策略**：`sync_binlog` / `innodb_flush_log_at_trx_commit` 从 `1/1` 放宽到 `1000/2` 能显著提升吞吐，代价是宕机丢数据——金融场景不能动

### 4. 主从切换

手工切换（演练时用，务必先确认从库已经追平）：

```sql
-- 1) 确认从库已回放完：Retrieved_Gtid_Set == Executed_Gtid_Set
SHOW REPLICA STATUS\G

-- 2) 停止并清理复制关系
STOP REPLICA;
RESET REPLICA ALL;

-- 3) 关闭只读，正式接管写流量
SET GLOBAL read_only = OFF;
SET GLOBAL super_read_only = OFF;

-- 4) 应用侧连接串切到新 master（192.168.88.102）

-- 5) 老 master 恢复后，反向搭建以 102 为主库的复制，它变成新的 slave
```

第 1 步不能省。没追平就切，等于主动丢数据。

生产上真正要的是**自动切换**，靠组件：MHA（只支持到 5.7）、Orchestrator、或直接用 MGR + MySQL Router。MGR 我会单独写一篇。

## 七、MySQL 8.0 命令改名对照

老教程里的命令在 8.0 上一半会报错，这张表建议贴在显示器边上：

| MySQL 5.x | MySQL 8.0 |
| --- | --- |
| `CHANGE MASTER TO` | `CHANGE REPLICATION SOURCE TO` |
| `SHOW SLAVE STATUS` | `SHOW REPLICA STATUS` |
| `START SLAVE` / `STOP SLAVE` | `START REPLICA` / `STOP REPLICA` |
| `RESET SLAVE ALL` | `RESET REPLICA ALL` |
| `MASTER_POS_WAIT()` | `SOURCE_POS_WAIT()` |
| `MASTER_AUTO_POSITION=1` | `SOURCE_AUTO_POSITION=1` |
| 参数前缀 `master_*` | `source_*` |
| 参数前缀 `slave_*` | `replica_*` |

老语法大部分仍可用（会打 deprecation warning），但 8.4 已经清理了一部分，新代码一律用新写法。

## 八、速记

- 主从最少 2 台，master 写 binlog，slave 拉取并回放
- 默认**异步复制**，不维持长连接；可选同步、半同步
- master 必开 `log_bin`；slave 必开 `relay_log`；`server_id` 集群内唯一
- 三个线程：master 的 **Binlog Dump** → slave 的 **IO** → relay log → slave 的 **SQL** → 数据
- 同步数据前，slave 的 datadir 要删 `auto.cnf`，保证 `server_uuid` 唯一
- Position 复制：`CHANGE REPLICATION SOURCE TO ... SOURCE_LOG_FILE=..., SOURCE_LOG_POS=...`
- GTID 复制：`CHANGE REPLICATION SOURCE TO ... SOURCE_AUTO_POSITION=1`，dump 必须带 `--set-gtid-purged=ON`
- 复制正常的唯一判据：`Replica_IO_Running=Yes` **且** `Replica_SQL_Running=Yes`
- 从库一定开 `super_read_only`，双主/多源除外
- 延迟优化三板斧：多线程回放（WRITESET 最好）、拆主库大事务、从库换 SSD

主从搭完你会立刻发现一个新问题：**初始化一台从库太慢了**。几十 G 的库 `mysqldump` 导半个通宵，还得手工记位点、手工算 `gtid_purged`。MySQL 8 用一个 Clone 插件把这套流程压缩成一条 SQL——顺便还把高可用的 MGR 一起讲了，那是下一篇。
