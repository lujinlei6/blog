---
title: MySQL 8 克隆插件与 MGR 高可用集群搭建实战
date: 2026-09-07
description: Clone 插件怎么一条 SQL 备出从库，MGR 组复制的原理与三节点单主集群完整搭建步骤，外加 8.0.40 上那些会导致起不来的过时参数。
category: mysql
tags:
  - mysql
  - MGR
  - 高可用
  - 克隆插件
---

主从复制解决的是"数据有副本"，但 master 挂了还是要人爬起来改连接串。真正的高可用是**主库故障时，系统自己选出新主、业务无感知**。MySQL 5.7 时代这个位置属于 MHA，而 MHA 不支持 8.0——所以 8.0 的答案只有一个：MGR。

顺便还有另一件省时间的事：给集群加一台新节点，用 `mysqldump` 要跑一整晚，用 8.0.17 引入的 Clone 插件只要一条 SQL。

这篇两部分：前半讲克隆，后半从零搭一套三节点单主 MGR，最后附上我在 8.0.40 上踩过的参数坑。

## 一、MySQL 8 到底新在哪（运维视角）

| 层面 | 变化 |
| --- | --- |
| 架构与性能 | 8.0 整体优于 5.7，数据字典改成事务化的 InnoDB 表（不再有 `.frm` 文件） |
| SQL 能力 | 新增窗口函数、`WITH` 公用表表达式，明显在补 Oracle 的课 |
| 备份 | 引入 **Clone Plugin 克隆插件**，官方物理备份，可替代第三方的 XtraBackup |
| 高可用 | **MGR 组复制**替代 MHA（MHA 只支持 5.5/5.6/5.7，不支持 8.0） |

备份这条演进值得单独理一遍，因为它解释了中国企业为什么普遍用第三方工具：

```
mysqldump     逻辑备份，官方有，慢
xtrabackup    物理备份，快，但要依赖第三方 Percona
clone plugin  物理备份，8.0 官方内置，MySQL 8 独有   ← 现在
```

## 二、克隆复制：一条 SQL 做完物理备份

### 1. 概念

MySQL 8.0.17 引入 clone plugin，允许从**本地或远程**的 MySQL 实例克隆数据，本质是一种物理备份。

- **本地克隆**：把本机 MySQL 的数据目录拷贝到指定位置
- **远程克隆**：把远程主机上 MySQL 的数据目录，拷贝到本机指定位置

远程克隆涉及两个角色，务必分清谁是谁：

```
   捐献者 Donor                     接收者 Recipient
   192.168.88.101      ──克隆──►    192.168.88.104
   （被克隆的源库）                   （要装数据的机器）
   需要 BACKUP_ADMIN                需要 CLONE_ADMIN
```

### 2. 前置：安装 clone 插件

本地克隆和远程克隆都要装，**捐献者和接收者两边都装**：

```sql
INSTALL PLUGIN clone SONAME 'mysql_clone.so';

-- 验证
SELECT PLUGIN_NAME, PLUGIN_STATUS
FROM information_schema.PLUGINS WHERE PLUGIN_NAME = 'clone';
+-------------+---------------+
| PLUGIN_NAME | PLUGIN_STATUS |
+-------------+---------------+
| clone       | ACTIVE        |
+-------------+---------------+
```

想让它重启后依然在，写进 `/etc/my.cnf`（推荐，`INSTALL PLUGIN` 是动态安装，写配置文件才算持久）：

```ini
[mysqld]
plugin_load_add = 'mysql_clone.so'
```

> 如果希望"插件没装成功也别影响 MySQL 启动"，参数名前加 `loose-`：`loose_plugin_load_add = 'mysql_clone.so'`。这个技巧在 MGR 配置里同样好用。

### 3. 本地克隆

```sql
-- 建专用账号并授权
CREATE USER backup_clone@'127.0.0.1' IDENTIFIED BY 'YourPass_123';
GRANT BACKUP_ADMIN ON *.* TO backup_clone@'127.0.0.1';
GRANT SELECT ON performance_schema.clone_status TO backup_clone@'127.0.0.1';
FLUSH PRIVILEGES;
```

