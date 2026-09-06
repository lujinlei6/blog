---
title: Zabbix 6.x 从零搭建：让故障比你先知道
date: 2026-09-05
description: 从服务端安装、Agent 配置到模板与触发器实战，搭一套能用的 Zabbix 监控体系。附告警升级策略与生产环境常见的坑。
category: zabbix
tags:
  - zabbix
  - 监控
  - 运维
---

运维的终极境界不是手速快，而是故障发生前告警先响。Zabbix 上手有点重，但把服务端、Agent、模板、触发器这条链路走通一遍，后面加监控项就是体力活了。

## 一、服务端安装（LNMP + Zabbix Server）

以 Rocky Linux 9 + Zabbix 6.0 LTS 为例：

```bash
rpm -Uvh https://repo.zabbix.com/zabbix/6.0/rhel/9/x86_64/zabbix-release-6.0-1.el9.noarch.rpm
dnf install -y zabbix-server-mysql zabbix-web-mysql zabbix-nginx-conf zabbix-sql-scripts
```

数据库初始化：

```bash
mysql -e "create database zabbix character set utf8mb4 collate utf8mb4_bin;"
mysql -e "create user zabbix@localhost identified by 'YourStrongPass';"
mysql -e "grant all privileges on zabbix.* to zabbix@localhost;"

zcat /usr/share/zabbix-sql-scripts/mysql/server.sql.gz | mysql --default-character-set=utf8mb4 zabbix
```

改 `/etc/zabbix/zabbix_server.conf`：

```ini
DBPassword=YourStrongPass
```

然后启动：

```bash
systemctl enable --now zabbix-server nginx php-fpm
```

访问 `http://server-ip` 进 Web 向导，默认账号 `Admin / zabbix`——**第一次登录就改掉**。

## 二、Agent 配置

被监控机装 Agent：

```bash
dnf install -y zabbix-agent2
```

`/etc/zabbix/zabbix_agent2.conf` 关键三行：

```ini
Server=10.0.0.5        # 允许哪个服务端来取数
ServerActive=10.0.0.5  # 主动模式上报地址
Hostname=web-01        # 必须和 Web 界面里配置的主机名一致
```

```bash
systemctl enable --now zabbix-agent2
```

Agent2 用 Go 写的，自带插件能直接监控 Docker、Redis，比老 Agent 省很多自定义脚本。

## 三、模板与监控项

不要手工建监控项，**永远从模板开始**：

1. 「数据采集 → 主机」里给主机挂 `Linux by Zabbix agent` 模板
2. 想监控 Nginx？挂 `NGINX by Zabbix agent`，前提是 Nginx 编了 `--with-http_stub_status_module`（源码编译那篇提过）
3. 模板监控项不够用时，再克隆模板改，别改原模板——升级会覆盖

## 四、触发器：告警的灵魂

一个合格触发器的样子：

```text
avg(/Linux by Zabbix agent/vfs.fs.used[pct,/],5m)>90
```

三个要素：**函数**（avg 避免 CPU 毛刺误报）、**时长**（5 分钟持续才告）、**阈值**（和业务约定，不是拍脑袋）。

严重程度从 Not classified 到 Disaster 六级，一定要用起来——磁盘 85% 是 Warning 预警，95% 才是 Average，别什么都 Average，值班的人会麻木的。

## 五、告警动作与升级

Web 里「用户设置 → 报警媒介」先挂媒介（钉钉/企微用 Webhook，邮件用 SMTP），然后建 Action：

- 第 0 步：立即通知值班组
- 第 30 分钟未确认：升级通知组长
- 第 2 小时未确认：电话告警

**告警必须可升级**，一条没人理的告警等于没有告警。

## 六、踩过的坑

- 主机名不一致：Agent 的 `Hostname` 和 Web 里对不上，`ZBX_NOTSUPPORTED` 和无法获取数据八成是这个
- 中文乱码：图表里方块字，把中文字体传到 `/usr/share/zabbix/assets/fonts/` 替换默认字体
- 数据库爆炸：history 保留期默认 90 天，小机器先改成 14 天，趋势数据（trend）留长即可
- 防火墙：服务端主动连 Agent 要放行 10050，Agent 主动模式上报是 10051

监控体系搭起来之后，你会发现排障的姿势都变了——从「用户说挂了我去看」变成「告警响了提前处理」。这一步跨出去，才算从救火队员进化成运维工程师。
