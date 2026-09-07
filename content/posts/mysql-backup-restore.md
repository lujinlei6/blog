---
title: MySQL 备份与还原实战：mysqldump、binlog 增量与 XtraBackup
date: 2026-09-07
description: 逻辑备份和物理备份怎么选，mysqldump 三个级别怎么备，binlog 怎么配合做增量恢复，大库为什么必须换 XtraBackup——附一次完整的误删恢复演练。
category: mysql
tags:
  - mysql
  - 备份恢复
  - 运维
---

备份这件事，没出事故之前所有人都觉得烦，出事故之后所有人都恨自己上周少跑了一次脚本。而比"有没有备份"更要命的是"**备份能不能恢复出来**"——没做过恢复演练的备份，等于没有备份。

这篇讲清三件事：备份的核心是什么、mysqldump 和 XtraBackup 各自在什么场合用、以及 binlog 怎么把"恢复到昨晚"变成"恢复到删库前一分钟"。

## 一、先搞清楚：你到底在备份什么

数据库备份，是把数据库里的数据复制一份存起来，以便数据丢失或损坏时能恢复。但很多人以为"把 `/var/lib/mysql` 拷走就行了"，这只对了三分之一。

MySQL 实例的完整状态由**三样东西**构成：

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| **数据文件** | yum 安装：`/var/lib/mysql`<br>自定义安装：`/export/server/mysql/data` | 真正的表和行数据 |
| **配置文件** | `/etc/my.cnf` | 参数、日志路径、binlog 开关等，机器挂了没它你起不来 |
| **日志文件** | binlog 二进制日志 | 记录所有**事务型操作**（增删改），增量恢复全靠它 |

`/etc/my.cnf` 最容易被忽略。我见过重装系统后 datadir 拷回来了，结果因为没备份配置文件，`innodb_log_file_size`、`lower_case_table_names` 全对不上，硬是起不来。

### 备份方式分两大类

| | 逻辑备份 | 物理备份 |
| --- | --- | --- |
| 工具 | `mysqldump` | `XtraBackup` / Clone 插件 |
| 备份产物 | 一串 SQL 语句（`.sql` 文件） | 数据文件本身（+ 日志 + 配置） |
| 可读性 | 强，文本可查可改，能跨版本跨平台迁移 | 不可读，且**绑定 MySQL 版本和平台** |
| 速度 | 慢（要导出成 SQL 再一条条插回去） | 快（直接拷文件） |
| 粒度 | 全库 / 指定库 / 指定表，可以只恢复一张表 | 通常整实例级别 |
| 适用 | **中小型数据库**、迁移、需要部分恢复 | **大规模数据库**、生产热备 |

一句话选择：**几个 G 用 mysqldump，几十上百 G 用物理备份**。

### 和存储引擎的关系

备份前还得知道表是什么引擎，因为它直接影响 `--single-transaction` 好不好使：

| 引擎 | 擅长 | 特性 |
| --- | --- | --- |
| InnoDB | **数据安全** | 支持事务、外键、**行级锁** → 可以做一致性热备 |
| MyISAM | **查询速度** | 表级锁、全文索引，查询相对更快 → 不支持事务，热备会拿到不一致数据 |

## 二、mysqldump 逻辑备份

### 1. 它是 Linux 命令，不是 SQL

这个认知坑新人必踩：`mysqldump` 是**操作系统层面的可执行程序**，所以**不能在 `mysql>` 终端里执行**，必须回到 Linux shell 里敲。反过来，恢复时用的 `source` 才是 mysql 终端内的命令。

### 2. 执行原理

```
mysqldump 连接 MySQL
   → 按库/表读取表结构，生成 CREATE TABLE 语句
   → 逐行读取数据，生成 INSERT INTO 语句（或扩展插入）
   → 全部写成一个 .sql 文本文件
```

所以备份文件本质就是一段可以重放的 SQL。你可以直接 `vim` 打开看，也能只拷贝里面某一张表的语句单独恢复——这就是逻辑备份"可读性强、可部分恢复"的来源。