```bash
# 目录必须不存在或为空，且属主是 mysql
mkdir -p /data/clone_bak
chown -R mysql:mysql /data/clone_bak
```

```sql
-- 用 backup_clone 登录后执行（注意目标目录此时还不能存在）
CLONE LOCAL DATA DIRECTORY = '/data/clone_bak/20260907';
```

语法是 `CLONE LOCAL DATA DIRECTORY [=] 'clone_dir';`。两个必踩的坑：

- 克隆目录**必须不存在**（MySQL 要自己建），存在且非空直接报错
- 目录的**父目录**属主必须是 `mysql`，mysqld 对它得有写权限。用 root 建的目录忘了 chown 是最常见的失败原因

### 4. 远程克隆

**捐献者（192.168.88.101）侧：**

```sql
INSTALL PLUGIN clone SONAME 'mysql_clone.so';

CREATE USER 'donor_user'@'%' IDENTIFIED BY 'YourPass_123';
GRANT BACKUP_ADMIN ON *.* TO 'donor_user'@'%';
FLUSH PRIVILEGES;
```

**接收者侧：**

```sql
INSTALL PLUGIN clone SONAME 'mysql_clone.so';

-- 本机执行 CLONE 语句的账号
CREATE USER 'recipient_user'@'%' IDENTIFIED BY 'YourPass_123';
GRANT CLONE_ADMIN ON *.* TO 'recipient_user'@'%';
FLUSH PRIVILEGES;
```

```bash
# 接收者准备目录，同样 chown mysql
mkdir -p /data/clone_bak
chown -R mysql:mysql /data/clone_bak
```

```sql
-- 用 recipient_user 登录接收者后执行
CLONE INSTANCE FROM 'donor_user'@'192.168.88.101':3306
IDENTIFIED BY 'YourPass_123'
DATA DIRECTORY = '/data/clone_bak/20260907';
```

**`DATA DIRECTORY` 写不写，是两种完全不同的行为**，这是全文最需要记住的一点：

| 写法 | 结果 |
| --- | --- |
| **带** `DATA DIRECTORY = '/xxx'` | 克隆到该目录，本机原 datadir **不受影响**，产物只是一份备份 |
| **不带** `DATA DIRECTORY` | 直接**覆盖本机 datadir**，原数据全部丢失，且克隆完成后实例会**自动重启** |

后者才是"给集群加节点"的标准用法，但一定要在**空实例或可丢弃的实例**上执行。生产上跑着业务的库，绝对不要手滑执行不带 `DATA DIRECTORY` 的 CLONE。

### 5. 监控克隆进度

克隆是异步后台任务，通过 `performance_schema` 下两张表看：

```sql
SELECT * FROM performance_schema.clone_status;    -- 整体状态
SELECT * FROM performance_schema.clone_progress;  -- 每个阶段的进度
```

| 表 | 作用 |
| --- | --- |
| `clone_status` | 克隆目前处于什么状态：Not Started / In Progress / Completed / Failed，含起止时间和错误信息 |
| `clone_progress` | 每个阶段的执行状态、起止时间、数据量（拷贝了多少 GB / page） |

`clone_status` 里 `STATE = Failed` 时，直接看 `ERROR_NO` 和 `ERROR_TEXT`，比翻错误日志快。想中途放弃：

```sql
KILL QUERY <clone_thread_id>;    -- thread_id 从 clone_status 的 PID 列取
```

### 6. 克隆插件的五个阶段

```
Init → File Copy → Page Copy → Redo Copy → Done
```

| 阶段 | 干什么 |
| --- | --- |
| **Init** | 创建一个克隆线程，初始化克隆环境 |
| **File Copy** | 拷贝数据文件（此时业务还在写，拷出来的不是最终状态） |
| **Page Copy** | 拷贝 File Copy 期间变更的脏页——相当于 **File Copy 的增量** |
| **Redo Copy** | 拷贝 Page Copy 期间产生的 redo 日志增量 |
| **Done** | 克隆结束，销毁 Init 阶段创建的克隆线程 |

