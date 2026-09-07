---
title: MySQL 8 安装与配置：yum、二进制、源码三种姿势一次讲清
date: 2026-09-07
description: 从三种安装方式怎么选，到 yum 与二进制实操、安装脚本封装、忘记密码、单机多实例、DataGrip 连接，一篇把 MySQL 8 从头装到能连上。
category: mysql
tags:
  - mysql
  - 安装部署
  - 数据库
---

装数据库这件事，很多人会觉得"yum 一下不就完了"。真到生产上你会发现，运维面试被问"你的 MySQL 怎么装的"，答一句 `yum install` 基本就结束了；而数据目录在哪、能不能换、装完哪些文件落在哪、密码忘了怎么办——这些才是每天要面对的东西。

这篇把 MySQL 8 的三种安装方式、以及装完之后必然会碰到的四件事（改密码、多实例、忘记密码、用客户端连）一起过一遍。

## 一、先把地基搞清楚

数据库本质就是**存数据的仓库**，我们对它做的所有事情归纳成四个字：增删改查。

分两大类：

| 类型 | 长什么样 | 怎么存取 | 代表 |
| --- | --- | --- | --- |
| 关系型数据库（RDBMS） | 有行有列，用关系模型维护 | SQL | MySQL、Oracle、SQL Server |
| 非关系型数据库（NoSQL） | 键值对、文档、列族 | 按 key 直接取 | Redis、MongoDB |

MySQL 之所以是用得最多的那个，理由很朴素：

- **开源免费**，社区版足够绝大多数业务用
- **能扛大库**，千万级记录不在话下
- **说标准 SQL**，`show databases`、`create user`、`grant` 都是标准语法的延伸
- **跨平台 + 多语言接口**，C / C++ / Python / Java / Ruby 都有驱动

顺带记一下社区版的归属变化，面试偶尔会当八卦问：**瑞典 MySQL AB 公司 → Sun → Oracle（甲骨文）**。因为被 Oracle 收购了，原作者 Fork 出去做了 MariaDB。

## 二、MySQL 8 比 5.7 好在哪（选型视角）

不用背太多，抓住三条主线就够：

| 层面 | MySQL 5.x | MySQL 8.0 |
| --- | --- | --- |
| 架构与性能 | 老优化器 | 新的查询优化器、直方图、性能明显更好 |
| SQL 语法 | 不支持 | 窗口函数、`with`（CTE）公共表表达式，这块是模仿 Oracle 补上的 |
| 备份 | mysqldump（逻辑）+ xtrabackup（物理，第三方） | 新增 **Clone Plugin 克隆插件**，官方物理备份，可替代 xtrabackup |
| 高可用 | MHA（不支持 8.0） | **MGR 组复制**，支持 5.7 / 8.0.x |

后两行就是我这个系列另外几篇的主角，这里先埋个坑。

## 三、三种安装方式怎么选

这是装 MySQL 的第一个决策点，先把结论放前面：

| 方式 | 安装目录 | 数据目录 | 优点 | 缺点 | 什么时候用 |
| --- | --- | --- | --- | --- | --- |
| yum / dnf | rpm 固定 | `/var/lib/mysql` | 简单省事，一条命令 | 定制性差，路径版本都是官方定的 | 测试环境、快速验证 |
| 二进制（glibc） | 自己指定，如 `/export/server/mysql` | `/export/server/mysql/data` | 定制性强、干净、版本随你选 | 要手工初始化 | **生产环境推荐** |
| 源码编译 | 自己指定 | 自己指定 | 可定制性最强，几乎每个参数都能改 | 编译慢、依赖多、容易翻车 | 学习原理，生产基本不用 |

底层关系也顺一下：`yum install` 其实就是 `rpm` 的包装，区别只在于 **yum 会自动解决依赖**，`rpm -ivh` 不会。查询装没装上：

```bash
rpm -qa | grep mysql
```

## 四、yum / dnf 安装（最快的一条路）

```bash
# 1. 加官方仓库（el7 / el8 / el9 换对应的包名）
yum localinstall -y https://dev.mysql.com/get/mysql80-community-release-el7-5.noarch.rpm

# 2. 装服务端
yum install -y mysql-community-server

# 3. 启动 + 开机自启
systemctl start mysqld
systemctl enable mysqld
```

yum 安装会把 root 的**临时密码**写在错误日志里，必须捞出来才能第一次登录：

