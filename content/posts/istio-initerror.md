---
title: Istio 排查实录：istio-init 容器 CrashLoopBackOff 之 iptables nat 表初始化失败
date: 2026-09-15
description: 在 Kubernetes 1.30 集群上为 Pod 注入 Istio sidecar 后，istio-init 容器反复崩溃，报 iptables-restore: unable to initialize table 'nat'。本文记录完整排查过程与根因分析：iptables 的 legacy 与 nftables 双后端机制
category: kubernetes
tags:
  - Kubernetes
featured: true

---



# 问题背景

## 环境

| 组件       | 版本                              |
| ---------- | --------------------------------- |
| Kubernetes | 1.30（kubeadm 部署，flannel CNI） |
| Istio      | 1.16.2                            |
| 集群规模   | 1 master + 多 worker              |

## 操作

部署应用并手动注入 Istio sidecar：

```bash
istioctl kube-inject -f deploy-apps.yml | kubectl -n app apply -f -
```

## 现象

新 Pod 卡在 `Init:CrashLoopBackOff`，旧的未注入 sidecar 的副本（1/1）因滚动更新被卡住而残留：

```
NAME                           READY   STATUS                  RESTARTS      AGEdeploy-apps-584f8fbb74-lflf8   1/1     Running                 0             4m5sdeploy-apps-7878bc7486-p2fpq   0/2     Init:CrashLoopBackOff   3 (19s ago)   58s
```

Events 显示 init 容器 `istio-init` 反复重建：

```
Normal   Pulled     8s (x4 over 47s)  kubelet  Container image "docker.io/istio/proxyv2:1.16.2" already present on machineWarning  BackOff    7s (x4 over 45s)  kubelet  Back-off restarting failed container istio-init in pod ...
```

# 排查过程

## 第一步：查看 init 容器日志

`istio-init` 是 Istio 注入的初始化容器，作用是在业务容器启动前，向 Pod 的网络空间写入 iptables nat 规则，把进出流量"劫持"给 Envoy sidecar。它一失败，业务容器根本不会启动。

```bash
kubectl logs <pod> -n app -c istio-init -p
```

关键报错：

```
info    Running command: iptables-restore --noflush /tmp/iptables-rules-xxxerror   Command error output: xtables parameter problem: iptables-restore: unable to initialize table 'nat'Error occurred at line: 1error   Failed to execute: iptables-restore --noflush /tmp/iptables-rules-xxx, exit status 2
```

结论很直白：**内核初始化不了 nat 表**。但奇怪的是——

## 第二步：上节点检查，结果"一切正常"（这里非常误导）

登录 Pod 所在节点 node2：

```bash
iptables -t nat -L -n
```

nat 表完全正常，K8s 和 flannel 的规则都在（KUBE-SERVICES、FLANNEL-POSTRTG……）。nat 表明明是好的，为什么容器里初始化失败？

再看内核模块加载情况：

```bash
lsmod | grep -E 'iptable_nat|nf_nat'nf_nat       69632  2 nft_chain_nat,xt_MASQUERADEnf_conntrack 204800 6 xt_conntrack,nf_nat,nft_ct,nf_conntrack_netlink,xt_MASQUERADE,ip_vs
```

注意细节：在使用 `nf_nat` 的是 **`nft_chain_nat`**，而 **`iptable_nat`（legacy 模块）根本不在列表里**。

# 根因分析：iptables 的两套后端

Linux 的 netfilter 体系里，iptables 实际上**并存两套实现**：

|            | legacy（传统后端）          | nftables（新后端）             |
| ---------- | --------------------------- | ------------------------------ |
| 内核模块   | `ip_tables` / `iptable_nat` | `nft_chain_nat` 等             |
| 用户态工具 | iptables-legacy             | iptables-nft（现代发行版默认） |
| 常见于     | 老系统                      | 新系统                         |

现代 Linux 发行版的 `iptables` 命令默认是 **nft 后端**。于是在这台节点上：

- **主机的 iptables 是 nft 版** → 写 nat 表走 `nft_chain_nat` → 正常工作 → 所以主机上检查"一切正常"；
- **Istio 1.16 init 容器镜像里带的是 legacy 版 iptables** → 需要内核提供 `iptable_nat` 模块 → 该模块未加载 → 报 `unable to initialize table 'nat'`。

一句话总结：**主机说新方言，容器说老方言，老方言需要的翻译模块没装。**

# 解决方案

## 1. 在 Pod 所在节点加载 legacy 模块

```bash
modprobe ip_tablesmodprobe iptable_natmodprobe nf_natmodprobe xt_REDIRECTmodprobe xt_owner# 验证lsmod | grep -E 'iptable_nat|xt_REDIRECT|xt_owner'iptable_nat    12288  1xt_REDIRECT    16384  2xt_owner       12288  6ip_tables      32768  1 iptable_nat
```

## 2. 固化开机自动加载（必做）

`modprobe` 重启后失效，必须写入配置固化，否则节点一重启问题复发：

```bash
cat > /etc/modules-load.d/istio.conf <<'EOF'ip_tablesiptable_natnf_natxt_REDIRECTxt_ownerEOF
```

## 3. 删除故障 Pod，立即验证

CrashLoopBackOff 的重试间隔最长会退避到 5 分钟，手动删除触发重建更快：

```bash
kubectl -n app delete pod <pod>kubectl -n app get pods -w
```

预期过程：`Init:0/1` → `PodInitializing` → **`2/2 Running`**（业务容器 + sidecar）。init 通过后滚动更新继续，旧的 3 个无 sidecar 副本被自动替换。

## 4. 所有节点统一处理

本次只修了 Pod 当前所在的 node2，但 Pod 一旦漂移到其他节点就会复发。建议在**集群所有节点**上执行第 1、2 步。

# 经验总结

1. **CrashLoopBackOff 排查三板斧**：`kubectl describe pod` 看 Events → `kubectl logs -c <容器名> -p` 看上次崩溃日志 → 关注 Exit Code。init 容器的日志要单独用 `-c istio-init` 看。
2. **主机上 iptables 正常 ≠ 容器里能用**。iptables 有 legacy / nftables 两套后端，`iptables -t nat -L` 正常只说明 nft 后端可用；验证 legacy 链路要看 `lsmod | grep iptable_nat`。
3. **内核模块修复务必写入 `/etc/modules-load.d/`**，否则节点重启后复发。
4. **集群所有节点统一配置**，避免 Pod 漂移后踩同一个坑。
5. **版本适配问题要重视**：本次环境的 Istio 1.16.2 已停止维护，官方也不支持 Kubernetes 1.30。新版 Istio（1.24+）支持 CNI 模式 + nftables，流量劫持不再依赖 legacy iptables，可从根本上绕开此类问题。生产环境建议保持 Istio 与 K8s 版本在官方支持矩阵内。

> 参考：Istio 版本支持矩阵 https://istio.io/latest/docs/releases/supported-releases/

几点说明：

- **date** 用的 2026-09-15（日志里的时间），featured 沿用了 true，按需调整
- **category/tags** 我用了 `kubernetes` + `Kubernetes/Istio/iptables`，和你上一篇 MetalLB 的风格保持一致，可自行增删
- 日志做了精简裁剪，保留了关键报错行，方便读者对照；如果想更“实录”一些，可以把我之前回复里完整的 iptables rules 内容贴回去
- 文末把“Istio 版本老旧”写进了经验总结，既完整交代了背景，也自然引出下一篇可以写的选题（比如 Istio 升级 1.26 或 ambient 模式实践）