看懂这个"增量套增量"的设计，就明白为什么克隆期间主库可以照常写、最后产物还能是一致的。它和 XtraBackup 的"热拷 + prepare 应用 redo"是同一个思路，只是 MySQL 把它内置成了在线操作。

### 7. 能力边界

- 本地克隆和远程克隆的目的都是**备份**（以及快速建实例）
- **只克隆 InnoDB 引擎表的结构和数据**，其他引擎（如 MyISAM）只复制表结构，**不复制数据**
- 克隆出来的目录可以直接用来启动一个新实例，所以它最主流的用途是**快速搭建从库、MGR 节点**

## 三、MGR 组复制：原理先搞清楚

### 1. 两种架构的本质差别

| 架构 | master 故障时 |
| --- | --- |
| **主从架构**（基于 GTID 的主从复制） | 需要**用户参与**，人工切换数据库 |
| **高可用架构**（MGR） | **不需要用户参与**，系统自动完成主从切换 |

一句话讲完 MGR 的本质：**当 master 故障时，系统自动从 slave 里选一个充当新的 master。**

### 2. 为什么叫"组"

```
        ┌──── master(PRIMARY) ────┐
        │                          │
     slave01                   slave02
    (SECONDARY)               (SECONDARY)
        └──── 同一个 Group ────────┘
```

- 组内所有成员共享数据、数据一致 → **高一致性**
- master 故障时所有 slave 都能感知，通过**投票选举**出新 master → **高容错性 + 高可用性**

底层实现是 **Paxos 协议的变种**（官方叫 Virtex），保证消息的**原子投递**和**全序交付**——即所有节点收到同样的消息、且顺序相同。这是组内数据最终一致的根本保证。

四个特性侧重：**高一致性、高容错性、高扩展性、高灵活性**。

### 3. 版本对应关系

| MySQL 版本 | 高可用方案 | 备注 |
| --- | --- | --- |
| 5.5 / 5.6 / 5.7 | MHA | **不支持 MySQL 8** |
| 8.0.x（如 8.0.40） | **MGR** | 支持 5.7 和 8.0.x |

### 4. 两种模式

| 模式 | 说明 | 建议 |
| --- | --- | --- |
| **单主模式** Single-Primary | 组内只有一个主节点可写，其余只读；主库挂了自动选举 | **生产推荐**，也是默认模式 |
| 多主模式 | Multi-Primary | 组内全部可写，需注意写冲突检测，对 SQL 限制很多 |

切换参数（老写法）：

```sql
-- 单主模式（默认）
SET GLOBAL group_replication_single_primary_mode = ON;
SET GLOBAL group_replication_enforce_update_everywhere_checks = OFF;

-- 多主模式
SET GLOBAL group_replication_single_primary_mode = OFF;
SET GLOBAL group_replication_enforce_update_everywhere_checks = ON;
```

> **8.0.30 起这两个参数被废弃**，新写法是 `group_replication_mode = OFFICIAL`（单主）/ `MULTI_PRIMARY`（多主），并且只能在配置文件里设、不能 `SET GLOBAL` 动态改。8.0.40 上老参数仍可用但会打 warning。

## 四、从零搭建三节点单主 MGR

### 环境规划

| 节点 | 主机名 | IP | server_id | 角色 |
| --- | --- | --- | --- | --- |
| node1 | mgr01 | 192.168.88.101 | 1 | 引导节点（首个 PRIMARY） |
| node2 | mgr02 | 192.168.88.102 | 2 | SECONDARY |
| node3 | mgr03 | 192.168.88.103 | 3 | SECONDARY |

软件：MySQL 8.0.40，**三台版本必须完全一致**，单主模式。

### 步骤 1：环境准备（三台都执行）

