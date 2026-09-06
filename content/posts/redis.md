---
title: redis源码编译安装
date: 2026-09-06
description: 源码编译安装 redis，灵活定制各种功能。附编译参数、systemd 托管与生产环境验证的完整流程。
category: compile
tags:
  - redis
  - 编译安装
---



下面给你一个**Linux 下载并安装 Redis 的完整教程**，我按照你之前经常使用的环境（Rocky Linux / RHEL 系）来写，同时补充源码安装方式。Redis 官方支持通过系统包安装，也支持源码编译安装。[Redis](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-linux/?utm_source=chatgpt.com)

这里推荐生产环境使用**源码安装**，因为可以自己控制版本（比如 Redis 7.x），目录结构也更清晰。

------

# 一、环境准备

查看系统：

```
cat /etc/os-release
```

例如：

```
Rocky Linux 10
```

安装编译环境：

```
dnf install -y gcc gcc-c++ make wget tar
```

检查：

```
gcc -v
make -v
```

------

# 二、下载 Redis

进入软件目录：

```
cd /usr/local/src
```

下载 Redis：

```
wget https://download.redis.io/redis-stable.tar.gz
```

Redis 官方源码包地址就是：

```
https://download.redis.io/redis-stable.tar.gz
​``` citeturn0search2



查看：

​```bash
ls -lh
```

应该看到：

```
redis-stable.tar.gz
```

------

# 三、解压 Redis

```
tar -zxvf redis-stable.tar.gz
```

进入目录：

```
cd redis-stable
```

查看：

```
ls
```

可以看到：

```
README.md
src
redis.conf
Makefile
```

------

# 四、编译 Redis

执行：

```
make
```

等待编译完成。

如果成功：

```
Hint: It's a good idea to run 'make test'
```

查看生成文件：

```
ls src/
```

重点：

```
redis-server
redis-cli
```

说明：

| 文件         | 作用        |
| ------------ | ----------- |
| redis-server | Redis服务端 |
| redis-cli    | Redis客户端 |

------

# 五、安装 Redis

执行：

```
make install
```

默认安装到：

```
/usr/local/bin/
```

检查：

```
redis-server -v
```

例如：

```
Redis server v=8.x
```

------

# 六、创建 Redis 用户

生产环境不要使用 root 启动：

```
useradd -r -s /sbin/nologin redis
```

创建目录：

```
mkdir -p /data/redis/{data,logs}
```

授权：

```
chown -R redis:redis /data/redis
```

------

# 七、配置 Redis

复制配置文件：

```
mkdir /etc/redis

cp redis.conf /etc/redis/6379.conf
```

编辑：

```
vim /etc/redis/6379.conf
```

------

## 1. 修改后台运行

找到：

```
daemonize no
```

改：

```
daemonize yes
```

------

## 2. 修改数据目录

找到：

```
dir ./
```

改：

```
dir /data/redis/data
```

------

## 3. 修改日志

找到：

```
logfile ""
```

改：

```
logfile "/data/redis/logs/redis.log"
```

------

## 4. 设置密码

找到：

```
# requirepass foobared
```

修改：

```
requirepass Redis@123456
```

------

## 5. 监听地址

默认：

```
bind 127.0.0.1
```

如果需要远程连接：

改：

```
bind 0.0.0.0
```

同时开启保护：

```
protected-mode yes
```

------

# 八、创建 systemd 服务

创建：

```
vim /usr/lib/systemd/system/redis.service
```

写入：

```
[Unit]
Description=Redis Server
After=network.target


[Service]
Type=forking

User=redis
Group=redis

ExecStart=/usr/local/bin/redis-server /etc/redis/6379.conf

ExecStop=/usr/local/bin/redis-cli shutdown

Restart=always


[Install]
WantedBy=multi-user.target
```

------

重新加载：

```
systemctl daemon-reload
```

启动：

```
systemctl start redis
```

查看：

```
systemctl status redis
```

看到：

```
Active: active (running)
```

说明成功。

------

# 九、设置开机启动

```
systemctl enable redis
```

查看：

```
systemctl is-enabled redis
```

输出：

```
enabled
```

------

# 十、测试 Redis

进入客户端：

```
redis-cli
```

如果设置了密码：

```
redis-cli -a Redis@123456
```

测试：

```
ping
```

返回：

```
PONG
```

说明 Redis 正常运行。[Redis](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-linux/?utm_source=chatgpt.com)

------

# 十一、防火墙开放端口（远程访问需要）

Redis 默认端口：

```
6379
```

开放：

```
firewall-cmd --add-port=6379/tcp --permanent

firewall-cmd --reload
```

查看：

```
firewall-cmd --list-port
```

------

# 十二、查看 Redis 状态

查看进程：

```
ps -ef | grep redis
```

查看端口：

```
ss -lntp | grep 6379
```

查看日志：

```
tail -f /data/redis/logs/redis.log
```

------

# 最终目录结构

安装完成后：

```
/usr/local/bin/
├── redis-server
├── redis-cli


/etc/redis/
└── 6379.conf


/data/redis/
├── data
└── logs
    └── redis.log
```