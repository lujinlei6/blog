---
title: MetalLB 实现访问 Kubernetes 内部 Pod
date: 2026-09-14
description: 使用 MetalLB 为 Kubernetes Service 提供 LoadBalancer 能力，实现集群外部访问内部 Pod，并理解 Layer2 模式下的流量转发原理
category: kubernetes
tags:
  - Kubernetes
featured: true
---



# 一、先理解最终架构

假设你的集群：

```
                    浏览器
                       |
                       | http://192.168.172.200
                       ↓
              ┌─────────────────┐
              │    MetalLB      │
              │   LoadBalancer  │
              └────────┬────────┘
                       │
              192.168.172.200
                       │
          ┌────────────┴────────────┐
          ↓                         ↓
       master                     node1
          │                         │
          └──────────┬──────────────┘
                     ↓
              Kubernetes Service
                 type: LB
                     │
             ┌───────┼───────┐
             ↓       ↓       ↓
            Pod     Pod     Pod
          nginx-1 nginx-2 nginx-3
```

这里最关键的是：

```
Service
type: LoadBalancer
        ↓
     MetalLB
        ↓
分配一个真实的局域网 IP
        ↓
192.168.172.200
```

以后你访问：

```
http://192.168.172.200
```

就可以访问 Kubernetes Service。

------

# 二、先确认你的网络环境

你需要先搞清楚：

**K8s 节点所在局域网网段。**

比如你之前实验环境出现过：

```
192.168.172.10
```

所以如果你的节点都在：

```
192.168.172.0/24
```

那么可以拿一段**没有被其他机器使用的 IP**给 MetalLB。

例如：

```
192.168.172.200
192.168.172.201
192.168.172.202
...
192.168.172.210
```

⚠️ **这里非常重要：**

这些 IP 必须：

1. 和 K8s 节点处于同一个二层网络
2. 没有被其他机器占用
3. 最好不要和 DHCP 地址池冲突

例如你的路由器 DHCP：

```
192.168.172.100 - 192.168.172.150
```

那么可以使用：

```
192.168.172.200 - 192.168.172.210
```

------

# 三、检查 kube-proxy 模式

你之前学习过 IPVS，而且你的环境很可能已经使用 IPVS。

先执行：

```
kubectl get cm kube-proxy -n kube-system -o yaml | grep -E "mode|strictARP"
```

如果看到：

```
mode: "ipvs"
```

那么需要确认：

```
strictARP: true
```