### 3. 三个级别的备份

**表级（最小粒度）**

```bash
mysqldump -uroot -p db_test 数据表1 数据表2 > /tmp/sqlbak/tables.sql
```

**指定库（中等粒度）**——用 `--databases`，注意它会连带写出 `CREATE DATABASE` 和 `USE` 语句

```bash
mysqldump -uroot -p --databases db1 db2 db3 > /tmp/sqlbak/databases.sql
```

不加 `--databases` 直接 `mysqldump -uroot -p db1 db2 > x.sql` 是错的：MySQL 会把 `db1` 当库名、把 `db2` 当**表名**，报错找不到表。

**全库级（最大粒度）**

```bash
mysqldump -uroot -p --all-databases \
  --single-transaction \
  --master-data=2 \
  --routines --triggers --events \
  --default-character-set=utf8mb4 \
  > /tmp/sqlbak/all.sql
```

关键参数逐个说清，这是能不能恢复出一致数据的关键：

| 参数 | 作用 | 不加会怎样 |
| --- | --- | --- |
| `--single-transaction` | 备份开始时开一个一致性快照事务，**不加全局读锁**，备份期间业务照常写 | MyISAM/InnoDB 混合场景可能拿到不一致数据 |
| `--master-data=2` | 把备份时的 binlog 文件名和位点写进 SQL 文件（`=2` 是注释形式，`=1` 是直接可执行） | 增量恢复和搭从库时你不知道从哪个位点开始 |
| `--routines` | 备份存储过程与函数 | 恢复后函数全丢 |
| `--triggers` | 备份触发器（默认就开，写上是保险） | 触发器丢失 |
| `--events` | 备份事件调度器里的定时任务 | 定时任务丢失 |
| `--set-gtid-purged=ON` | GTID 模式下必须加，把 GTID 集合写入文件 | 搭从库时 GTID 对不上 |
| `--flush-logs` | 备份前切一个新 binlog | 增量位点和全备混在一个文件里，恢复时不好切 |

> **两个坑**
> ① `--single-transaction` 只对 InnoDB 有效。表里有 MyISAM 的话，要么改成加锁备份（`--lock-all-tables`，业务会短暂阻塞），要么先把引擎转成 InnoDB。
> ② 备份期间**不要执行 DDL**。`--single-transaction` 保证的是数据一致性，不保证结构不变，`ALTER TABLE` 会让备份直接失败或产生错乱。
> ③ MySQL 8.0.26 起 `--master-data` 已被 `--source-data` 取代（8.4 里彻底移除），新写法是 `--source-data=2 --source-info=...`。8.0.40 上两者都能用，习惯新写法更稳。

### 4. 恢复数据

恢复有两条路，一条在 shell，一条在 mysql 终端：

```bash
# 方式一：Linux 终端直接重定向
mysql -uroot -p < /tmp/sqlbak/databases.sql

# 指定恢复到某个库（用于单表/单库文件）
mysql -uroot -p db_test < /tmp/sqlbak/tables.sql
```

```sql
-- 方式二：进入 mysql 终端用 source（会实时显示进度，大文件更推荐）
SOURCE /tmp/sqlbak/databases.sql
```

两者区别：`mysql < file` 由 shell 重定向，快但没进度；`source` 在客户端里逐条读，能看到执行到哪，且**当前库的选定状态会保留**。

恢复前如果目标库已经有一堆脏数据，先手动清掉：

```sql
DROP DATABASE IF EXISTS db_test;
```

## 三、binlog：把增量捡回来

### 1. 为什么必须有它

mysqldump 只能做全量备份。假设你凌晨 3 点全备了一次，上午 10 点开发把表 `drop` 了——只用全备恢复，等于**一夜之间的业务数据全丢**。

binlog（归档日志）记录的就是这 7 个小时里所有**增删改**操作。全备 + binlog 增量重放，才能把数据尽可能往回拉。