```bash
grep 'temporary password' /var/log/mysqld.log
mysql -uroot -p
```

进去之后，MySQL 强制你改密码才能干别的。测试环境为了省事可以把密码策略降下来：

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Root@123456';

-- 降低密码强度校验（仅测试环境！生产别干）
SET GLOBAL validate_password.policy = 0;
SET GLOBAL validate_password.length = 4;
```

yum 装完的关键路径，建议直接记住：

| 路径 | 作用 |
| --- | --- |
| `/var/lib/mysql` | 数据目录（datadir） |
| `/etc/my.cnf` | 主配置文件 |
| `/var/log/mysqld.log` | 错误日志，排障第一现场 |
| `/usr/lib/systemd/system/mysqld.service` | systemd 单元文件 |

## 五、二进制安装（生产环境的主流做法）

二进制包是官方已经编译好的产物，**不需要你自己 make**，但目录结构、数据目录、端口全部由你定，这是它比 yum 强的地方。

### 1. 创建运行用户和目录

生产上不用 root 跑 mysqld，统一给一个不可登录的账号：

```bash
groupadd -r mysql
useradd -r -g mysql -s /sbin/nologin -M mysql

mkdir -p /export/server/mysql/data
mkdir -p /export/server/mysql/logs
```

### 2. 解压到位

```bash
cd /usr/local/src
tar xf mysql-8.0.40-linux-glibc2.17-x86_64.tar.xz -C /export/server/mysql --strip-components=1

chown -R mysql:mysql /export/server/mysql
```

`--strip-components=1` 是剥掉压缩包最外层那层目录，避免 `/export/server/mysql/mysql-8.0.40-linux-glibc.../` 这种套娃。

### 3. 写配置文件

`/etc/my.cnf`：

```ini
[mysqld]
basedir                        = /export/server/mysql
datadir                        = /export/server/mysql/data
socket                         = /tmp/mysql80.sock
port                           = 3306
user                           = mysql
log_error                      = /export/server/mysql/logs/mysqld.log
pid_file                       = /export/server/mysql/mysqld.pid

[client]
socket = /tmp/mysql80.sock
```

`[client]` 这一段很重要：客户端和服务端得用**同一个 socket**，否则你会遇到"服务明明起来了，`mysql` 却连不上"的经典玄学问题。

### 4. 初始化数据目录（重点）

这是二进制安装和 yum 安装最大的区别——**yum 会帮你初始化，二进制必须你自己来一次**：

```bash
/export/server/mysql/bin/mysqld \
  --defaults-file=/etc/my.cnf \
  --initialize-insecure \
  --user=mysql
```

两个参数记住就行：

- `--initialize-insecure`：root 密码为空，方便下一步自己设
- `--initialize`（不带 insecure）：生成随机临时密码写进错误日志，和 yum 一样

初始化成功的标志是 `data` 目录下出现了 `mysql`、`sys`、`ibdata1`、`auto.cnf` 等一堆东西。

> **`auto.cnf` 里存的是 `server_uuid`**，主从复制和 MGR 都靠它识别身份。凡是你想"多实例"或者"克隆一份 datadir 去当从库"，第一件事就是把这个文件删掉让 MySQL 重新生成，否则会撞 uuid。

### 5. 托管给 systemd

```ini
[Unit]
Description=MySQL 8.0 Server
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/export/server/mysql/bin/mysqld --defaults-file=/etc/my.cnf
LimitNOFILE=65535
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now mysqld
```

然后设密码：

```bash
/export/server/mysql/bin/mysql -uroot
```

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Root@123456';
```

## 六、源码安装：知道流程就够

源码包下载下来是一堆 `.cc` / `.h`，所以要走"**配置 → 编译 → 安装**"三步：

```bash
yum install -y gcc gcc-c++ cmake ncurses-devel openssl-devel \
               libaio-devel bison protobuf-devel

tar xf mysql-8.0.40.tar.gz && cd mysql-8.0.40

cmake . -DCMAKE_INSTALL_PREFIX=/export/server/mysql \
        -DMYSQL_DATADIR=/export/server/mysql/data \
        -DWITH_BOOST=./boost \
        -DENABLE_DOWNLOADS=1

make -j$(nproc)
make install
```