MetalLB 官方文档明确要求：**如果 kube-proxy 使用 IPVS，需要开启 strictARP。**[MetalLB](https://metallb.io/installation/?utm_source=chatgpt.com)

可以直接：

```
kubectl edit cm kube-proxy -n kube-system
```

找到：

```
mode: "ipvs"

ipvs:
  strictARP: true
```

然后：

```
kubectl delete pod -n kube-system -l k8s-app=kube-proxy
```

让 kube-proxy 重建。

检查：

```
kubectl get pod -n kube-system -l k8s-app=kube-proxy
```

------

# 四、安装 MetalLB

这里建议使用 MetalLB 的 **Native + Layer2** 模式。

对于你这种学习环境，不需要搞 BGP。

官方目前提供 manifest 安装方式。[MetalLB](https://metallb.io/installation/?utm_source=chatgpt.com)

执行：

```
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.16.1/config/manifests/metallb-native.yaml
```

然后查看：

```
kubectl get ns
```

应该出现：

```
metallb-system
```

查看 Pod：

```
kubectl get pod -n metallb-system
```

正常应该类似：

```
NAME                          READY   STATUS
controller-xxxxxxxxx-xxxxx   1/1     Running
speaker-xxxxx                1/1     Running
speaker-xxxxx                1/1     Running
speaker-xxxxx                1/1     Running
```

这里：

```
controller
```

负责：

```
给 LoadBalancer Service 分配 IP
```

而：

```
speaker
```

负责：

```
把这个 IP 宣告到你的局域网
```

MetalLB 官方架构也是 Controller + Speaker。[MetalLB](https://metallb.io/installation/?utm_source=chatgpt.com)

------

# 五、配置 IP 地址池

这是整个教程最重要的一步。

创建：

```
vim metallb-ip-pool.yaml
```

写：

```
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: my-ip-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.172.200-192.168.172.210
```

然后：

```
kubectl apply -f metallb-ip-pool.yaml
```

查看：

```
kubectl get ipaddresspool -n metallb-system
```

应该：

```
NAME         AUTO ASSIGN   AVOID BUGGY IPS
my-ip-pool   true
```

MetalLB 的 `IPAddressPool` 就是专门用来定义 LoadBalancer Service 可以使用哪些 IP 的。它支持 CIDR 和 IP 范围两种方式。[MetalLB](https://metallb.io/configuration/?utm_source=chatgpt.com)

------

# 六、配置 Layer2 Advertisement

仅仅有：

```
IPAddressPool
```

还不够。

你还需要告诉 MetalLB：

> 把这些 IP 宣告到局域网。

创建：

```
vim metallb-l2.yaml
```

内容：

```
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: my-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - my-ip-pool
```

执行：

```
kubectl apply -f metallb-l2.yaml
```

检查：

```
kubectl get l2advertisement -n metallb-system
```

应该：

```
NAME     IPADDRESSPOOLS
my-l2    ["my-ip-pool"]
```

Layer2 模式实际上是通过 **ARP** 宣告 IPv4 Service IP，因此局域网里的其他机器可以找到这个 IP 对应的节点。[MetalLB](https://metallb.io/configuration/?utm_source=chatgpt.com)

------

# 七、现在部署一个 Nginx

先创建 Deployment：

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
```

执行：

```
kubectl apply -f nginx.yaml
```

检查：

```
kubectl get pod -o wide
```

应该看到：

```
nginx-xxxx   Running   node1
nginx-xxxx   Running   node2
nginx-xxxx   Running   master
```

------

# 八、创建 LoadBalancer Service

重点来了。

创建：

```
apiVersion: v1
kind: Service
metadata:
  name: nginx-lb
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
  - port: 80
    targetPort: 80
```

执行：

```
kubectl apply -f nginx-lb.yaml
```

然后：

```
kubectl get svc
```

你应该看到类似：

```
NAME       TYPE           CLUSTER-IP      EXTERNAL-IP       PORT(S)
nginx-lb   LoadBalancer   10.96.100.10    192.168.172.200   80:xxxxx/TCP
```

最关键的是：

```
EXTERNAL-IP
192.168.172.200
```

🎉 这就是 MetalLB 分配给你的 LoadBalancer IP。

------

# 九、浏览器访问

现在直接打开：

```
http://192.168.172.200
```

应该就能看到：

```
Welcome to nginx!
```

整个链路就是：

```
浏览器
  ↓
192.168.172.200:80
  ↓
MetalLB
  ↓
Kubernetes Service
  ↓
kube-proxy
  ↓
Pod
  ↓
nginx:80
```

------

# 十、你可以观察整个过程

执行：

```
kubectl get svc nginx-lb -o wide
```

然后：

```
kubectl describe svc nginx-lb
```

你会看到 MetalLB 给 Service 分配 IP 的事件。

官方也建议 LoadBalancer 出现问题时，通过：

```
kubectl describe service <service-name>
```

查看事件。[MetalLB](https://metallb.io/usage/?utm_source=chatgpt.com)

------

# 十一、为什么 LoadBalancer 还有一个 NodePort？

你可能会发现：

```
NAME       TYPE           EXTERNAL-IP        PORT(S)
nginx-lb   LoadBalancer   192.168.172.200    80:31234/TCP
```

这里：

```
80:31234/TCP
```

意味着：

```
Service Port
     ↓
    80

NodePort
     ↓
  31234
```

所以实际上：

```
192.168.172.200:80
```

和：

```
节点IP:31234
```

都可以进入这个 Service。

可以理解成：

```
                 LoadBalancer
                      │
                      ↓
             192.168.172.200:80
                      │
                      ↓
                  Service
                 /       \
                ↓         ↓
          NodePort     ClusterIP
                │
                ↓
               Pod
```

------

# 十二、MetalLB 到底是不是“负载均衡器”？

这里有一个非常容易误解的地方。

如果你使用：

```
MetalLB Layer2
```

实际上**不是多个节点同时接收这个 LoadBalancer IP 的流量**。

MetalLB Layer2 的工作方式更接近：

```
192.168.172.200
        ↓
    某一个节点
        ↓
   kube-proxy
     ↙   ↓   ↘
   Pod  Pod  Pod
```

MetalLB 会让某一个节点负责宣告这个 IP。

如果这个节点挂掉：

```
node1 ❌
```

MetalLB 可以让其他节点接管：

```
node2
 ↓
192.168.172.200
```

所以官方也明确说明，Layer2 模式更准确地说是**流量吸引 + 故障转移**，而不是多个节点同时进行入口负载均衡。[MetalLB](https://metallb.io/concepts/layer2/?utm_source=chatgpt.com)

------

# 十三、如果你想看到真实客户端 IP

默认：

```
spec:
  type: LoadBalancer
```

实际上：

```
externalTrafficPolicy: Cluster
```

也就是：

```
客户端
  ↓
LB IP
  ↓
node1
  ↓
node2
  ↓
Pod
```

Pod 看到的源 IP 可能变成节点 IP。

如果你希望：

```
Pod 能看到客户端真实 IP
```

可以改成：

```
apiVersion: v1
kind: Service
metadata:
  name: nginx-lb
spec:
  type: LoadBalancer

  externalTrafficPolicy: Local

  selector:
    app: nginx

  ports:
  - port: 80
    targetPort: 80
```

这样：

```
客户端真实IP
       ↓
192.168.172.200
       ↓
MetalLB节点
       ↓
本节点Pod
```

MetalLB 官方文档也说明了 `Cluster` 和 `Local` 两种策略的区别。[MetalLB](https://metallb.io/usage/?utm_source=chatgpt.com)

------

# 十四、完整实验文件

你可以直接把下面三个文件放一起。

### ① IP 地址池

```
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: my-ip-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.172.200-192.168.172.210
```

### ② L2

```
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: my-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - my-ip-pool
```

### ③ LoadBalancer Service

```
apiVersion: v1
kind: Service
metadata:
  name: nginx-lb
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
  - port: 80
    targetPort: 80
```

然后：

```
kubectl apply -f metallb-ip-pool.yaml
kubectl apply -f metallb-l2.yaml
kubectl apply -f nginx.yaml
kubectl apply -f nginx-lb.yaml
```

最后：

```
kubectl get svc
```

看到：

```
nginx-lb   LoadBalancer   10.96.x.x   192.168.172.200   80:xxxxx/TCP
```

浏览器：

```
http://192.168.172.200
```

------

# 十五、你这个 K8s 实验环境特别需要注意的一点

你之前的集群节点如果是类似：

```
master  192.168.172.231
node1   192.168.172.232
node2   192.168.172.233
```

那么我建议你把 MetalLB 地址池设置成：

```
192.168.172.240-192.168.172.250
```

前提是这段 IP **确实没有被你的局域网设备/DHCP 占用**。

不要直接照抄 `192.168.172.200`，**IP 地址池必须根据你实际局域网规划来定。**

------

## 最后把整个知识点串起来

你现在可以把 Kubernetes 对外暴露方式理解成：

```
                    外部访问
                       │
         ┌─────────────┼─────────────┐
         ↓             ↓             ↓
      NodePort      LoadBalancer    Ingress
         │             │             │
         │          MetalLB           │
         │             │             │
         ↓             ↓             ↓
      NodeIP       LB虚拟IP        Ingress Controller
         │             │             │
         └─────────────┼─────────────┘
                       ↓
                  Service
                       ↓
                  Pod / Pod / Pod
```