---
title: php源码编译安装
date: 2026-09-06
description: 编译安装php，可自定义安装
category: compile
tags:
  - php
  - 编译安装
---


源码编译 PHP 的核心流程就是：

```
安装依赖
   ↓
下载 PHP 源码
   ↓
configure 配置编译参数
   ↓
make 编译
   ↓
make install 安装
   ↓
配置 php.ini
   ↓
配置 php-fpm
   ↓
systemd 管理服务
   ↓
Nginx 调用 PHP-FPM
```

PHP 官方源码安装流程也是基于 `configure → make → make install`，并要求系统具备 C 编译器、make 以及相关扩展依赖。[PHP](https://www.php.net/manual/en/install.unix.source.php?utm_source=chatgpt.com)

------

# 一、准备环境

## 1. 查看系统

```
cat /etc/os-release
```

查看 CPU：

```
nproc
```

------

# 二、安装编译依赖

先开启

dnf config-manager --set-enabled crb

安装 PHP 常用依赖：

```
dnf install -y \
gcc \
gcc-c++ \
make \
autoconf \
bison \
re2c \
libxml2-devel \
sqlite-devel \
openssl-devel \
curl-devel \
libpng-devel \
libjpeg-devel \
freetype-devel \
libzip-devel \
oniguruma-devel \
libicu-devel \
libxslt-devel \
systemd-devel \
tar \
wget
```

这些依赖主要用于：

| 依赖                 | 作用        |
| -------------------- | ----------- |
| libxml2              | XML处理     |
| openssl              | HTTPS支持   |
| curl                 | 网络请求    |
| libpng/jpeg/freetype | GD图片处理  |
| libzip               | zip扩展     |
| oniguruma            | mbstring    |
| libicu               | 国际化      |
| systemd-devel        | php-fpm服务 |

------

# 三、创建 PHP 用户

生产环境不要使用 root 运行 PHP。

```
useradd -r -s /sbin/nologin www
```

------

# 四、下载 PHP 源码

进入源码目录：

```
cd /usr/local/src
```

下载：

例如 PHP 8.3.25：

```
wget https://www.php.net/distributions/php-8.3.25.tar.gz
```

解压：

```
tar xf php-8.3.25.tar.gz
```

进入：

```
cd php-8.3.25
```

------

# 五、执行 configure 配置

先查看支持参数：

```
./configure --help
```

官方文档说明，PHP 编译配置主要通过 `configure` 参数控制，可以通过 `./configure --help` 查看所有选项。[PHP](https://www.php.net/manual/zh/install.unix.source.php?utm_source=chatgpt.com)

生产环境常用配置：

```
./configure \
--prefix=/usr/local/php \
--with-config-file-path=/usr/local/php/etc \
--enable-fpm \
--with-fpm-user=php \
--with-fpm-group=php \
--enable-mysqlnd \
--with-mysqli=mysqlnd \
--with-pdo-mysql=mysqlnd \
--enable-mbstring \
--enable-opcache \
--enable-gd \
--with-jpeg \
--with-freetype \
--with-zlib \
--with-curl \
--with-openssl \
--enable-soap \
--enable-sockets \
--enable-bcmath \
--enable-calendar \
--enable-exif \
--with-libxml \
--with-xsl \
--enable-pcntl \
--enable-intl
```

如果成功最后会看到：

```
Thank you for using PHP.
```

------

# 六、编译 PHP

使用多线程：

```
make -j$(nproc)
```

查看 CPU：

```
nproc
```

例如：

```
8
```

等价：

```
make -j8
```

编译时间：

普通服务器：

```
10~30分钟
```

------

# 七、安装

```
make install
```

查看：

```
ls /usr/local/php
```

应该有：

```
bin
etc
include
lib
sbin
var
```

------

# 八、配置环境变量

编辑：

```
vim /etc/profile
```

添加：

```
export PATH=/usr/local/php/bin:/usr/local/php/sbin:$PATH
```

加载：

```
source /etc/profile
```

测试：

```
php -v
```

输出：

```
PHP 8.3.x (cli)
```

------

# 九、配置 php.ini

复制配置文件：

开发环境：

```
cp php.ini-development /usr/local/php/etc/php.ini
```

生产：

```
cp php.ini-production /usr/local/php/etc/php.ini
```

推荐生产使用：

```
php.ini-production
```

------

修改：

```
vim /usr/local/php/etc/php.ini
```

常用：

## 时区

找到：

```
;date.timezone =
```

修改：

```
date.timezone = Asia/Shanghai
```

## 上传限制

```
upload_max_filesize = 100M

post_max_size = 100M
```

## 内存

```
memory_limit = 512M
```

------

# 十、配置 PHP-FPM

复制配置：

```
cd /usr/local/php/etc
```

复制：

```
cp php-fpm.conf.default php-fpm.conf
```

编辑：

```
vim php-fpm.conf
```

修改：

```
pid = run/php-fpm.pid
```

------

配置 pool：

进入：

```
cd php-fpm.d
```

复制：

```
cp www.conf.default www.conf
```

编辑：

```
vim www.conf
```

修改：

```
user = www
group = www
```

监听：

```
listen = 127.0.0.1:9000
```

------

# 十一、配置 systemd 服务

创建：

```
vim /usr/lib/systemd/system/php-fpm.service
```

写入：

```
[Unit]
Description=PHP FastCGI Process Manager
After=network.target


[Service]

Type=forking

PIDFile=/usr/local/php/var/run/php-fpm.pid

ExecStart=/usr/local/php/sbin/php-fpm

ExecReload=/bin/kill -USR2 $MAINPID


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
systemctl start php-fpm
```

开机启动：

```
systemctl enable php-fpm
```

查看：

```
systemctl status php-fpm
```

------

# 十二、验证 PHP-FPM

查看端口：

```
ss -lntp | grep 9000
```

看到：

```
127.0.0.1:9000
```

说明成功。

------

# 十三、配置 Nginx 支持 PHP

例如网站：

```
/var/www/html
```

Nginx：

```
server {

listen 80;

server_name test.com;


root /var/www/html;


index index.php index.html;



location ~ \.php$ {

    fastcgi_pass 127.0.0.1:9000;

    fastcgi_index index.php;

    include fastcgi_params;

    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;

}


}
```

------

# 十四、测试 PHP

创建：

```
vim /var/www/html/index.php
```

写：

```
<?php

phpinfo();

?>
```

访问：

```
http://服务器IP/index.php
```

出现：

```
PHP Version 8.x
```

说明成功。

------

# 十五、查看 PHP 模块

```
php -m
```

例如：

```
mysqli
pdo_mysql
curl
openssl
mbstring
gd
opcache
```

------

# 十六、生产优化建议

## 开启 OPcache

编辑：

```
vim /usr/local/php/etc/php.ini
```

增加：

```
[opcache]

zend_extension=opcache.so

opcache.enable=1

opcache.memory_consumption=256

opcache.interned_strings_buffer=16

opcache.max_accelerated_files=10000
```

------

## PHP-FPM 进程优化

编辑：

```
vim /usr/local/php/etc/php-fpm.d/www.conf
```

推荐：

```
pm = dynamic

pm.max_children = 100

pm.start_servers = 10

pm.min_spare_servers = 10

pm.max_spare_servers = 50
```