```bash
# 关防火墙和 SELinux（实验环境做法，生产要改为放行 33061 端口）
systemctl stop firewalld
systemctl disable firewalld
setenforce 0
sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 主机名解析，三台都加
cat >> /etc/hosts <<'EOF'
192.168.88.101 mgr01
192.168.88.102 mgr02
192.168.88.103 mgr03
EOF

# 分别设置主机名
hostnamectl set-hostname mgr01    # node2 用 mgr02，node3 用 mgr03
```

MGR 走的是组通信协议，**默认端口 33061**（不是 3306）。生产环境正确的做法是放行它而不是关防火墙：

```bash
firewall-cmd --permanent --add-port=33061/tcp
firewall-cmd --reload
```

### 步骤 2：三台安装 MySQL 8

```bash
yum localinstall -y https://dev.mysql.com/get/mysql80-community-release-el7-5.noarch.rpm
yum install -y mysql-community-server
systemctl enable --now mysqld

grep 'temporary password' /var/log/mysqld.log
```

改密码，测试环境顺手降一下密码策略：

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Root@123456';
SET GLOBAL validate_password.policy = 0;
SET GLOBAL validate_password.length = 4;
```

> **三台的 `server_uuid` 必须互不相同。** 默认由 MySQL 在 datadir 的 `auto.cnf` 里自动生成，不用管；但如果你的节点是**克隆或整盘拷贝**出来的，务必逐台检查 `SHOW VARIABLES LIKE 'server_uuid';`，撞了就直接 `systemctl stop mysqld && rm /var/lib/mysql/auto.cnf && systemctl start mysqld` 让它重新生成。这是"MGR 加入失败"最常见的原因。

### 步骤 3：配置 my.cnf

三台只有 `server_id` 和 `group_replication_local_address` 不同，其余完全一致。

```ini
[mysqld]
datadir=/var/lib/mysql
socket=/var/lib/mysql/mysql.sock
log_error=/var/log/mysqld.log
pid_file=/var/run/mysqld/mysqld.pid

# ---------- 基础复制参数（MGR 强制依赖 GTID）----------
server_id=1
gtid_mode=ON
enforce_gtid_consistency=ON

# ---------- 二进制日志：MGR 强制要求 ----------
log_bin=binlog
binlog_format=ROW
binlog_row_image=FULL           # 必须是 FULL，MGR 硬性要求
log_slave_updates=ON
relay_log=relay_log

# ---------- MGR 参数 ----------
# 加载组复制插件
plugin_load_add='group_replication.so'

# 组名：一个 UUID，三台必须完全一致，用 uuidgen 生成
group_replication_group_name="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 本节点的组通信地址（每台不同）
group_replication_local_address="mgr01:33061"

# 组内所有种子节点地址（三台相同）
group_replication_group_seeds="mgr01:33061,mgr02:33061,mgr03:33061"

# 是否引导组：只有首节点启动那一刻临时置 ON，其余时间必须 OFF
group_replication_bootstrap_group=OFF

# 启动时不自动加入组，避免各节点启动顺序导致的报错
group_replication_start_on_boot=OFF

