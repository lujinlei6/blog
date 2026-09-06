---
title: nginx源码编译安装
date: 2026-09-06
description: 把西文排版经验直接套用到中文上，几乎每一条都会出错。这十条是我在真实项目里反复验证过的中文网页排版约束，附可以直接抄的 CSS。
tags:
  - 排版
  - CSS
  - 中文
---



# 一、安装编译环境

Nginx 编译需要：

| 软件    | 作用                     |
| ------- | ------------------------ |
| gcc     | 编译器                   |
| make    | 编译工具                 |
| pcre    | 支持正则匹配(location等) |
| zlib    | gzip压缩                 |
| openssl | HTTPS支持                |

安装依赖：

```
dnf install -y gcc gcc-c++ make \
pcre2-devel \
zlib-devel \
openssl-devel \
```

检查：

```
gcc --version
make --version
```

------

# 二、创建nginx运行用户

生产环境不建议 nginx 使用 root 运行。

创建用户：

```
useradd -r -s /sbin/nologin nginx
```

查看：

```
id nginx
```

结果类似：

```
uid=995(nginx) gid=993(nginx)
```

------

# 三、下载 nginx 源码

官网：

https://nginx.org/download/

例如安装：

```
nginx-1.28.0
```

下载：

```
cd /usr/local/src
wget https://nginx.org/download/nginx-1.28.0.tar.gz
```

解压：

```
tar xf nginx-1.28.0.tar.gz
```

进入目录：

```
cd nginx-1.28.0
```

查看源码：

```
ls
```

你会看到：

```
auto
conf
configure
html
src
```

其中：

```
configure
```

是编译入口。

------

# 四、执行configure配置

## 1. 基础安装

```
./configure \
--prefix=/usr/local/nginx \
--user=nginx \
--group=nginx
```

参数解释：

| 参数   | 作用           |
| ------ | -------------- |
| prefix | 安装目录       |
| user   | worker进程用户 |
| group  | 运行组         |

------

## 2. 企业常用完整参数

生产环境推荐：

```
./configure \
--prefix=/usr/local/nginx \
--user=nginx \
--group=nginx \
--with-http_ssl_module \
--with-http_v2_module \
--with-http_stub_status_module \
--with-http_gzip_static_module \
--with-pcre \
--with-file-aio \
--with-threads
```

解释：

### SSL模块

```
--with-http_ssl_module
```

支持：

```
https
```

------

### HTTP2

```
--with-http_v2_module
```

------

### 状态监控

```
--with-http_stub_status_module
```

以后可以：

```
nginx_status
```

监控：

```
Active connections
accepts
handled
requests
Reading
Writing
Waiting
```

Prometheus nginx exporter 就依赖这个。

------

### gzip静态压缩

```
--with-http_gzip_static_module
```

------

### 异步IO

```
--with-file-aio
```

------

### 多线程

```
--with-threads
```

------

执行后最后看到：

```
Configuration summary
+ using system PCRE library
+ OpenSSL library is not used
+ nginx path prefix: "/usr/local/nginx"
```

说明成功。

------

# 五、编译安装

查看CPU：

```
nproc
```

假设：

```
8
```

使用8线程编译：

```
make -j8
```

时间大约：

30秒~几分钟

安装：

```
make install
```

------

# 六、查看安装目录

```
ls /usr/local/nginx
```

结果：

```
conf
html
logs
sbin
```

目录作用：

| 目录 | 作用      |
| ---- | --------- |
| conf | 配置文件  |
| html | 网页文件  |
| logs | 日志      |
| sbin | nginx命令 |

------

# 七、配置环境变量

方便直接使用 nginx 命令。

编辑：

```
vim /etc/profile
```

增加：

```
export PATH=$PATH:/usr/local/nginx/sbin
```

生效：

```
source /etc/profile
```

测试：

```
nginx -v
```

输出：

```
nginx version: nginx/1.28.0
```

------

# 八、修改nginx配置