前提：binlog 得先开着。

```ini
[mysqld]
log_bin                      = mysql-bin      # 开启，同时指定文件名前缀
binlog_format                = ROW            # 强烈建议 ROW
binlog_expire_logs_seconds   = 1209600        # 保留 14 天，别设 0 永久保留
max_binlog_size              = 256M           # 单文件上限，到点自动切
sync_binlog                  = 1              # 每次提交刷盘，金融级才设 1
```

```sql
SHOW VARIABLES LIKE 'log_bin%';
SHOW MASTER STATUS;                 -- 查看当前 binlog 文件和位点
SHOW BINARY LOGS;                   -- 列出所有 binlog 文件
PURGE BINARY LOGS TO 'mysql-bin.000010';   -- 清理 10 号之前的旧日志
```

三种格式怎么选：

| 格式 | 记录内容 | 优缺点 |
| --- | --- | --- |
| STATEMENT | 记录的 SQL 语句本身 | 省空间，但 `now()`、`rand()` 之类会导致主从不一致 |
| **ROW** | 记录每一行数据变更前后 | 体积大，但**结果绝对准确**，做增量恢复/从库都靠它 |
| MIXED | MySQL 自己判断用哪种 | 折中，偶尔有惊喜 |

生产上无脑选 `ROW`。

### 2. 一次完整的误删恢复演练

场景：14:30 有人执行了 `DROP TABLE student;`，你要把这张表找回来。

**第 1 步：立刻保护现场**

```sql
-- 先切一个新 binlog，把故障之后的写入隔离出去，避免继续混在同一个文件里
FLUSH LOGS;
```

**第 2 步：从全备里找到基准位点**

全备文件开头有这行注释（就是 `--master-data=2` 写进去的）：

```sql
-- CHANGE MASTER TO MASTER_LOG_FILE='mysql-bin.000023', MASTER_LOG_POS=154;
```

意思是：这份全备包含了 `mysql-bin.000023` 文件 154 位点**之前**的所有数据。

**第 3 步：恢复全备**

```bash
mysql -uroot -p db_test < /backup/full_$(date +%F).sql
```

**第 4 步：用 mysqlbinlog 重放全备之后、误删之前的增量**

```bash
mysqlbinlog --no-defaults \
  --start-position=154 \
  --stop-position=88213 \
  /var/lib/mysql/mysql-bin.000023 \
  | mysql -uroot -p
```

`--stop-position` 就是那个 `DROP TABLE` 语句**前面**的位点。怎么找到它？先把 binlog 转成文本翻：

```bash
mysqlbinlog --no-defaults --base64-output=DECODE-ROWS -v \
  /var/lib/mysql/mysql-bin.000023 > /tmp/binlog.sql

grep -n -i "DROP TABLE" /tmp/binlog.sql
# 找到那一行上面的 ### at ... 就是这个事件起始位点，取它的上一个
```

也可以不用位点、直接按**时间点**恢复到误删前一秒：

```bash
mysqlbinlog --no-defaults \
  --start-datetime="2026-09-07 03:00:00" \
  --stop-datetime="2026-09-07 14:29:55" \
  /var/lib/mysql/mysql-bin.000023 \
  | mysql -uroot -p
```

跨多个 binlog 文件时，把文件一次性传给 mysqlbinlog，顺序必须是文件名升序：

```bash
mysqlbinlog --no-defaults mysql-bin.000023 mysql-bin.000024 > /tmp/incr.sql
```

**第 5 步：核对数据**

```sql
SELECT COUNT(*), MAX(id) FROM student;
```

> 这套"全备 + binlog 重放"就是所谓**增量备份恢复**。恢复的准确度和 binlog 保留时长直接挂钩——`binlog_expire_logs_seconds` 设成一天的话，超过一天的事故就只能回到"最近一次全备"的时间点，中间的改动全丢。所以生产上 binlog 至少保留 7~14 天，并且**binlog 要和全备分开异地存放**，否则机器一起丢就一起没了。