# 单主模式
group_replication_single_primary_mode=ON
group_replication_enforce_update_everywhere_checks=OFF
```

node2 改这两行：

```ini
server_id=2
group_replication_local_address="mgr02:33061"
```

node3 改这两行：

```ini
server_id=3
group_replication_local_address="mgr03:33061"
```

> **参数版本提醒（8.0.40 实测）**
> 网上大量 MGR 教程会给你下面这几行，在 8.0.40 上**会导致 mysqld 起不来**：
>
> ```ini
> # 8.0.23 废弃，8.0.34 已移除：TABLE 成为唯一实现，直接删掉这两行
> master_info_repository=TABLE
> relay_log_info_repository=TABLE
>
> # 8.0.26 废弃：8.0 默认就是 XXHASH64，且 MGR 不再要求手工设置，可以省略
> transaction_write_set_extraction=XXHASH64
> ```
>
> 报错长这样：`unknown variable 'master_info_repository=TABLE'`。mysqld 起不来时**第一件事就是 `tail /var/log/mysqld.log`**，这类参数错误写得非常明确。
>
> 还有一个更容易中招的：早期教程里的 **`binlog_row_image=MINIMAL`**。MGR 要求**必须为 FULL**，设成 MINIMAL 时 `START GROUP_REPLICATION` 会直接报 `Group replication requires binlog_row_image to be FULL`。

重启三台并确认插件加载成功：

```bash
systemctl restart mysqld
```

```sql
SHOW PLUGINS;
-- 应能看到 group_replication | ACTIVE | GROUP REPLICATION | group_replication.so
```

`plugin_load_add` 是"加载并写入 mysql.plugin 表持久化"，下次重启仍在，所以这个 `INSTALL PLUGIN` 其实可省；配 `plugin_load` 则每次启动加载但不入库，两种都常见。

生成组名 UUID：

```bash
uuidgen
# 7a3f1c2d-9b4e-4f6a-8c1d-2e5f7a9b0c1e  ← 填进三台的 group_replication_group_name
```

### 步骤 4：创建复制用户（三台都执行）

MGR 节点加入组时，要通过 **recovery 通道**从已有节点拉取增量数据（走的正是 clone/binlog 那套机制），所以需要一个复制账户。

```sql
-- 关键：先关掉 binlog，否则建账号这条语句会被记录并传播到其他节点，
-- 而那个节点上可能已经存在同名账号 → 直接报"用户已存在"导致复制中断
SET SQL_LOG_BIN = 0;

CREATE USER repl@'%' IDENTIFIED BY 'Repl@123456';
GRANT REPLICATION SLAVE ON *.* TO repl@'%';
GRANT BACKUP_ADMIN    ON *.* TO repl@'%';   -- clone recovery 需要
GRANT CLONE_ADMIN     ON *.* TO repl@'%';   -- 8.0 克隆/MGR 相关权限
FLUSH PRIVILEGES;

SET SQL_LOG_BIN = 1;
```

> `SET SQL_LOG_BIN=0` 只在**集群还没组建起来之前**（每个节点手工初始化账号时）使用。集群正常运行后禁止再用它偷跑 DDL/DML——那会造成各节点数据静默分叉，而 MGR 不会告诉你。
> 另外 GTID 模式下事务内不允许 `sql_log_bin=0`，必须在事务外执行。

### 步骤 5：配置 recovery 通道（三台都执行）

给 `group_replication_recovery` 这个专用通道指定上面建的账号：

```sql
CHANGE REPLICATION SOURCE TO
  SOURCE_USER='repl',
  SOURCE_PASSWORD='Repl@123456'
  FOR CHANNEL 'group_replication_recovery';
```

老版本兼容写法：

```sql
CHANGE MASTER TO MASTER_USER='repl', MASTER_PASSWORD='Repl@123456'
  FOR CHANNEL 'group_replication_recovery';
```

也可以不写这条，改为启动时临时指定，避免密码明文留在 `mysql.slave_master_info` 表里：

```sql
START GROUP_REPLICATION USER='repl', PASSWORD='Repl@123456';
```

### 步骤 6：在 node1 引导启动组

**只有第一个节点**要 bootstrap，其余节点绝对不能开：

```sql
-- 开启引导模式（仅首节点）
SET GLOBAL group_replication_bootstrap_group = ON;

-- 启动组复制
START GROUP_REPLICATION;

