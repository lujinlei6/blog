---
title: k8s实现MySQL主从复制
date: 2026-10.12
description: 此博客用的是GTID实现主从复制的
category: kubernetes
tags:
- kubernetes
- pod
- mysql

---





### 1. 创建密码 Secret

先生成 Secret，避免把密码直接写在 ConfigMap 中。

创建 `mysql-secret.yaml`：

```
apiVersion: v1
kind: Secret
metadata:
  name: mysql-secret
type: Opaque
stringData:
  root-password: "请替换为你的强密码"
  app-password: "请替换为应用专用密码"
```

应用配置：

```
kubectl apply -f mysql-secret.yaml
```

注意：Kubernetes Secret 默认并不等于加密存储。生产环境还需要配置 etcd 静态加密、RBAC 最小权限以及凭据轮换。

### 2. 主从集群配置

创建 `mysql-cluster.yaml`：

```bash

apiVersion: v1
kind: ConfigMap
metadata:
  name: mysql-conf
data:
  mysql.conf: |
    [mysqld]
    skip-host-cache  #禁用主机名缓存
    skip-name-resolve     #不通过 DNS 反向解析客户端 IP；账户授权时要注意使用 IP 或 % 等匹配方式
    datadir=/var/lib/mysql  
    socket=/var/run/mysqld/mysqld.sock
    secure-file-priv=/var/lib/mysql-files
    user=mysql
    log-bin=mysql-bin
    relay-log=relay-bin
    gtid_mode=ON   #开启 GTID（全局事务标识符）模式。
    enforce_gtid_consistency=ON   #强制操作符合 GTID 一致性要求
    server-id=101
    read_only=OFF
    pid-file=/var/run/mysqld/mysqld.pid

    [client]
    socket=/var/run/mysqld/mysqld.sock

    !includedir /etc/mysql/conf.d/      #让 MySQL 读取指定目录中的其他配置文件。

---
apiVersion: v1
kind: Service
metadata:
  name: master-slave
spec:
  clusterIP: None
  publishNotReadyAddresses: true     #没有准备的pod也会被dns解析到
  ports:
  - name: mysql
    port: 3306
    targetPort: 3306
  selector:
    apps: db

---
apiVersion: v1
kind: Service
metadata:
  name: mysql-master
spec:
  ports:
  - name: mysql
    port: 3306
    targetPort: 3306
  selector:
    apps: db
    statefulset.kubernetes.io/pod-name: sts-mysql-0  #选择标签为 db和sts-mysq-0的当作访问的主入口 

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: sts-mysql
spec:
  serviceName: master-slave
  replicas: 3
  selector:
    matchLabels:
      apps: db
  template:
    metadata:
      labels:
        apps: db
    spec:
      terminationGracePeriodSeconds: 60

      initContainers:
      - name: prepare-config
        image: busybox:1.36
        command:
        - sh
        - -ec
        - |
          id="${HOSTNAME##*-}"   #取出环境变量 HOSTNAME 中最后一个 - 后面的内容，赋值给变量 id
          cp /config/mysql.conf /work/mysql.conf
          if [ "$id" -eq 0 ]; then
            sed -i 's/server-id=101/server-id=101/' /work/mysql.conf
            sed -i 's/read_only=OFF/read_only=OFF/' /work/mysql.conf
          else
            sed -i "s/server-id=101/server-id=$((101 + id))/" /work/mysql.conf
            sed -i 's/read_only=OFF/read_only=ON/' /work/mysql.conf
          fi
        volumeMounts:
        - name: mysql-conf
          mountPath: /config
        - name: work
          mountPath: /work

      containers:
      - name: mysql
        image: mysql:8.0.36-oracle
        imagePullPolicy: Always
        ports:
        - name: mysql
          containerPort: 3306

        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: root-password
        - name: MYSQL_DATABASE
          value: wordpress
        - name: MYSQL_USER
          value: linux101
        - name: MYSQL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: app-password

        command:
        - /bin/bash
        - -ec
        - |
          exec docker-entrypoint.sh \
            --defaults-file=/etc/mysql/mysql.conf \
            --character-set-server=utf8mb4 \
            --collation-server=utf8mb4_unicode_ci

        volumeMounts:
        - name: mysql-data
          mountPath: /var/lib/mysql
        - name: work
          mountPath: /etc/mysql/mysql.conf
          subPath: mysql.conf
          readOnly: true

        startupProbe:
          exec:
            command:
            - /bin/bash
            - -ec
            - |
              mysqladmin ping -h 127.0.0.1 \
                -uroot -p"$MYSQL_ROOT_PASSWORD" --silent
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 60

        readinessProbe:
          exec:
            command:
            - /bin/bash
            - -ec
            - |
              mysqladmin ping -h 127.0.0.1 \
                -uroot -p"$MYSQL_ROOT_PASSWORD" --silent
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3

        livenessProbe:
          exec:
            command:
            - /bin/bash
            - -ec
            - |
              mysqladmin ping -h 127.0.0.1 \
                -uroot -p"$MYSQL_ROOT_PASSWORD" --silent
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 6

      volumes:
      - name: mysql-conf
        configMap:
          name: mysql-conf
      - name: work
        emptyDir: {}

  volumeClaimTemplates:        #这里用的是默认存储类，如果想要指定存储类需要加  storageClassName: nfs-client
  - metadata:
      name: mysql-data
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 3Gi

```

上面的配置负责提供稳定身份、持久化数据目录、数据库启动与健康检查，以及独立的主库 Service；下一步还需要完成复制初始化和自动恢复逻辑。

### 3.如何部署和检查？

先确认集群有可用的 StorageClass：

```
kubectl get storageclass
```

如果没有默认 StorageClass，需要先配置存储，或为 PVC 指定实际可用的 StorageClass。

#### ps:部署sc

```bash
#前提要安装helm
helm repo add nfs-subdir-external-provisioner https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
#这里用的是nfs当作provider ，需要找一台机器安装nfs，在共享一个目录 
helm install nfs-subdir-external-provisioner nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
    --set nfs.server=x.x.x.x \
    --set nfs.path=/exported/path
 #给这个sc设置成默认的存储类
 kubectl patch storageclass nfs-client \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
  
 kubectl get sc
  预期输出类似：
NAME                   PROVISIONER                                     RECLAIMPOLICY
nfs-client (default)   cluster.local/nfs-subdir-external-provisioner   Delete

看到 (default) 就说明设置成功了。
```

确认后执行：

```
kubectl apply -f mysql-secret.yaml
kubectl apply -f mysql-cluster.yaml

kubectl get pods -w
kubectl get pvc
kubectl get svc.
```



### 4.主库创建复制账号

在 `sts-mysql-0` 上执行：

```
CREATE USER 'copy'@'%' IDENTIFIED BY '替换为复制密码';

GRANT REPLICATION SLAVE ON *.* TO 'copy'@'%';
```

### 5.从库配置复制源并启动复制

在 `sts-mysql-1` 和 `sts-mysql-2` 上分别执行：

```
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='mysql-master.default.svc.cluster.local',
  SOURCE_PORT=3306,
  SOURCE_USER='copy',
  SOURCE_PASSWORD='替换为复制密码',
  SOURCE_AUTO_POSITION=1;
  GET_SOURCE_PUBLIC_KEY = 1;
START REPLICA;
```

### 6.检查是否恢复正常

执行：

```
SHOW REPLICA STATUS\G
```

重点看这两个字段：

```
Replica_IO_Running: Yes
Replica_SQL_Running: Yes
```

两个都为 `Yes`，才说明复制的 IO 线程和 SQL 线程都正常运行。.