## 四、XtraBackup 物理备份

### 1. 什么时候必须上它

mysqldump 慢在哪？它要把每行数据转成 `INSERT` 文本，恢复时再把 SQL 一条条解析执行，等于**把整个库重写一遍**。几百 G 的库，导出+导入跑十几小时是常事。

物理备份直接拷贝数据文件，快得多，恢复就是"把文件放回去 + crash recovery"。生产上 MySQL 物理备份 **90% 以上用的是 XtraBackup**。

它是 Percona 开发的开源工具，注意版本对应关系，装错版本直接报错：

| MySQL 版本 | XtraBackup 版本 |
| --- | --- |
| 5.5 / 5.6 / 5.7 | **2.4**（经典版） |
| 8.0.x | **8.0 / 8.4**（必须用这个，2.4 不支持 8.0 的新红页格式） |

### 2. 安装：为什么用 yum 不用 rpm

```bash
# 传统方式：不解决依赖，得自己手工补齐
rpm -ivh percona-xtrabackup-80-8.0.34-1.el7.x86_64.rpm

# 推荐方式：yum/dnf 会自动下载安装缺失的依赖
yum localinstall -y percona-xtrabackup-80-8.0.34-1.el7.x86_64.rpm
```

在有网络的环境下，一律用 `yum/dnf install 软件包.rpm`。这也是这两个命令最实用的差别。

### 3. 为什么要建一个专门的备份账号

以前的操作我们习惯直接 root，但备份脚本往往跑在很多台机器上、密码写在 crontab 里，**root 权限过高，一旦泄露整个实例就没了**。

正确姿势是备份需要什么权限就给什么权限：

```sql
CREATE USER 'bkp'@'localhost' IDENTIFIED BY 'Bkp@123456';

GRANT BACKUP_ADMIN ON *.* TO 'bkp'@'localhost';   -- 8.0 必需
GRANT PROCESS      ON *.* TO 'bkp'@'localhost';   -- 看 show engine innodb status
GRANT RELOAD       ON *.* TO 'bkp'@'localhost';   -- flush privileges
GRANT LOCK TABLES  ON *.* TO 'bkp'@'localhost';
GRANT REPLICATION SLAVE ON *.* TO 'bkp'@'localhost';  -- 备份时记录 binlog 位点
FLUSH PRIVILEGES;
```

MySQL 8.0 里 `BACKUP_ADMIN` 是新增的动态权限，专门管物理备份，8.0.22 之后 XtraBackup 就靠它而不是 SUPER。**这是 8.0 备份最容易踩的坑**：只给老权限组合，XtraBackup 会报 `ACCESS DENIED`。

### 4. 全量备份与恢复

```bash
# 全量备份（热备，不锁表，业务照常）
xtrabackup --backup \
  --user=bkp --password='Bkp@123456' \
  --target-dir=/backup/full/20260907

# 准备（prepare）：把备份期间产生的 redo 应用到数据文件，让它变成一致状态
# 这一步不能省，跳过 prepare 的备份是不可用的
xtrabackup --prepare --target-dir=/backup/full/20260907
```

`prepare` 的原理：XtraBackup 拷文件时业务还在写，所以拷出来的 ibd 文件是"脏"的，末尾跟着备份期间产生的 redo log。`--prepare` 就是跑一次 **crash recovery**，把 redo 应用进去、把未提交的事务回滚掉，让数据变得自洽。

恢复方式二选一：

```bash
# 方式 A：拷回去（注意先停 mysqld，且 datadir 必须为空）
systemctl stop mysqld
rm -rf /var/lib/mysql/*
xtrabackup --copy-back --target-dir=/backup/full/20260907
chown -R mysql:mysql /var/lib/mysql
systemctl start mysqld

# 方式 B：用自带脚本 move-back（更快，是移动不是拷贝）
xtrabackup --move-back --target-dir=/backup/full/20260907
```