-- 立刻关掉！否则该节点重启时会再引导一次，把已有组覆盖掉，造成脑裂
SET GLOBAL group_replication_bootstrap_group = OFF;
```

第三步**必须紧接着执行**。"bootstrap 忘记关"是 MGR 最常见的自杀方式：节点重启后它认为自己要新建一个组，于是把在线状态清零，其他两个节点被踢出去。

查看组成员：

```sql
SELECT * FROM performance_schema.replication_group_members;
+---------------------------+--------------------------------------+-------------+-------------+--------------+
| CHANNEL_NAME              | MEMBER_ID                            | MEMBER_HOST | MEMBER_PORT | MEMBER_STATE |
+---------------------------+--------------------------------------+-------------+-------------+--------------+
| group_replication_applier | 8a1c...-...                          | mgr01       |        3306 | ONLINE       |
+---------------------------+--------------------------------------+-------------+-------------+--------------+
```

`MEMBER_STATE = ONLINE` 表示节点在线且数据已追平。

### 步骤 7：node2、node3 加入组

不要 bootstrap，直接加：

```sql
START GROUP_REPLICATION;
```

刚加进来时状态是 `RECOVERING`（正在通过 recovery 通道同步数据），追平后变 `ONLINE`。**三台都为 ONLINE 即集群搭建成功。**

```sql
SELECT MEMBER_HOST, MEMBER_ROLE, MEMBER_STATE
FROM performance_schema.replication_group_members;
+-------------+-------------+--------------+
| MEMBER_HOST | MEMBER_ROLE | MEMBER_STATE |
+-------------+-------------+--------------+
| mgr01       | PRIMARY     | ONLINE       |
| mgr02       | SECONDARY   | ONLINE       |
| mgr03       | SECONDARY   | ONLINE       |
+-------------+-------------+--------------+
```

### 步骤 8：确认主节点与读写状态

```sql
-- 谁是主
SELECT MEMBER_HOST, MEMBER_ROLE FROM performance_schema.replication_group_members;

-- 本节点是否可写
SELECT @@read_only, @@super_read_only;
```

单主模式下：主节点 `@@read_only = 0`，从节点 `@@read_only = 1`。**这是 MGR 自己管理的**，不要手工去改它，改了会被组覆盖或直接触发节点被踢。

补充一个实用点：单主模式下谁是 PRIMARY，默认是**最早加入组的那个节点**。想让某台性能好的机器优先当主，调权重：

```sql
-- 8.0.2 起，值越大越优先被选为主（在 Secondary 之间比较）
SET GLOBAL group_replication_member_weight = 80;
```

### 步骤 9：功能验证

在 PRIMARY（node1）建数据：

```sql
CREATE DATABASE mgr_test;
USE mgr_test;
CREATE TABLE t1 (id INT PRIMARY KEY, name VARCHAR(20));
INSERT INTO t1 VALUES (1,'mgr01'),(2,'mgr02'),(3,'mgr03');
COMMIT;
```

在 node2、node3 验证：

```sql
SELECT * FROM mgr_test.t1;
```

三台数据完全一致即组复制正常。可以再往深一层验证冲突检测——同时在 node1 和 node2 更新同一行，后提交的那个会被 MGR 判定为写冲突并回滚，这正是 `transaction_write_set_extraction` 在背后做的事。

### 步骤 10：故障切换测试

模拟主库宕机：

```bash
# node1 上
systemctl stop mysqld
```

在 node2 / node3 上观察：

```sql
SELECT MEMBER_HOST, MEMBER_ROLE, MEMBER_STATE
FROM performance_schema.replication_group_members;
```

会看到 mgr01 变成 `UNREACHABLE` 或直接从列表消失，组内投票选举出新的 PRIMARY（比如 mgr02）。

新主节点验证可写：

```sql
-- 在 mgr02 上
INSERT INTO mgr_test.t1 VALUES (4,'after_failover');
COMMIT;
```

node1 恢复后重新入组：

```bash
systemctl start mysqld
```

```sql
-- 因为配了 start_on_boot=OFF，需要手工启动
START GROUP_REPLICATION;

