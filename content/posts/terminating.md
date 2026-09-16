---
title: Kubernetes Namespace 卡在 Terminating 状态的解决方法
date: 2026-09-16
description: 解决 Kubernetes Namespace 长时间处于 Terminating 状态的问题，并深入理解 Finalizer 的作用以及强制删除 Namespace 的方法
category: kubernetes
tags:
  - Kubernetes
---
# Kubernetes Namespace 卡在 Terminating 状态的解决方法

在 Kubernetes 中删除 Namespace 时，有时会遇到 Namespace 长时间处于 `Terminating` 状态，导致其中的资源无法重新创建。

本文以安装 Calico 时遇到的 `tigera-operator` Namespace 卡在 `Terminating` 为例，介绍问题的排查过程、Finalizer 的作用以及如何正确处理。

## 一、问题背景

在 Kubernetes 集群中重新安装 Calico 时执行：

```
kubectl apply -f tigera-operator.yaml
```

发现出现如下错误：

```
Warning: Detected changes to resource tigera-operator which is currently being deleted.
```

同时创建资源时出现：

```
Error from server (Forbidden):
serviceaccounts "tigera-operator" is forbidden
unable to create new content in namespace tigera-operator because it is being terminated
```

Deployment 也无法创建：

```
Error from server (Forbidden):
deployments.apps "tigera-operator" is forbidden
unable to create new content in namespace tigera-operator because it is being terminated
```

这说明并不是 YAML 文件本身无法创建，而是：

> `tigera-operator` Namespace 正处于删除流程中。

## 二、确认 Namespace 状态

首先查看 Namespace：

```
kubectl get ns
```

可以看到：

```
NAME              STATUS        AGE
default           Active        30d
kube-system       Active        30d
tigera-operator   Terminating   ...
```

进一步查看：

```
kubectl get ns tigera-operator -o yaml
```

重点关注：

```
spec:
  finalizers:
    - kubernetes
```

如果 Namespace 长时间保持：

```
STATUS: Terminating
```

通常说明 Namespace 删除流程中的某个清理步骤没有完成。

# 三、什么是 Finalizer？

理解这个问题之前，需要先理解 Kubernetes 中的 `Finalizer`。

Finalizer 可以简单理解成：

> **删除资源之前必须完成的“清理任务”。**

例如：

```
删除 Namespace
      ↓
Kubernetes 标记 Namespace 为 Terminating
      ↓
检查 Namespace 中的资源
      ↓
执行相关清理操作
      ↓
Finalizer 完成
      ↓
Namespace 真正删除
```

如果某个 Finalizer 一直没有被移除，Namespace 就可能一直处于：

```
Terminating
```

状态。

## 四、为什么不能直接重新创建？

这是这次问题中比较容易误解的地方。

当 Namespace 已经进入：

```
Terminating
```

状态后，Kubernetes 不允许继续向其中创建新的资源。

例如：

```
kubectl apply -f tigera-operator.yaml
```

虽然 YAML 中可能包含：

```
apiVersion: v1
kind: Namespace

metadata:
  name: tigera-operator
```

但是此时 Kubernetes 发现：

```
tigera-operator
```

已经存在，并且正在删除。

因此不会重新创建一个新的 Namespace。

反而会出现：

```
namespace "tigera-operator" is being terminated
```

以及：

```
serviceaccounts "tigera-operator" is forbidden
```

所以：

> **必须先解决 Namespace 的 Terminating 状态，再重新部署 Tigera Operator。**

# 五、查看 Namespace 的 Finalizer

可以直接查看完整 JSON：

```
kubectl get ns tigera-operator -o json
```

重点关注：

```
{
  "spec": {
    "finalizers": [
      "kubernetes"
    ]
  }
}
```

如果确认 Namespace 已经无法正常完成删除，可以考虑手动移除 Finalizer。

# 六、强制清理 Namespace

首先导出 Namespace：

```
kubectl get ns tigera-operator -o json > /tmp/tigera-ns.json
```

然后编辑：

```
vim /tmp/tigera-ns.json
```

找到：

```
"spec": {
    "finalizers": [
        "kubernetes"
    ]
}
```

修改为：

```
"spec": {
    "finalizers": []
}
```

也就是将：

```
kubernetes
```

这个 Finalizer 移除。

然后执行：

```
kubectl replace --raw "/api/v1/namespaces/tigera-operator/finalize" -f /tmp/tigera-ns.json
```

如果执行成功，再检查：

```
kubectl get ns
```

正常情况下：

```
tigera-operator
```

应该已经消失。

# 七、重新安装 Tigera Operator

Namespace 删除完成后，再重新执行：

```
kubectl apply -f tigera-operator.yaml
```

然后检查：

```
kubectl get ns
```

应该可以看到：

```
tigera-operator   Active
```

继续检查：

```
kubectl get pods -n tigera-operator
```

例如：