> 恢复后**属主一定要 `chown -R mysql:mysql`**，否则 mysqld 起不来，日志里报 `Permission denied`。这是 XtraBackup 恢复最经典的第二个坑。

MySQL 8.0.26+ 还可以直接 `xtrabackup --remote-copy-back` 走网络恢复，不用先落本地。

### 5. 增量备份

增量备份的产物只有"自上次备份以来变化的页"，所以必须**基于**上一次全备：

```bash
# ① 全备（基线）
xtrabackup --backup --user=bkp -p'Bkp@123456' --target-dir=/backup/base

# ② 第一次增量：基于全备
xtrabackup --backup --user=bkp -p'Bkp@123456' \
  --incremental-basedir=/backup/base \
  --target-dir=/backup/inc1

# ③ 第二次增量：基于 inc1（链式往下接，不能又指回 base）
xtrabackup --backup --user=bkp -p'Bkp@123456' \
  --incremental-basedir=/backup/inc1 \
  --target-dir=/backup/inc2
```

恢复时先按顺序把增量**合并**进全备，`--redo-only` 表示"只应用 redo、先不回滚未提交事务"（因为后面还有增量要接）：

```bash
xtrabackup --prepare --apply-log-only --target-dir=/backup/base
xtrabackup --prepare --apply-log-only --target-dir=/backup/base --incremental-dir=/backup/inc1

# 最后一个增量不加 --redo-only，让未提交事务在这里回滚掉
xtrabackup --prepare --target-dir=/backup/base --incremental-dir=/backup/inc2

xtrabackup --copy-back --target-dir=/backup/base
```

`--apply-log-only` 用在**除最后一步以外**的所有 prepare 上，这是增量恢复唯一需要死记的规则。写错了不会报很明显的错，只会恢复出一个状态不对的库。

## 五、Clone 插件：MySQL 8 的官方物理备份

顺带提一下，因为这是 8.0 最值得关注的变化。以前物理备份必须依赖第三方 XtraBackup，MySQL 8.0.17 起官方内置了 **Clone Plugin**，本地克隆、远程克隆都支持：

```sql
-- 远程克隆：把 101 上的实例整个拉到本机
CLONE INSTANCE FROM 'donor_user'@'192.168.88.101':3306
IDENTIFIED BY '123';
```

它的定位不只是备份，更是**快速搭建从库 / MGR 节点**的标准手段。具体语法、权限要求、四个执行阶段和踩坑，我放在《MySQL 8 克隆插件与 MGR 高可用集群》那篇里展开。

## 六、一套能落地的备份策略

最后把上面的东西收敛成一张表，直接照抄到你自己的环境里：

| 项目 | 建议 |
| --- | --- |
| 小库（< 20G） | 每天凌晨 `mysqldump --single-transaction --master-data=2` 全备 |
| 大库（> 20G） | 每天 XtraBackup 全备 + 每 4 小时增量 |
| binlog | 一律开启，`binlog_format=ROW`，保留 7~14 天 |
| 备份存放 | 本地留 3 天 + 异地（对象存储/另一台机器）留 30 天 |
| 定时任务 | crond 或 Airflow，脚本里加**备份结果校验**和失败告警 |
| 恢复演练 | **至少每季度一次**，随机抽一份备份在测试机上恢复并核对数据 |
| 权限 | 备份专用账号，只给 `BACKUP_ADMIN` + 必要的 `PROCESS/RELOAD` |

最后一行是全文最重要的一行：**没有恢复验证过的备份不算备份**。我判断一个 DBA 靠不靠谱，就问一句"你上次恢复演练是什么时候"——答不上来的，他那些备份文件大概率只是一堆躺在磁盘上的字节。

下一篇开始进入集群：光有备份只能"重头再来"，要少丢数据、要快速切流量，就得靠主从复制。我们把 binlog 到底怎么传到从库、Position 复制和 GTID 复制怎么选讲清楚。