-- 会以 SECONDARY 角色重新加入（新主不会自动让位）
SELECT * FROM performance_schema.replication_group_members;
```

> 想让节点重启后自动回组，把 `group_replication_start_on_boot` 设为 `ON`。但要清楚副作用：整组全停再逐个启动时，它会在没有任何成员的情况下尝试加入，第一台必然启动失败——所以推荐保持 OFF，或只给 Secondary 节点开 ON、引导节点保持 OFF。
> 另外注意 MGR **不做自动回切**：mgr01 复活后是 SECONDARY，mgr02 继续当主。这是有意设计，避免来回切换抖动业务。

## 五、常见问题与排错

### 1. 节点一直卡在 RECOVERING

基本是 recovery 通道连不上 donor 节点：

```sql
SHOW REPLICA STATUS FOR CHANNEL 'group_replication_recovery'\G
-- 重点看 Last_IO_Errno / Last_IO_Error
tail -f /var/log/mysqld.log
```

排查顺序：复制账号密码错 → repl 账号 host 限制不含本机 IP → 防火墙没放行 33061 → 该账号缺 `BACKUP_ADMIN`（走 clone recovery 时需要）→ donor 节点本身不是 ONLINE。

### 2. 节点状态 ERROR / 加入失败

先查 `server_uuid` 是否重复：

```sql
SHOW VARIABLES LIKE 'server_uuid';
```

三台必须不同。克隆出来的节点最容易撞——删掉 datadir 下的 `auto.cnf` 重启即可重新生成。

### 3. ERROR 3092 / 3093 / 3096

| 错误 | 原因 |
| --- | --- |
| `ERROR 3092` | 配置无效，多为 `group_replication_local_address` 重复或本机解析不到 |
| `ERROR 3093` | 收到的消息来自组内另一个成员使用了自己的地址，即 `local_address` 配重了 |
| `ERROR 3096` | 组配置不一致，典型是 `group_replication_group_name` 三台不一样、或 `binlog_format`/`binlog_row_image` 不是 ROW/FULL |

处理办法就一条：把三台的 `group_name`、`group_seeds`、`binlog_format`、`binlog_row_image` 逐字符核对一遍。

### 4. ERROR 1126：无法加载 group_replication.so

```sql
INSTALL PLUGIN group_replication SONAME 'group_replication.so';
```

再检查 `my.cnf` 里 `plugin_load_add` 拼写是否正确，然后重启 mysqld。Linux 上插件文件名带 `.so`，Windows 是 `.dll`，从网上抄的配置忘了改后缀也会报这个。

### 5. 多主模式下的冲突报错

多主模式下并发更新同一行会触发写冲突检测，报 `ERROR ... Lookup failed because row not found` 或类似 `ER_LOCK_DEADLOCK` 的死锁错误。业务上必须**避免热点行并发更新**，否则多主带来的只有麻烦。

### 6. 集群全挂后如何恢复

如果三台**全部**停掉（比如整个机房断电重启），组已不存在，此时任何一台都加入不了。必须挑一台数据最新的做引导：

```sql
-- 在被选定的那台上
SET GLOBAL group_replication_bootstrap_group = ON;
START GROUP_REPLICATION;
SET GLOBAL group_replication_bootstrap_group = OFF;

-- 其余两台正常 START GROUP_REPLICATION 加入
```

引导前务必确认这台的 `gtid_executed` 是最全的，选错节点等于丢数据。极端情况下可以用 `SET GLOBAL gtid_purged` 强制对齐，但那是最后手段。

## 六、把克隆和 MGR 结合：快速加一个新节点

数据量大时，用 `mysqldump` + `CHANGE MASTER` 给 MGR 加节点会慢到怀疑人生。换成克隆，整个过程大致十分钟：

**1. 新节点装好 MySQL 8，配好 `/etc/my.cnf`**

与前文配置一致，只改：

```ini
server_id=4
group_replication_local_address="mgr04:33061"
```

同时把 `group_replication_group_seeds` 也更新成含 mgr04 的完整列表（三台老节点同样要更新这一项，然后重启）。

**2. 新节点安装 clone 插件、建账号**

```sql
INSTALL PLUGIN clone SONAME 'mysql_clone.so';
CREATE USER 'recipient_user'@'%' IDENTIFIED BY 'YourPass_123';
GRANT CLONE_ADMIN ON *.* TO 'recipient_user'@'%';
```

**3. 在老节点上准备好 donor 账号**（若已有 `repl` 且带 `BACKUP_ADMIN`，可以直接复用）

```sql
CREATE USER 'donor_user'@'%' IDENTIFIED BY 'YourPass_123';
GRANT BACKUP_ADMIN ON *.* TO 'donor_user'@'%';
```

**4. 在新节点执行远程克隆，从组内任一 ONLINE 节点拉全量**

```sql
-- 用 recipient_user 登录新节点
SET GLOBAL clone_valid_donor_list = 'mgr01:3306';   -- 白名单：只允许从这台克隆