```
NAME                              READY   STATUS    RESTARTS   AGE
tigera-operator-xxxxxxxxxx-xxxxx 1/1     Running   0          30s
```

说明 Tigera Operator 已经正常启动。

# 八、Finalizer 并不是越多越好删

这里需要特别注意：

> **不要看到资源 Terminating 就直接删除 Finalizer。**

Finalizer 的存在本身是有意义的。

例如某些 Operator、存储插件或者云资源控制器，在删除 Kubernetes 资源之前，需要先完成外部资源清理。

正常流程应该是：

```
删除资源
   ↓
进入 Terminating
   ↓
Controller 执行清理
   ↓
清理完成
   ↓
Controller 删除 Finalizer
   ↓
资源彻底删除
```

如果直接强制删除 Finalizer：

```
删除资源
   ↓
强制删除 Finalizer
   ↓
资源消失
   ↓
Controller 还没完成清理
```

可能导致：

- 残留云资源
- 残留存储资源
- 残留网络配置
- 残留 CRD 对象
- 僵尸资源

因此，**强制删除 Finalizer 应该作为排障手段，而不是常规删除方式。**

# 九、Namespace 的 Finalizer 和普通资源有什么区别？

Namespace 有专门的 Finalize API：

```
/api/v1/namespaces/<namespace>/finalize
```

因此 Namespace 可以使用：

```
kubectl replace --raw \
"/api/v1/namespaces/tigera-operator/finalize" \
-f /tmp/tigera-ns.json
```

但是这并不意味着所有 Kubernetes 资源都可以这么处理。

例如：

```
Namespace
Deployment
Pod
PVC
PV
CR
CRD
```

它们的删除机制并不完全一样。

所以：

> **Namespace 的 Finalizer 处理方法不能直接套用到所有 Kubernetes 资源。**

遇到其他资源卡在 `Terminating` 时，应该先查看：

```
kubectl get <资源类型> <资源名称> -o yaml
```

然后检查：

```
metadata:
  finalizers:
```

根据 Finalizer 对应的 Controller 判断为什么清理没有完成。

# 十、这次问题的完整排查思路

这次 Calico 安装过程中，实际遇到了两个不同层面的问题。

首先是：

```
tigera-operator
        ↓
Namespace Terminating
        ↓
无法创建 ServiceAccount / Deployment
        ↓
Calico Operator 无法正常重新部署
```

因此第一步应该处理 Namespace：

```
kubectl get ns tigera-operator
kubectl get ns tigera-operator -o json
```

确认确实卡住后，再根据实际情况清理 Finalizer：

```
kubectl get ns tigera-operator -o json > /tmp/tigera-ns.json
```

修改：

```
"finalizers": []
```

最后：

```
kubectl replace --raw \
"/api/v1/namespaces/tigera-operator/finalize" \
-f /tmp/tigera-ns.json
```

确认：

```
kubectl get ns
```

Namespace 消失后，再重新：

```
kubectl apply -f tigera-operator.yaml
```

# 十一、排障命令总结

### 1. 查看 Namespace

```
kubectl get ns
```

### 2. 查看 Namespace 详细信息

```
kubectl get ns tigera-operator -o yaml
```

### 3. 查看 Finalizer

```
kubectl get ns tigera-operator -o json
```

### 4. 导出 Namespace

```
kubectl get ns tigera-operator -o json > /tmp/tigera-ns.json
```

### 5. 编辑 Finalizer

```
vim /tmp/tigera-ns.json
```

修改：

```
"finalizers": [
    "kubernetes"
]
```

为：

```
"finalizers": []
```

### 6. 强制完成 Namespace 删除

```
kubectl replace --raw \
"/api/v1/namespaces/tigera-operator/finalize" \
-f /tmp/tigera-ns.json
```

### 7. 确认删除结果

```
kubectl get ns
```

### 8. 重新部署

```
kubectl apply -f tigera-operator.yaml
```

# 十二、总结

Namespace 长时间处于 `Terminating`，本质上通常是：

```
删除请求
   ↓
Namespace 进入 Terminating
   ↓
资源清理
   ↓
Finalizer 没有正常完成
   ↓
Namespace 无法最终删除
```

遇到这种问题时，不要第一时间反复执行：

```
kubectl apply -f xxx.yaml
```

因为 Namespace 还处于删除状态时，新的资源无法正常创建。

正确的排查思路是：

```
① kubectl get ns
        ↓
② 确认 Namespace 是否 Terminating
        ↓
③ 查看 metadata/finalizers
        ↓
④ 分析为什么 Finalizer 没有被正常清理
        ↓
⑤ 确认可以接受强制清理的后果
        ↓
⑥ 必要时移除 Finalizer
        ↓
⑦ Namespace 删除完成
        ↓
⑧ 重新部署应用
```

**需要注意的是，Finalizer 是 Kubernetes 保证资源清理完整性的重要机制。强制移除 Finalizer 虽然可以解决“卡死”的资源，但可能留下未清理的底层资源，因此应当在确认影响后使用。**