配置文件：

```
vim /usr/local/nginx/conf/nginx.conf
```

修改：

```
user nginx;
worker_processes auto;


events {
    worker_connections 10240;
}


http {

    include mime.types;

    sendfile on;

    keepalive_timeout 65;
    
    gzip on;

gzip_min_length 1k;

gzip_comp_level 6;

gzip_types
application/javascript
application/json
text/css
text/plain
image/svg+xml;

    server {

        listen 80;

        server_name localhost;


        location / {

            root html;

            index index.html;

        }

    }

}
```

------

# 九、检查配置

执行：

```
nginx -t
```

正常：

```
syntax is ok
test is successful
```

------

# 十、启动 nginx

启动：

```
nginx
```

查看：

```
ps -ef | grep nginx
```

看到：

```
root nginx master
nginx worker
```

------

查看端口：

```
ss -lntp | grep nginx
```

结果：

```
LISTEN 0 511 *:80
```

------

访问：

```
http://服务器IP
```

看到：

```
Welcome to nginx!
```

------

# 十一、停止和重载

## 停止

快速停止：

```
nginx -s stop
```

优雅停止：

```
nginx -s quit
```

------

## 重载配置

修改配置后：

```
nginx -t
```

然后：

```
nginx -s reload
```

生产环境不要 restart。

------

# 十二、配置systemd服务

源码安装默认没有systemd。

创建：

```
vim /usr/lib/systemd/system/nginx.service
```

写入：

```
[Unit]
Description=nginx web server
After=network.target


[Service]

Type=forking

ExecStart=/usr/local/nginx/sbin/nginx

ExecReload=/usr/local/nginx/sbin/nginx -s reload

ExecStop=/usr/local/nginx/sbin/nginx -s quit

PrivateTmp=true


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
systemctl start nginx
```

开机启动：

```
systemctl enable nginx
```

查看：

```
systemctl status nginx
```

------

# 十三、防火墙放行

如果开启firewalld：

```
firewall-cmd --permanent --add-service=http
```

HTTPS：

```
firewall-cmd --permanent --add-service=https
```

刷新：

```
firewall-cmd --reload
```

------

# 十四、查看编译参数

以后不知道 nginx 编译了哪些模块：

```
nginx -V
```

例如：

```
nginx version: nginx/1.28.0

configure arguments:
--with-http_ssl_module
--with-http_v2_module
--with-http_stub_status_module
```

------

# 十五、企业生产目录建议

不要全部放默认：

推荐：

```
/usr/local/nginx
|
├── conf
│   ├── nginx.conf
│   └── conf.d
│
├── html
│
├── logs
│   ├── access.log
│   └── error.log
│
└── sbin
```

配置拆分：

```
nginx.conf
      |
      |
      +---- conf.d/
              |
              +-- www.conf
              +-- api.conf
              +-- proxy.conf
```

nginx.conf：

```
http {

include conf.d/*.conf;

}
```

方便管理多个站点。

------

# 十六、如果用于企业项目（推荐额外开启）

你之前做过：

- LNMP
- HAProxy
- WAF
- Prometheus
- Kubernetes

建议编译：

```
./configure \
--prefix=/usr/local/nginx \
--user=nginx \
--group=nginx \
--with-http_ssl_module \
--with-http_stub_status_module \
--with-http_realip_module \
--with-http_gzip_static_module \
--with-http_v2_module \
--with-stream \
--with-stream_ssl_module
```

额外支持：

| 模块        | 用途             |
| ----------- | ---------------- |
| realip      | 获取真实客户端IP |
| stream      | 四层代理         |
| stream_ssl  | TCP SSL代理      |
| stub_status | 监控             |
| ssl         | HTTPS            |

这个版本可以用于：

```
Nginx
 |
 +-- 七层负载均衡
 |
 +-- TCP代理(MySQL/Redis)
 |
 +-- HTTPS
 |
 +-- Prometheus监控
```

------