CLONE INSTANCE FROM 'donor_user'@'192.168.88.101':3306
IDENTIFIED BY 'YourPass_123';
```

不写 `DATA DIRECTORY` → 直接覆盖本机 datadir → **克隆完成后实例自动重启**。重启前记得把 `auto.cnf` 的问题处理掉：新节点现在带着 donor 的 uuid 起来了。

```bash
systemctl stop mysqld
rm -f /var/lib/mysql/auto.cnf
systemctl start mysqld
```

**5. 重新配置 recovery 通道并加入组**

```sql
CHANGE REPLICATION SOURCE TO
  SOURCE_USER='repl',
  SOURCE_PASSWORD='Repl@123456'
  FOR CHANNEL 'group_replication_recovery';

START GROUP_REPLICATION;

SELECT * FROM performance_schema.replication_group_members;
```

`clone_valid_donor_list` 这一行很容易被漏掉，但它是**安全必需**的：不设置就默认允许从任意主机克隆，等于给"把别处的数据覆盖到你库里"开了门。

## 七、知识点速记

- **克隆复制**：8.0.17 引入，官方物理备份，用于替代 xtrabackup，分本地/远程两种，**只克隆 InnoDB 数据**
- **本地克隆**：`CLONE LOCAL DATA DIRECTORY = 'dir'`，需要 `BACKUP_ADMIN`；目标目录必须不存在且属主为 mysql
- **远程克隆**：`CLONE INSTANCE FROM 'user'@'host':port IDENTIFIED BY 'pwd'`，捐献者要 `BACKUP_ADMIN`，接收者要 `CLONE_ADMIN` + `clone_valid_donor_list`
- **写不写 `DATA DIRECTORY`**：写了是备份到别处，不写是覆盖本机 datadir 并自动重启
- **克隆监控**：`performance_schema.clone_status`（状态）、`clone_progress`（各阶段进度）
- **克隆五阶段**：Init → File Copy → Page Copy（File Copy 的增量）→ Redo Copy（Page Copy 的增量）→ Done
- **MGR**：Paxos 变种（Virtex）实现组通信，保证原子投递与全序交付；组内自动选举，替代 MHA，支持 5.7 / 8.0.x
- **MGR 硬性参数**：`gtid_mode=ON`、`enforce_gtid_consistency=ON`、`log_bin`、`binlog_format=ROW`、**`binlog_row_image=FULL`**、`log_slave_updates=ON`、`plugin_load_add='group_replication.so'`、三台 `group_name` 一致 + `server_id`/`local_address`/`server_uuid` 各不相同
- **启动顺序**：首节点 `bootstrap=ON` → `START GROUP_REPLICATION` → **立刻** `bootstrap=OFF`；其余节点直接 `START GROUP_REPLICATION`
- **单主模式**一写多读（默认推荐），**多主模式**多写但要处理写冲突
- **看集群状态**：`performance_schema.replication_group_members`，关注 `MEMBER_STATE` 全部 `ONLINE`、`MEMBER_ROLE` 有且仅有一个 `PRIMARY`
- **MGR 不会自动回切**，老主恢复后以 SECONDARY 身份加入

到这里 MySQL 高可用这条线就走通了：备份还原保证"数据丢不了"，主从复制保证"数据有副本"，Clone 保证"副本秒级就位"，MGR 保证"主库挂了自动切"。剩下的课题是 MGR 之上怎么对外提供统一入口——那是 MySQL Router / ProxySQL 加读写分离路由的故事，等我把这套东西在生产上再跑半年，单独写一篇。
