---
title: pod问题排错：kubectl 速查与实战
date: 2026-09-24
description: Pod 起不来，一直报错，这里列举了几种pod的常见状态以及排错思路
category: kubernetes
tags:
- kubernetes
- pod
- 排障
---





# Kubernetes Pod 问题排查指南

> 适用于 K8s 集群中 Pod 出现 Pending / CrashLoopBackOff / ImagePullBackOff / NotReady / OOMKilled 等异常时的系统性排查。

---

## 目录

- [一、总体排查思路](#一总体排查思路)
- [二、第一步：拿到基础信息](#二第一步拿到基础信息)
- [三、按 Pod 状态分类排查](#三按-pod-状态分类排查)
  - [3.1 Pending](#31-pending)
  - [3.2 ContainerCreating / Terminating 卡住](#32-containercreating--terminating-卡住)
  - [3.3 ImagePullBackOff / ErrImagePull](#33-imagepullbackoff--errimagepull)
  - [3.4 CrashLoopBackOff](#34-crashloopbackoff)
  - [3.5 Running 但 Not Ready](#35-running-但-not-ready)
  - [3.6 OOMKilled](#36-oomkilled)
  - [3.7 Evicted（被驱逐）](#37-evicted被驱逐)
  - [3.8 Error / Completed 异常](#38-error--completed-异常)
- [四、跨 Pod / 服务层排查](#四跨-pod--服务层排查)
- [五、节点层排查](#五节点层排查)
- [六、事件与日志深挖技巧](#六事件与日志深挖技巧)
- [七、常用命令速查表](#七常用命令速查表)
- [八、排查决策树](#八排查决策树)

---

## 一、总体排查思路

排查 Pod 问题遵循**由外到内、由粗到细**的四步法：

```
1. 看状态 (kubectl get pod)          → 确定 Pod 处于哪个阶段
2. 看事件 (kubectl describe pod)      → K8s 调度/拉镜像/挂载/探针的报错
3. 看日志 (kubectl logs)              → 应用自身启动/运行报错
4. 看资源与节点 (describe node / top) → 资源不足、节点异常
```

**核心原则：**

- **事件（Events）优先于日志。** 很多问题（调度失败、拉镜像失败、探针失败）应用根本没启动，日志是空的，答案只在 Events 里。
- **注意 `Last State`。** 容器重启后 `State` 会显示成新状态，真正的死因在 `Last State` 里（尤其是 OOMKilled / Error）。
- **区分「单 Pod 问题」和「批量问题」。** 只有一个 Pod 挂 → 大概率是应用或该 Pod 的问题；同节点/同 Deployment 大批挂 → 集群或节点问题。

---

## 二、第一步：拿到基础信息

```bash
# 1. 看 Pod 概览（重点关注 STATUS、RESTARTS、AGE、NODE）
kubectl get pod -n <namespace> -o wide

# 2. 找到异常 Pod 后，持续观察状态变化（有时是间歇性的）
kubectl get pod -n <namespace> -w

# 3. 看详细信息和事件（最重要的一步）
kubectl describe pod <pod-name> -n <namespace>

# 4. 看容器日志
kubectl logs <pod-name> -n <namespace> -c <container-name>
```

### 关键命令的关键字段

`kubectl get pod -o wide` 要看：
| 字段 | 含义 |
|------|------|
| `STATUS` | Pod 当前状态（Pending / Running / CrashLoopBackOff...） |
| `READY` | 就绪容器数 / 总容器数，如 `0/1` 说明未就绪 |
| `RESTARTS` | 重启次数，持续增长说明容器在反复崩溃 |
| `NODE` | 调度到哪个节点，为空说明还没调度成功 |

`kubectl describe pod` 重点看：

```
Status:          Pending / Running / Failed
Reason:          <关键原因>
Node:            <node-name>/<node-ip>
Controlled By:   ReplicaSet/xxx
Conditions:      PodScheduled / Initialized / ContainersReady / Ready
Events:          <─── 90% 的答案在这里
  Type     Reason            Age   From     Message
  Warning  FailedScheduling  30s   default-scheduler  0/3 nodes are available...
Last State:      Terminated
  Reason:        OOMKilled
  Exit Code:     137
```

---

## 三、按 Pod 状态分类排查

### 3.1 Pending

**现象：** `STATUS = Pending`，`NODE` 为空或长期不变，Pod 调度不下去。

**排查：**

```bash
kubectl describe pod <pod> -n <ns> | grep -A 20 Events
```

常见 `FailedScheduling` 原因及处理：

| 报错信息                                                            | 原因               | 处理                                       |
| --------------------------------------------------------------- | ---------------- | ---------------------------------------- |
| `0/N nodes are available: N Insufficient cpu/memory`            | 集群资源不足           | 扩容节点、调小 requests、清理僵尸 Pod                |
| `N node(s) had taint {key:value}, that the pod didn't tolerate` | 节点有污点，Pod 没有容忍   | 加 tolerations 或去掉节点污点                    |
| `N node(s) didn't match node selector`                          | nodeSelector 不匹配 | 检查 `nodeSelector` / 节点 labels            |
| `N node(s) didn't match Pod's node affinity`                    | 亲和性不满足           | 检查 affinity 规则                           |
| `N node(s) had volume node affinity conflict`                   | PV 绑定的节点和调度节点不一致 | 检查 PV 的 nodeAffinity / 使用 local volume 时 |
| `N node(s) were unschedulable`                                  | 节点被 cordon       | `kubectl uncordon <node>`                |
| `pod has unbound immediate PersistentVolumeClaims`              | PVC 没绑定成功        | 检查 PVC/PV 状态、StorageClass                |
| `exceeded its progress deadline`                                | 未在期限内 Ready      | 见 Deployment 相关配置                        |
| 无 Events                                                        | 调度器没收到，或 Pod 被卡住 | 检查 kube-scheduler 是否正常、Pod 是否已存在同名       |

**补充检查：**

```bash
# 看节点是否可调度
kubectl get nodes
kubectl describe node <node> | grep -i taint

# 看集群资源余量
kubectl describe node <node> | grep -A 10 "Allocated resources"

# 看有没有触发 TopologySpreadConstraints / PodAntiAffinity 导致无处可放
kubectl describe pod <pod> -n <ns>
```

---

### 3.2 ContainerCreating / Terminating 卡住

**现象：** 长时间停留在 `ContainerCreating` 或 `Terminating`。

#### ContainerCreating 卡住

常见原因：

1. **镜像拉取慢**（大镜像、网络差、镜像仓库慢）
2. **CNI 网络插件异常** —— 拿不到 IP
3. **Volume 挂载失败** —— NFS/Ceph/云盘挂不上
4. **ConfigMap / Secret 不存在**

```bash
kubectl describe pod <pod> -n <ns> | tail -30

# 典型报错：
#   FailedMount: MountVolume.SetUp failed
#   FailedCreatePodSandBox: network plugin is not ready
#   Error syncing pod: configmap "xxx" not found
```

处理：

```bash
# ConfigMap/Secret 是否存在
kubectl get cm,secret -n <ns>

# CNI 是否正常
kubectl get pod -n kube-system | grep -E 'calico|flannel|cni|cilium'

# 节点 kubelet 是否正常
kubectl describe node <node> | grep -i "Kubelet"
```

#### Terminating 卡住

```bash
# 常见原因：finalizer 未清理、有进程无法被 kill、卷卸载失败
kubectl get pod <pod> -n <ns> -o json | jq '.metadata.finalizers'

# 强制删除（谨慎！确认无状态依赖后再用）
kubectl delete pod <pod> -n <ns> --grace-period=0 --force

# 节点 NotReady 时，Pod 会一直 Terminating，需要先恢复节点或删掉节点对象
kubectl get nodes
```

> ⚠️ `--force` 会跳过正常的优雅终止，仅适用于确认 Pod 已无实际运行进程（如节点已失联）的情况。

---

### 3.3 ImagePullBackOff / ErrImagePull

**现象：** 镜像拉不下来。

```bash
kubectl describe pod <pod> -n <ns> | grep -A 5 Events
```

| 报错                                              | 原因                 | 处理                          |
| ----------------------------------------------- | ------------------ | --------------------------- |
| `manifest unknown` / `not found`                | 镜像名/标签写错，或 tag 不存在 | 核对镜像地址与 tag                 |
| `unauthorized: authentication required`         | 私有仓库未配置凭证          | 创建/修正 imagePullSecret       |
| `x509: certificate signed by unknown authority` | 仓库用了自签证书           | 配置节点 containerd/docker 信任证书 |
| `dial tcp ... i/o timeout`                      | 网络不通，拉不到公网镜像       | 配置镜像加速/代理，或走内网仓库            |
| `no space left on device`                       | 节点磁盘满              | 清理节点镜像/日志                   |
| `pull QPS exceeded`                             | 拉取并发过高             | 检查是否大量 Pod 同时启动             |

**配置私有仓库凭证：**

```bash
kubectl create secret docker-registry my-registry-secret \
  --docker-server=<registry> \
  --docker-username=<user> \
  --docker-password=<password> \
  -n <ns>

# 在 Deployment 中引用
# spec.template.spec.imagePullSecrets:
#   - name: my-registry-secret
```

**在节点上手动测试拉取：**

```bash
# containerd 环境
crictl pull <image>

# docker 环境
docker pull <image>
```

---

### 3.4 CrashLoopBackOff

**现象：** 容器启动后立即退出，被 K8s 不断重启，重启间隔指数级增长（10s → 20s → 40s ... 最大 5 分钟）。

**排查：**

```bash
# 1. 看当前日志
kubectl logs <pod> -n <ns> --tail=200

# 2. 看上一次崩溃的日志（关键！）
kubectl logs <pod> -n <ns> --previous

# 3. 看退出码（关键！）
kubectl describe pod <pod> -n <ns> | grep -A 5 "Last State"
```

**退出码含义：**

| Exit Code | 含义           | 常见原因                                    |
| --------- | ------------ | --------------------------------------- |
| `0`       | 正常退出         | 主进程执行完就退出了（如启动命令是 shell 脚本跑完即结束）；需要常驻进程 |
| `1`       | 应用错误         | 代码异常、配置错误、启动参数错误                        |
| `126`     | 命令不可执行       | 命令没有执行权限                                |
| `127`     | 命令不存在        | entrypoint/cmd 写错，二进制路径不对               |
| `137`     | 被 SIGKILL 杀死 | **OOMKilled** 或存活探针失败被杀、节点驱逐            |
| `139`     | 段错误          | 程序崩溃（SIGSEGV），二进制的 libc 不兼容等            |
| `143`     | 被 SIGTERM 杀死 | 收到终止信号，通常是探针失败或优雅退出                     |

**常见原因清单：**

1. **配置错误**：ConfigMap/环境变量缺失、数据库连不上
2. **启动命令错误**：`command`/`args` 覆盖了镜像默认值
3. **依赖未就绪**：启动时连不上 DB/Redis，未做重试直接退出
4. **权限问题**：以非 root 运行但要求写文件
5. **资源限制太小**：启动即 OOM
6. **探针配置不合理**：liveness 探针 timeoutSeconds 太短，启动慢就被杀

**典型案例：liveness 探针杀死慢启动应用**

```yaml
# ❌ 错误：应用启动要 30s，但 5s 就开始探活，探针失败 → 重启 → 死循环
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  initialDelaySeconds: 5

# ✅ 修正：给足启动时间，或用 startupProbe
startupProbe:
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30
  periodSeconds: 10
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  initialDelaySeconds: 0
  periodSeconds: 10
```

---

### 3.5 Running 但 Not Ready

**现象：** Pod 是 `Running`，但 `READY 0/1`，Service 里摘不到流量。

```bash
kubectl describe pod <pod> -n <ns> | grep -A 10 Conditions
# Conditions 里 Readiness Probe 相关
```

**排查步骤：**

1. **看 Events 里的探针失败信息**
   
   ```
   Warning  Unhealthy  Readiness probe failed: HTTP probe failed with statuscode: 500
   ```

2. **进容器手动验证探针**
   
   ```bash
   kubectl exec -it <pod> -n <ns> -- sh
   curl -v http://localhost:8080/healthz
   ```

3. **常见探针问题：**

| 问题                     | 说明                                   |
| ---------------------- | ------------------------------------ |
| 端口写错                   | 探针 `port` 和容器实际监听端口不一致               |
| 路径返回非 2xx/3xx          | `/health` 返回 401/404/500 都算失败        |
| host 不对                | 应用只监听 127.0.0.1，`httpGet` 默认走 Pod IP |
| initialDelaySeconds 太短 | 应用还没起来就开始探                           |
| 就绪探针依赖外部服务             | DB 挂了导致 Readiness 一直 false           |

> **注意：** Readiness 探针失败**不会**重启容器，只会把 Pod 从 Service Endpoints 摘除；Liveness 失败才会重启。

---

### 3.6 OOMKilled

**现象：** 容器被内核 OOM Killer 杀死，退出码 137，`Last State.Reason = OOMKilled`。

```bash
kubectl describe pod <pod> -n <ns> | grep -i oom
# Last State:  Terminated
#   Reason:    OOMKilled
#   Exit Code: 137
```

**排查：**

```bash
# 1. 看 Pod 实际内存使用
kubectl top pod <pod> -n <ns> --containers

# 2. 看 limit 设置
kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[*].resources}'

# 3. 看节点内存压力
kubectl top node
kubectl describe node <node> | grep -A 5 "MemoryPressure"
```

**OOMKilled 的两种类型：**

| 类型          | 说明                        | 处理                                      |
| ----------- | ------------------------- | --------------------------------------- |
| **容器级 OOM** | 容器内存超过自己的 `limits.memory` | 调大 limit，或优化应用内存（找内存泄漏）                 |
| **节点级 OOM** | 节点内存不足，内核杀 Pod            | 调大节点规格、设置合理 requests、检查是否有 Pod 突破 limit |

**处理建议：**

```yaml
resources:
  requests:
    memory: "512Mi"   # 调度依据
  limits:
    memory: "1Gi"     # 硬上限，超过就被杀
```

- requests 应接近应用真实稳态内存
- limits 建议为 requests 的 1.5~2 倍，给峰值留余量
- Java 应用注意 `-Xmx` 要小于容器 limit（推荐 limit 的 70~80%），否则 JVM 堆外内存 + 堆会超出

---

### 3.7 Evicted（被驱逐）

**现象：** Pod 状态 `Evicted`，`kubectl get pod` 里一堆 Evicted 的僵尸 Pod。

```bash
kubectl describe pod <pod> -n <ns>
# Status: Failed
# Reason: Evicted
# Message: The node was low on resource: memory.  /  ephemeral-storage.
```

**常见驱逐原因：**

| 原因                                                | 说明            |
| ------------------------------------------------- | ------------- |
| `The node was low on resource: memory`            | 节点内存不足        |
| `The node was low on resource: ephemeral-storage` | 节点磁盘/本地存储不足   |
| `DiskPressure`                                    | 磁盘压力（镜像、日志占满） |
| `MemoryPressure`                                  | 内存压力          |
| `PIDPressure`                                     | 进程数过多         |

**处理：**

```bash
# 1. 清理已 Evicted 的 Pod
kubectl get pods -n <ns> --field-selector=status.phase=Failed
kubectl delete pod -n <ns> --field-selector=status.phase=Failed

# 2. 检查节点磁盘
kubectl describe node <node> | grep -A 5 Conditions
df -h                      # 在节点上执行
crictl rmi --prune         # 清理无用镜像

# 3. 检查 kubelet 配置的驱逐阈值
# /var/lib/kubelet/config.yaml
# evictionHard:
#   memory.available: "100Mi"
#   nodefs.available: "10%"
```

**防止业务 Pod 被驱逐：**

```yaml
# 提高 QoS 等级：requests == limits → Guaranteed
resources:
  requests: { cpu: "1", memory: "1Gi" }
  limits:   { cpu: "1", memory: "1Gi" }
```

QoS 等级：`Guaranteed` > `Burstable` > `BestEffort`，驱逐时从低到高杀。

---

### 3.8 Error / Completed 异常

- **`Completed`**：正常完成。如果它本该常驻运行，说明主进程退出了 → 检查启动命令是否跑完就结束。

- **`Error`**：容器非 0 退出但还不是 CrashLoopBackOff 状态（比如没重启策略或被重启次数限制）。
  
  ```bash
  kubectl get pod <pod> -n <ns> -o jsonpath='{.status.containerStatuses[*].state}'
  kubectl logs <pod> -n <ns> --previous
  ```

**检查重启策略：**

```yaml
spec:
  restartPolicy: Always   # Always / OnFailure / Never
```

- 常驻服务用 `Always`
- Job 用 `OnFailure` 或 `Never`

---

## 四、跨 Pod / 服务层排查

当单个 Pod 看起来正常，但服务整体异常时：

```bash
# 1. Deployment / StatefulSet 是否副本数正常
kubectl get deploy,sts,rs -n <ns>
kubectl describe deploy <name> -n <ns>        # 看 rollout 状态和事件
kubectl rollout status deploy/<name> -n <ns>
kubectl rollout history deploy/<name> -n <ns>

# 2. Service 是否有正确的 Endpoints（最常见坑）
kubectl get svc <svc> -n <ns> -o wide
kubectl get endpoints <svc> -n <ns>          # <── 空的话说明 selector 没匹配上
kubectl describe svc <svc> -n <ns>

# 3. 排查 Service 无 Endpoints
kubectl get pod -n <ns> --show-labels | grep <svc-name>
# 对比 svc 的 spec.selector 和 Pod 的 labels 是否一致
```

**常见服务层问题：**

| 现象                   | 原因                                      |
| -------------------- | --------------------------------------- |
| Service 能 ping 通但连不上 | `targetPort` 写错，或应用监听地址不对               |
| Endpoints 为空         | Pod labels 与 Service selector 不匹配       |
| Endpoints 有值但访问不通    | Pod 未 Ready（Readiness 探针失败）→ 被摘除        |
| 部分请求失败               | 滚动更新过程中新旧 Pod 混合，或某 Pod 异常              |
| DNS 解析失败             | CoreDNS 异常、`ndots` 配置、NetworkPolicy 拦截  |
| 跨命名空间访问失败            | 用了短域名，需用 `<svc>.<ns>.svc.cluster.local` |

**DNS 排查：**

```bash
kubectl run tmp-shell --rm -it --image=busybox:1.28 --restart=Never -- sh
# 容器内：
nslookup kubernetes.default
nslookup <svc>.<ns>.svc.cluster.local
cat /etc/resolv.conf
```

**网络连通性排查：**

```bash
# 检查 NetworkPolicy 是否拦截
kubectl get networkpolicy -n <ns>
kubectl describe networkpolicy <name> -n <ns>

# Pod 内测连通
kubectl exec -it <pod> -n <ns> -- sh -c 'nc -zv <svc> <port>'
kubectl exec -it <pod> -n <ns> -- sh -c 'curl -v http://<svc>:<port>/'
```

---

## 五、节点层排查

当同一节点上的多个 Pod 同时异常，或 Pod 无法调度时：

```bash
# 1. 节点状态
kubectl get nodes
kubectl describe node <node>

# 重点看 Conditions：
#   Ready            = True / False / Unknown
#   MemoryPressure   = True → 内存紧张
#   DiskPressure     = True → 磁盘紧张
#   PIDPressure      = True → 进程数过多
#   NetworkUnavailable

# 2. 节点资源占用
kubectl top node
kubectl describe node <node> | grep -A 15 "Allocated resources"

# 3. 节点上 kubelet 状态（登录节点）
systemctl status kubelet
journalctl -u kubelet -n 200 --no-pager

# 4. 容器运行时状态（登录节点）
systemctl status containerd    # 或 docker
crictl ps -a
crictl logs <container-id>
```

**节点 NotReady 常见原因：**

- kubelet 进程挂了 / 配置错误
- 容器运行时（containerd/docker）挂了
- 节点磁盘满
- 网络插件异常
- 节点负载过高，心跳超时

```bash
# 重新调度该节点上的 Pod（先驱逐再恢复）
kubectl cordon <node>                       # 标记不可调度
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data   # 驱逐
kubectl uncordon <node>                     # 恢复调度
```

---

## 六、事件与日志深挖技巧

### 6.1 查看集群事件

```bash
# 全命名空间事件（按时间排序，最新的在下）
kubectl get events -A --sort-by='.lastTimestamp'

# 只看 Warning
kubectl get events -A --field-selector type=Warning --sort-by='.lastTimestamp'

# 看某个 Pod 的事件
kubectl describe pod <pod> -n <ns> | sed -n '/Events:/,$p'
```

> Events 默认只保留 1 小时，长时间问题需先察觉再排查。

### 6.2 日志技巧

```bash
# 实时跟踪
kubectl logs -f <pod> -n <ns>

# 上次崩溃的日志
kubectl logs <pod> -n <ns> --previous

# 最近 10 分钟
kubectl logs <pod> -n <ns> --since=10m

# 指定容器（多容器 Pod）
kubectl logs <pod> -n <ns> -c <container-name>

# 多 Pod 聚合（按 label）
kubectl logs -l app=myapp -n <ns> --tail=100 --prefix

# 所有容器
kubectl logs <pod> -n <ns> --all-containers=true
```

### 6.3 进容器诊断

```bash
kubectl exec -it <pod> -n <ns> -- /bin/sh
# 或指定容器
kubectl exec -it <pod> -n <ns> -c <container> -- /bin/bash

# 容器没有 shell 时，用临时调试容器（Ephemeral Container）
kubectl debug -it <pod> -n <ns> --image=busybox:1.28 --target=<container>

# 复制一个带调试工具的 Pod 副本
kubectl debug <pod> -n <ns> --copy-to=<pod>-debug --image=nicolaka/netshoot
```

### 6.4 保存现场

```bash
# 导出完整 Pod YAML（含 status）
kubectl get pod <pod> -n <ns> -o yaml > pod-debug.yaml

# 导出事件
kubectl get events -n <ns> --sort-by='.lastTimestamp' > events.txt

# 导出日志
kubectl logs <pod> -n <ns> --previous > prev.log
```

---

## 七、常用命令速查表

### 状态查看

| 目的               | 命令                                                                         |
| ---------------- | -------------------------------------------------------------------------- |
| 列出所有 Pod         | `kubectl get pod -A -o wide`                                               |
| 按状态过滤            | `kubectl get pod -A --field-selector=status.phase=Pending`                 |
| 找重启多的 Pod        | `kubectl get pod -A --sort-by='.status.containerStatuses[0].restartCount'` |
| 找非 Running 的 Pod | `kubectl get pod -A \| grep -vE 'Running\|Completed'`                      |
| 实时观察             | `kubectl get pod -w`                                                       |

### 诊断

| 目的        | 命令                                             |
| --------- | ---------------------------------------------- |
| 详细信息 + 事件 | `kubectl describe pod <pod> -n <ns>`           |
| 当前日志      | `kubectl logs <pod> -n <ns>`                   |
| 上次崩溃日志    | `kubectl logs <pod> -n <ns> --previous`        |
| 进入容器      | `kubectl exec -it <pod> -n <ns> -- sh`         |
| 资源占用      | `kubectl top pod <pod> -n <ns> --containers`   |
| 节点资源      | `kubectl top node`                             |
| 端口转发调试    | `kubectl port-forward <pod> 8080:8080 -n <ns>` |

### 资源与配置

| 目的           | 命令                                                                                |
| ------------ | --------------------------------------------------------------------------------- |
| 查看资源配置       | `kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[*].resources}'`     |
| 查看探针         | `kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[*].livenessProbe}'` |
| 查看镜像         | `kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[*].image}'`         |
| 查看 PVC       | `kubectl get pvc -n <ns>`                                                         |
| 查看 ConfigMap | `kubectl get cm -n <ns>`                                                          |

### 恢复操作

| 目的            | 命令                                                                |
| ------------- | ----------------------------------------------------------------- |
| 重启 Deployment | `kubectl rollout restart deploy/<name> -n <ns>`                   |
| 回滚            | `kubectl rollout undo deploy/<name> -n <ns>`                      |
| 删除卡住的 Pod     | `kubectl delete pod <pod> -n <ns> --grace-period=0 --force`       |
| 清理 Evicted    | `kubectl delete pod -n <ns> --field-selector=status.phase=Failed` |
| 节点驱逐          | `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data` |
| 节点恢复          | `kubectl uncordon <node>`                                         |

---

## 八、排查决策树

```
Pod 有问题
│
├─ STATUS = Pending
│   ├─ describe pod 看 Events
│   ├─ "Insufficient cpu/memory"     → 资源不足，扩容/调小 requests
│   ├─ "didn't tolerate taint"       → 加 tolerations
│   ├─ "didn't match nodeSelector"   → 检查 nodeSelector / labels
│   ├─ "unbound PVC"                 → 检查 PVC/PV/StorageClass
│   └─ 无 Events                     → 检查 scheduler 是否正常
│
├─ STATUS = ContainerCreating（长时间）
│   ├─ FailedMount                    → 检查 Volume / ConfigMap / Secret
│   ├─ FailedCreatePodSandBox         → 检查 CNI 网络插件
│   └─ 拉镜像慢                        → 检查镜像仓库网络
│
├─ STATUS = ImagePullBackOff / ErrImagePull
│   ├─ 镜像名/tag 错误                 → 修正镜像地址
│   ├─ unauthorized                    → 配置 imagePullSecret
│   ├─ x509 证书错误                   → 配置仓库证书信任
│   └─ 网络超时                        → 配置代理/加速器
│
├─ STATUS = CrashLoopBackOff
│   ├─ logs --previous 看上次日志
│   ├─ describe 看 Last State / Exit Code
│   ├─ Exit 137 + OOMKilled            → 调大 memory limit / 查内存泄漏
│   ├─ Exit 1                          → 应用错误，看日志找堆栈
│   ├─ Exit 127/126                    → command/entrypoint 写错
│   └─ 反复被 liveness 杀              → 加 startupProbe / 调大 initialDelay
│
├─ STATUS = Running 但 READY 0/1
│   ├─ Readiness 探针失败              → exec 进容器手动 curl 探针地址
│   ├─ 探针端口/路径错误               → 修正 probe 配置
│   └─ 依赖服务不可用                  → 先修依赖
│
├─ STATUS = Evicted
│   ├─ 节点内存/磁盘压力               → 清理节点、扩容、提高 QoS
│   └─ 设置 requests=limits → Guaranteed QoS
│
├─ STATUS = Terminating（卡住）
│   ├─ 有 finalizer                   → 检查并清理 finalizer
│   ├─ 节点 NotReady                  → 恢复节点或删节点对象
│   └─ 强制删除                       → --grace-period=0 --force
│
└─ Pod 正常但服务不通
    ├─ Endpoints 为空                 → 检查 Service selector vs Pod labels
    ├─ Endpoints 有值但访问失败       → 检查 targetPort / 应用监听地址
    ├─ DNS 解析失败                   → 检查 CoreDNS
    └─ NetworkPolicy 拦截             → 检查 NetworkPolicy 规则
```

---

## 九、避坑清单（Best Practices）

1. **永远设置 resources.requests 和 limits**，不要裸奔，否则容易被驱逐或影响调度。
2. **liveness 探针不要配得太激进**，慢启动应用务必用 `startupProbe`。
3. **readiness 探针与 liveness 探针语义要分清**：前者摘流量，后者重启容器。
4. **Java 应用注意堆外内存**，`-Xmx` 要明显小于容器 memory limit。
5. **tag 不要用 `latest`**，会导致滚动更新时镜像不一致。
6. **ConfigMap / Secret 更新后 Pod 不会自动生效**（挂载方式），需要重启或使用 Reloader。
7. **注意 PDB（PodDisruptionBudget）**，可能阻止 drain 导致节点维护卡住。
8. **ImagePullSecret 要配在 Pod 所在 namespace，并挂到 serviceAccount 上**，否则新 Pod 拉不到镜像。
9. **常排查 Evicted 僵尸 Pod**，它们会占着资源额度影响调度判断。
10. **生产环境开启事件持久化**（如 eventrouter → ES/Loki），否则 1 小时后就查不到原因。

---

## 附录：一键排查脚本

```bash
#!/bin/bash
# 用法: ./debug-pod.sh <namespace> <pod-name>
NS=${1:-default}
POD=${2}

echo "===== 1. Pod 概览 ====="
kubectl get pod "$POD" -n "$NS" -o wide

echo -e "\n===== 2. Pod 详情（Events 在末尾） ====="
kubectl describe pod "$POD" -n "$NS" | tail -60

echo -e "\n===== 3. 当前日志（最后 50 行） ====="
kubectl logs "$POD" -n "$NS" --tail=50 2>/dev/null || echo "(无日志)"

echo -e "\n===== 4. 上次崩溃日志（最后 50 行） ====="
kubectl logs "$POD" -n "$NS" --previous --tail=50 2>/dev/null || echo "(无上次日志)"

echo -e "\n===== 5. 容器状态与退出码 ====="
kubectl get pod "$POD" -n "$NS" -o jsonpath='{range .status.containerStatuses[*]}{.name}{"\t"}restarts={.restartCount}{"\t"}state={.state}{"\t"}lastState={.lastState}{"\n"}{end}'

echo -e "\n===== 6. 资源使用 ====="
kubectl top pod "$POD" -n "$NS" --containers 2>/dev/null || echo "(metrics-server 不可用)"
```

---

*文档版本：v1.0 | 适用于 Kubernetes 1.20+*
