---
title: Docker 从入门到上生产：镜像、容器与数据卷
date: 2026-09-01
description: 一篇把 Docker 核心概念串起来的实战笔记：镜像分层、容器生命周期、数据卷与自定义网络，最后附生产环境的落地建议。
category: docker
tags:
  - docker
  - 容器
  - 运维
featured: true
---

很多运维第一次接触 Docker 都是从 `docker run` 开始的，跑通了就以为会了。直到镜像越来越大、容器一重启数据全没了、两个容器互相 ping 不通，才发现中间缺的是对分层与隔离机制的理解。这篇把这些坑按顺序填上。

## 一、安装

以 Rocky Linux / RHEL 系为例，装官方 Docker CE 源：

```bash
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io
systemctl enable --now docker
docker version
```

`docker version` 同时输出 Client 和 Server 两段信息才算真正起来了，只有 Client 说明 daemon 没起来，去看 `journalctl -u docker`。

## 二、镜像分层

镜像是只读层的堆叠，容器只是在最上面加了一层可写层：

```text
┌─────────────────────┐
│  可写层（容器运行时） │ ← docker commit 抓的是这层
├─────────────────────┤
│  COPY app.jar       │ ← 你 Dockerfile 里的一行一层
├─────────────────────┤
│  RUN dnf install …  │
├─────────────────────┤
│ 基础镜像 Rocky 9     │
└─────────────────────┘
```

两个推论：

1. **层会被缓存复用**。把变化最频繁的行放在 Dockerfile 靠后的位置，构建才快。
2. **`RUN` 一行一层**。清理缓存要写在同一行，不然上一层留下的包缓存永远留在镜像里：

```dockerfile
# 错误：上层缓存已经写进历史，rm 删不掉
RUN dnf install -y gcc make
RUN rm -rf /var/cache/dnf

# 正确
RUN dnf install -y gcc make && dnf clean all
```

## 三、容器生命周期

```bash
docker run -d --name web -p 8080:80 nginx:1.28        # 后台跑并映射端口
docker exec -it web bash                               # 进容器排查
docker logs -f --tail 100 web                          # 看日志
docker stats web                                       # 实时资源占用
docker rm -f web                                       # 强制删除
```

一个高频事故：容器里进程挂了但容器还在，是因为主进程 PID 1 不是你的业务进程。用 `docker inspect -f '{{.State.ExitCode}}' web` 拿退出码，再配合 `--restart=on-failure:5` 让它自愈。

## 四、数据卷：数据不随容器陪葬

容器删除时可写层一起消失，所以任何要持久化的东西都别放在容器文件系统里：

```bash
docker volume create appdata
docker run -d -v appdata:/var/lib/mysql mysql:8.4
```

三种子方式的取舍：

| 方式 | 写法 | 适用 |
| ---- | ---- | ---- |
| 具名卷 | `-v appdata:/data` | 数据库等生产数据，由 Docker 管理位置 |
| 绑定挂载 | `-v /opt/app:/data` | 开发时挂代码、挂配置文件 |
| 匿名卷 | `-v /data` | 临时用，`docker volume prune` 清理 |

## 五、自定义网络

默认 bridge 网络里容器之间只能靠 IP 互访，而自定义网络自带 DNS：

```bash
docker network create appnet
docker run -d --name db --network appnet -e MYSQL_ROOT_PASSWORD=xxx mysql:8.4
docker run -d --name app --network appnet myapp
# app 容器里直接 ping db / mysql -h db 就能通
```

生产上跨主机才需要 overlay 网络，单机场景 `appnet` 这种 bridge 就够。

## 六、生产落地清单

- 镜像统一走私有仓库（Harbor），禁止生产机器直接 `docker pull` 公网镜像
- 容器统一 `--memory` / `--cpus` 限额，防止一台容器把宿主机拖死
- 日志驱动改成 `json-file` + 大小轮转，否则 `/var/lib/docker/containers` 会把磁盘吃满
- `docker ps -aq -f status=exited | xargs docker rm` 定期清理僵尸容器

把这套流程走顺之后，下一步就是把多容器编排交给 compose，再往后就是 Kubernetes——那是另一个分类的故事了。
