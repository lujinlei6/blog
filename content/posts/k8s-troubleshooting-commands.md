---
title: Kubernetes 排障高频命令：kubectl 速查与实战
date: 2026-09-03
description: Pod 起不来、服务访问不通、节点 NotReady……90% 的 K8s 日常排障都靠这十几个 kubectl 命令。按排查路径整理成一篇可以贴在工位的速查手册。
category: kubernetes
tags:
  - kubernetes
  - kubectl
  - 排障
---

K8s 出问题的表象千奇八怪，但排查路径基本固定：**Pod → 控制面 → Service/网络 → 节点**。把这条路径上的命令练熟，大部分故障十分钟内就能定位。

## 一、Pod 起不来：先 describe，再看 logs

```bash
kubectl get pods -A                         # 全局视角，先看有多少异常
kubectl describe pod my-app-7d9f8b6c5-x2k4z # 事件时间线都在 Events 里
kubectl logs my-app-7d9f8b6c5-x2k4z --previous   # 上一次崩溃前的日志，排 CrashLoopBackOff 必备
```

高频状态码含义：

| 状态 | 含义 | 第一反应 |
| ---- | ---- | ---- |
| ImagePullBackOff | 拉不到镜像 | 检查镜像名/凭证/仓库网络 |
| CrashLoopBackOff | 起来就崩 | `--previous` 看崩溃日志 |
| Pending | 没节点能调度 | 资源不足或节点污点 |
| Evicted | 被驱逐 | 节点磁盘/内存压力 |

## 二、资源到底给了多少

```bash
kubectl top pods -n prod
kubectl top nodes
kubectl get pod my-app -o jsonpath='{.spec.containers[0].resources}'
```

Pending 十有八九是 `requests` 写太大，或者节点碎片化——`kubectl describe node` 看 `Allocated resources` 那一段。

## 三、Service 访问不通

```bash
# 1. endpoint 有没有就绪——没有就是 selector/探针问题
kubectl get endpoints my-service

# 2. 进 Pod 里直接测 Service DNS
kubectl run netshoot --rm -it --image=nicolaka/netshoot -- curl -v http://my-service.prod.svc.cluster.local:8080

# 3. kube-proxy 规则是否正常
kubectl logs -n kube-system -l k8s-app=kube-proxy --tail=50
```

`endpoints` 为空是最高频原因：selector 标签对不上，或者 Pod 的 `readinessProbe` 一直不过。

## 四、控制面组件

```bash
kubectl get componentstatuses          # 老版本可用，scheduler/controller-manager/etcd 健康
kubectl get events -A --sort-by=.lastTimestamp   # 全集群事件按时间排序
kubectl get cs,sa,cm,secret -n prod    # 依赖的配置是否齐全
```

## 五、节点 NotReady

```bash
kubectl describe node worker-03        # 看 Conditions 和 Events
journalctl -u kubelet -n 100           # kubelet 日志
```

常见原因：kubelet 挂了、容器运行时（containerd）挂了、节点资源耗尽被系统 OOM。云上还要看安全组有没有拦住 control plane 的 10250 端口。

## 六、应急与回滚

```bash
kubectl rollout undo deployment/my-app                 # 回滚上一个版本
kubectl rollout history deployment/my-app              # 看版本历史
kubectl scale deployment/my-app --replicas=5           # 手动扩容扛流量
kubectl delete pod my-app-xxxxx --grace-period=0 --force   # 最后手段，别当常规操作
```

## 七、日常好用别名

```bash
alias k='kubectl'
alias kgp='kubectl get pods'
alias kaf='kubectl apply -f'
complete -o default -F __start_kubectl k
```

排障的本质是沿着「期望状态 → 实际状态 → 差异原因」这条链路走，kubectl 的每个子命令都是在回答其中一环。命令背不下来没关系，把这条链路记住，命令自然就长在手上了。