- **配置（cmake）**：决定装到哪、端口多少、数据目录在哪、编译哪些模块
- **编译（make）**：把源代码打包成可执行程序，这一步最久，通常 20 分钟起步
- **安装（make install）**：把产物拷到 `CMAKE_INSTALL_PREFIX`

MySQL 8 源码安装比 5.7 麻烦，坑集中在 **boost 依赖**（必须显式给 `-DWITH_BOOST`）和 **编译器版本**（8.0 要求较新的 gcc）。生产上没必要走这条路，二进制包已经把编译这件事替你做完了；想练手可以挑个时间自己走一遍，练的是排错能力。

## 七、把安装封装成脚本

上面这一套手敲一遍要半小时，重复劳动就该脚本化。一个 10 分钟装完 MySQL 的脚本，骨架是这样的：

```bash
#!/bin/bash
# mysql_install.sh —— 二进制方式一键安装 MySQL 8

BASEDIR=/export/server/mysql
DATADIR=${BASEDIR}/data
SOFT=mysql-8.0.40-linux-glibc2.17-x86_64.tar.xz
PORT=3306

check_env()      { [ "$(id -u)" -eq 0 ] || { echo "请用 root 执行"; exit 1; }; }
install_deps()   { yum install -y libaio numactl-libs ncurses-compat-libs; }
create_user()    { groupadd -r mysql; useradd -r -g mysql -s /sbin/nologin -M mysql; }
prepare_dir()    { mkdir -p ${BASEDIR} ${DATADIR}; tar xf ${SOFT} -C ${BASEDIR} --strip-components=1; }
write_config()   { cat > /etc/my.cnf <<EOF
[mysqld]
basedir=${BASEDIR}
datadir=${DATADIR}
socket=/tmp/mysql80.sock
port=${PORT}
user=mysql
[client]
socket=/tmp/mysql80.sock
EOF
}
init_db()        { ${BASEDIR}/bin/mysqld --defaults-file=/etc/my.cnf --initialize-insecure --user=mysql; }
setup_systemd()  { cp files/mysqld.service /usr/lib/systemd/system/; systemctl daemon-reload; }
start_service()  { systemctl enable --now mysqld; }
set_password()   { ${BASEDIR}/bin/mysql -uroot -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'Root@123456';"; }

check_env; install_deps; create_user; prepare_dir
write_config; chown -R mysql:mysql ${BASEDIR}; init_db
setup_systemd; start_service; set_password
echo "MySQL 安装完成，socket=/tmp/mysql80.sock"
```

脚本不需要死记硬背，但**至少要照着写两遍**，目的是理解这条流程链：

```
环境检查 → 装依赖 → 建用户 → 建目录解压 → 写配置 → 初始化 → systemd 托管 → 启动 → 改密码
```

顺序不能乱：初始化必须在写配置**之后**（它要读 my.cnf 才知道往哪写数据），在 chown **之后**（否则文件属主是 root，mysqld 以 mysql 身份跑起来读不到），在启动**之前**（datadir 空的起不来）。

## 八、忘记密码了怎么办

这是面试必考、生产必遇。核心思路：**跳过权限表启动，进去之后再改**。

```bash
# 1. 停掉正常服务
systemctl stop mysqld

# 2. 以跳过授权表的方式启动（& 表示放后台）
mysqld_safe --skip-grant-tables &

# 3. 免密登录
mysql -uroot
```

进去之后：

```sql
-- 跳授权表启动时权限表没加载，必须先 flush，否则 ALTER USER 会报
-- "The MySQL server is running with the --skip-grant-tables option"
FLUSH PRIVILEGES;

ALTER USER 'root'@'localhost' IDENTIFIED BY 'NewPass@123456';
```

老一点的做法是直接改系统表，遇到 `ALTER USER` 不生效时可以拿它兜底：

```sql
FLUSH PRIVILEGES;
UPDATE mysql.user SET authentication_string = '' WHERE user = 'root';
-- 重启后重新登录，再 set password
SET PASSWORD = '新密码';
```

收尾把后台进程干掉：

```bash
jobs            # 查看后台运行的进程
echo $!         # 显示最后一个后台进程的 PID
kill %1         # 杀死 1 号后台任务
```

再 `systemctl start mysqld` 用新密码登录验证。

> 生产上真忘了密码，比 `--skip-grant-tables` 更安全的做法是用 **初始化文件**：在 my.cnf 里配 `init-file=/root/init.sql`，文件里写 `ALTER USER ...`，正常启动 mysqld，密码就改好了，全程不暴露无认证端口。

## 九、一台机器跑多个 MySQL 实例

理解成本最低的解释：**类似于微信双开**。同一台服务器上同时跑多个 mysqld 进程。

四个必须不同，其余可以共用：

| 项目 | 说明 |
| --- | --- |
| ① 安装路径 | 可以共用同一份 basedir，也可以各装一份 |
| ② 数据目录 | **必须不同**，否则数据互相踩 |
| ③ 端口 | 必须不同，`3306 / 3307 / 3308` |
| ④ socket | 必须不同，`/tmp/mysql80.sock / mysql81.sock` |

实际做法是一份二进制、多个配置文件：

```bash
# 准备两套数据目录
mkdir -p /data/mysql330{6,7}
chown -R mysql:mysql /data/mysql3306 /data/mysql3307

# 初始化
/export/server/mysql/bin/mysqld --defaults-file=/etc/my3306.cnf --initialize-insecure --user=mysql
/export/server/mysql/bin/mysqld --defaults-file=/etc/my3307.cnf --initialize-insecure --user=mysql

# 分别启动
/export/server/mysql/bin/mysqld_safe --defaults-file=/etc/my3306.cnf &
/export/server/mysql/bin/mysqld_safe --defaults-file=/etc/my3307.cnf &

# 分别连接：一定要显式指定 socket
/export/server/mysql/bin/mysql -uroot -S /tmp/mysql3306.sock
/export/server/mysql/bin/mysql -uroot -S /tmp/mysql3307.sock
```

> 多实例时，**每个数据目录都有自己的 `auto.cnf`**，`server_uuid` 天然不同；但如果你的实例是从同一个模板 datadir 拷出来的，务必逐个进目录把 `auto.cnf` 删掉再启动。

**优点**：把一台机器的 CPU/内存吃干榨净，不用为每个业务申请一台新机。
**缺点**：资源互相抢占。一个实例跑大查询把 IO 打满，同机其他实例一起抖，故障隔离性不如多机。

## 十、用 DataGrip 连上它

装好只是第一步，日常还是要图形化工具。DataGrip 是 JetBrains 出的数据库 IDE（和 IDEA、PyCharm 同一家），好处是同时支持关系型和非关系型数据库，SQL 智能提示比 Navicat 强，而 Navicat 是有版权风险的。

无论用哪个客户端，连接五要素都一样：

| 要素 | 例子 | 说明 |
| --- | --- | --- |
| 主机 | `192.168.88.101` | 远程服务器 IP |
| 端口 | `3306` | 对应 my.cnf 的 `port` |
| 用户 | `root` | 生产建议建专用账号 |
| 密码 | `Root@123456` | |
| 驱动 jar 包 | MySQL Connector/J | Java 连 MySQL 靠它，DataGrip 首次连接会提示自动下载 |

连不上时按这个顺序排查，基本百发百中：

1. 服务端进程在不在：`ps -ef | grep mysqld`
2. 端口有没有监听：`ss -lntp | grep 3306`
3. 防火墙：`systemctl stop firewalld` 先排除掉它
4. 账号的 host 允不允许你的 IP 登录（`root@localhost` 是**连不上远程**的）
5. 错误日志：`tail -f /var/log/mysqld.log`

第 4 条特别容易被忽略——MySQL 的用户是"`用户名`@`来源主机`"的组合，`root@localhost` 和 `root@'%'` 是两个完全不同的账号。

## 十一、几条生产建议

- **不要在公网机器上开放 `root@'%'`**，建专用管理账号并限制来源网段
- **数据目录单独挂盘**，别和系统争 `/` 分区，否则 binlog 一涨满就宕机
- **别把 `validate_password` 关掉后带到生产**，那是测试环境的偷懒开关
- **`/var/log/mysqld.log` 定期看**，MySQL 起不来 90% 的原因都在里面
- **二进制安装的服务端记得配 `log_error` 和 `pid_file`**，不配的话排障时你连日志在哪都要找半天

装完能连上、能改密码、能跑多实例，MySQL 这一步就算过关了。下一篇我们从"装"转到"用"——SQL 语句怎么把一张表建出来、怎么把数据查出来，特别是那几个面试反复问的：主键和唯一的区别、`delete` 和 `truncate` 的区别、`where` 和 `having` 谁先执行。
