---
title: MySQL 8 SQL 从入门到多表查询：五子句、连接、子查询一次理顺
date: 2026-09-07
description: 用一张学生表把 DDL、DML、DQL、DCL 全串起来，顺带讲清主键与唯一、delete 与 truncate、where 与 having 这三道高频面试题。
category: mysql
tags:
  - mysql
  - SQL
  - 数据库
---

SQL 这东西，语法书翻三遍不如自己敲一张表。我当年最大的困惑是"明明一条语句里同时有 where、group by、having、order by，它们到底谁先跑"——搞不清这个，写出来的语句就只能靠碰运气。

这篇用一张学生表把增删改查串完，重点放在**执行顺序**和**几个高频面试点**上，最后再补一层 MySQL 的体系结构，让你知道这些语句在底层是怎么走的。

## 一、先立个规矩：SQL 的基本语法

四条，没什么可解释的，但违反第一条就能卡你十分钟：

1. 语句以**分号**结尾（MySQL 客户端里少个分号，它会一直等你输入）
2. 空格和缩进只影响可读性，不影响语义
3. 关键字**不区分大小写**，`SELECT` 和 `select` 等价。团队一般约定关键字大写、库表列名小写
4. 注释：

```sql
# 单行注释（井号）
-- 单行注释（两个减号，后面必须跟一个空格）
/* 多行注释 */
```

按用途，SQL 分成四类，这个分类决定了它会不会改动数据：

| 分类 | 全称 | 干什么 | 关键字 |
| --- | --- | --- | --- |
| DDL | 数据定义语言 | 建库、建表、改结构 | `create` / `drop` / `alter` / `truncate` |
| DML | 数据操纵语言 | 增删改 | `insert` / `delete` / `update` |
| DQL | 数据查询语言 | 查 | `select` |
| DCL | 数据控制语言 | 用户、权限 | `create user` / `grant` |

## 二、DDL：库和表

### 1. 数据库操作

```sql
CREATE DATABASE db_test DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_general_ci;
SHOW DATABASES;
USE db_test;          -- 选中/切换数据库
DROP DATABASE db_test;
```

字符集一定写 `utf8mb4`，不是 `utf8`。MySQL 的 `utf8` 最多三个字节，存 emoji 会直接报 `Incorrect string value`，`utf8mb4` 才是真正的 UTF-8。

### 2. 表操作

数据表不能独立存在，**必须先 `use` 一个库**：

```sql
CREATE TABLE student (
    id      INT PRIMARY KEY AUTO_INCREMENT,
    name    VARCHAR(20) NOT NULL,
    age     INT,
    gender  CHAR(2) DEFAULT '男',
    score   DECIMAL(5,2),
    city    VARCHAR(20),
    cls     VARCHAR(20)
);
```

查看和删除：

```sql
SHOW TABLES;                    -- 当前库所有表
DESC student;                   -- 表结构：有哪些列、什么类型、能否为空
DESCRIBE student;               -- 同上，全写
DROP TABLE student;
```

### 3. 改表：add / change / modify / drop

这四个是必考选择题，区别就在"改不改名"：

```sql
ALTER TABLE student ADD      email VARCHAR(50);          -- 加字段
ALTER TABLE student DROP     email;                      -- 删字段
ALTER TABLE student MODIFY   name   VARCHAR(50);         -- 只改类型，不改名
ALTER TABLE student CHANGE   cls    class_name VARCHAR(20); -- 改名 + 改类型
ALTER TABLE student RENAME TO student_info;              -- 改表名
```

记忆技巧：**`CHANGE` 要写两遍列名**（旧名 新名），所以它既能改名又能改类型；`MODIFY` 只写一个列名，所以只能改类型。

## 三、字段类型与约束

### 1. 常用类型

| 类别 | 类型 | 说明 |
| --- | --- | --- |
| 整数 | `int` | 还有 tinyint / bigint，按范围选 |
| 小数 | `decimal(M,N)` | M 总位数，N 小数位。**金额必须用它**，float 有精度误差 |
| 定长字符串 | `char(M)` | 不够也占 M 位，速度快，适合定长内容（性别、身份证号） |
| 变长字符串 | `varchar(M)` | 实际长度 + 1~2 字节，省空间，适合姓名、地址 |
| 超大文本 | `text` | 长文章、富文本，不能直接建索引（要前缀索引） |
| 日期 | `date` | 只有日期 |
| 日期时间 | `datetime` | 日期 + 时分秒 |

`char` 和 `varchar` 的区别一句话：**char 用空间换速度，varchar 用速度换空间**。

### 2. 五种约束

约束就是在字段类型之上再加一层"插入数据的限制条件"：

| 约束 | 关键字 | 作用 |
| --- | --- | --- |
| 主键 | `primary key` | 唯一 + 非空，一张表**只能有一个** |
| 唯一 | `unique` | 不允许重复，**可以有多个**，允许 NULL |
| 非空 | `not null` | 不能为空 |
| 默认值 | `default` | 不传值时用默认 |
| 外键 | `foreign key` | 关联另一张表的主键，保证引用完整性 |

> **面试题：主键和唯一约束的区别？**
> ① 主键只能一个，unique 可以多个；
> ② 主键不允许 NULL，unique 允许（且 NULL 之间不算重复，可以有多行 NULL）；
> ③ 主键会被 InnoDB 用来组织数据（聚簇索引的叶子节点就是主键），unique 是辅助索引。

自动增长 `auto_increment` 几乎总是和主键绑在一起用：

```sql
id INT PRIMARY KEY AUTO_INCREMENT
```

## 四、DML：增删改

DML 是**事务型操作**，它改的是表里的数据，不改表结构。

### 1. 插入

```sql
-- 全字段插入
INSERT INTO student VALUES (NULL,'张三',20,'男',88.50,'北京','linux92');

-- 指定字段插入（推荐，字段顺序变了也不会错）
INSERT INTO student (name,age,score) VALUES ('李四',22,90.00);

-- 批量插入
INSERT INTO student (name,age,score,city,cls) VALUES
 ('王五',21,76.50,'上海','linux92'),
 ('赵六',23,59.00,'广州','linux93'),
 ('孙七',20,95.00,'北京','linux92'),
 ('周八',NULL,NULL,'深圳','linux93');
```

### 2. 删除：delete 与 truncate

```sql
DELETE FROM student WHERE name = '张三';   -- 按条件删
DELETE FROM student;                        -- 全表删（逐行）
TRUNCATE TABLE student;                     -- 清空（重建表）
```

> **面试题：`delete from` 和 `truncate` 的区别？**
> ① `delete` 属于 **DML**，一条一条记录删除，可以带 where；`truncate` 属于 **DDL**，相当于把表 drop 掉再重建；
> ② `delete` **不会重置**自增序列，`truncate` **会**把 `auto_increment` 清零；
> ③ `delete` 逐行写 binlog、可以回滚、可以触发触发器；`truncate` 秒清空，但没法回滚。
> 所以生产上要清空一张大表用 `truncate`（快），要删部分数据只能 `delete`。

### 3. 更新：where 加不加是天壤之别

```sql
UPDATE student SET age = age + 1;                       -- 全表更新！
UPDATE student SET age = age + 1 WHERE name = '张三';    -- 只改符合条件的
```

> 生产事故排行榜上，"UPDATE 忘写 WHERE"至少能进前三。建议在客户端开启安全更新模式，不带动词的 UPDATE/DELETE 直接拒绝执行：
>
> ```sql
> SET SQL_SAFE_UPDATES = 1;   -- 要求 UPDATE/DELETE 必须带 where 或 limit
> ```

## 五、DQL：查询（重点全在这里）

### 1. 查哪些列

```sql
SELECT * FROM student;               -- 所有列
SELECT name, age FROM student;       -- 只取 name 和 age
SELECT name AS 姓名, score AS 成绩 FROM student;   -- 起别名
```

去重：

```sql
SELECT DISTINCT city FROM student;
```

> **面试题：去重有哪几种方案？**
> ① `DISTINCT`，对指定列（或多列组合）去重；
> ② `GROUP BY`，本质是分组，但因为分组后每组只出一行，**顺带起到了去重作用**。
> 两者语法场合不同：`DISTINCT` 只能放在列名前面，`GROUP BY` 能配合聚合函数算出每组的统计值。

### 2. 五子句与执行顺序

一条完整查询的书写顺序：

```sql
SELECT 列            -- ⑤ 最后执行，决定返回哪些列
FROM 表              -- ① 先定位到表
WHERE 条件           -- ② 逐行过滤
GROUP BY 列          -- ③ 分组
HAVING 条件          -- ④ 对分组后的结果再过滤
ORDER BY 列          -- ⑤.5 排序
LIMIT 偏移量, 数量;   -- ⑥ 截取
```

**书写顺序和逻辑执行顺序不一样**，这是绝大多数困惑的根源。执行顺序是：

```
FROM → WHERE → GROUP BY → 聚合函数 → HAVING → SELECT → ORDER BY → LIMIT
```

由此可以直接推出三条结论：

- `WHERE` 里**不能**用聚合函数，也**不能**用 SELECT 里起的别名（因为那时 SELECT 还没执行）
- `WHERE` 在 `GROUP BY` **之前**，`HAVING` 在 `GROUP BY` **之后**
- `ORDER BY` 可以用别名，因为它在 SELECT 之后

### 3. WHERE 条件全家桶

```sql
-- 比较：> < >= <= = != <>
SELECT * FROM student WHERE score != 60;

-- 连续区间：between ... and ...（闭区间，两端都含）
SELECT * FROM student WHERE score BETWEEN 70 AND 90;

-- 非连续集合：in
SELECT * FROM student WHERE city IN ('北京','上海');

-- 模糊查询：like
SELECT * FROM student WHERE name LIKE '张%';    -- % 任意个任意字符
SELECT * FROM student WHERE name LIKE '张_';    -- _ 恰好一个字符

-- 空值：只能用 is null / is not null，不能用 = null
SELECT * FROM student WHERE age IS NULL;
SELECT * FROM student WHERE age IS NOT NULL;

-- 逻辑组合：and / or / not
SELECT * FROM student WHERE gender = '男' AND score > 80;
SELECT * FROM student WHERE city = '北京' OR city = '深圳';
```

> `NULL = NULL` 的结果是 `NULL` 而不是 `TRUE`，所以 `WHERE score = NULL` 永远查不到东西，必须写 `IS NULL`。这是 MySQL 里最经典的"代码没报错但结果不对"。
> 另外 `LIKE '%张%'` 前置百分号会导致**索引失效**走全表扫描，大表上要当心。

### 4. 聚合与 GROUP BY

聚合函数是**按列算**，而普通 select 是**按行取**，这是两者的根本差别。

| 函数 | 作用 |
| --- | --- |
| `COUNT(*)` | 统计行数，NULL 也算 |
| `COUNT(列)` | 统计该列**非 NULL** 的个数 |
| `SUM(列)` | 求和 |
| `AVG(列)` | 求平均（自动忽略 NULL） |
| `MAX(列)` / `MIN(列)` | 最大 / 最小 |

```sql
SELECT COUNT(*)            FROM student;   -- 全表多少人
SELECT AVG(score)          FROM student;   -- 平均分
SELECT MAX(score) - MIN(score) FROM student;  -- 极差

-- 分组：先分组，后聚合
SELECT cls, COUNT(*) FROM student GROUP BY cls;
SELECT city, AVG(score) FROM student GROUP BY city HAVING AVG(score) > 80;
```

执行原理记住八个字：**先分组，后聚合**。

`SELECT 字段1, 聚合函数(字段2) FROM 表 GROUP BY 字段1` —— 出现在 SELECT 里的非聚合列，**必须**同时出现在 GROUP BY 里，否则在标准 SQL（以及开了 `ONLY_FULL_GROUP_BY` 的 MySQL 8 默认模式）下直接报错。

### 5. HAVING 与 WHERE 的区别

> **面试题：where 和 having 都能过滤，有什么区别？**
> ① 时机不同：`WHERE` 发生在 `GROUP BY` **之前**，`HAVING` 发生在 `GROUP BY` **之后**；
> ② 能不能用聚合函数：`WHERE` 不能，`HAVING` 能；
> ③ 要对**分组后**的结果进一步筛选，只能用 `HAVING`。
> 补充一点：在没有任何 group by 的简单查询里，`HAVING` 理论上可以替代 `WHERE`，但没有必要，性能也更差。

### 6. ORDER BY 排序

```sql
SELECT * FROM student ORDER BY score;             -- 默认升序 asc
SELECT * FROM student ORDER BY score DESC;        -- 降序
SELECT * FROM student ORDER BY cls ASC, score DESC;  -- 多字段
```

多字段排序的含义：**先按第一个字段排，第一个字段值相同的行，再按第二个字段排**。这里读作"先按班级排，同班级内再按成绩从高到低"。

### 7. LIMIT 与分页公式

```sql
SELECT * FROM student LIMIT 3;        -- 前 3 条
SELECT * FROM student LIMIT 2, 3;     -- 从偏移量 2 开始取 3 条（即第 3、4、5 行）
```

`LIMIT M, N` 里 **M 是偏移量（从 0 开始数）**，N 是要取的条数。

分页公式（这一条务必背下来）：

```
LIMIT (当前页码 - 1) * 每页数量, 每页数量
```

每页 3 条，看第 2 页：

```sql
SELECT * FROM student ORDER BY id LIMIT (2-1)*3, 3;   -- 即 LIMIT 3,3
```

> 生产上深分页 `LIMIT 1000000, 10` 会非常慢，因为 MySQL 要扫过并丢弃前一百万行。优化写法是用主键游标：`WHERE id > 1000000 ORDER BY id LIMIT 10`。

## 六、多表查询

真实业务里，你要的结果字段往往**分散在多张表**——学生姓名在 A 表，班级名称在 B 表。这就是多表查询存在的理由。

### 1. 先理清表与表的三种关系

| 关系 | 说明 | 建表方式 |
| --- | --- | --- |
| 1:1 | A 表一行对应 B 表一行 | 一般拆表是为了冷热分离或权限隔离 |
| 1:N | A 表每行在 B 表有多行；B 表每行必属于 A 表某一行 | 在"多"的一方（B 表）加外键指向 A 表主键 |
| M:N | 站在任一边看都是多对多 | **必须建一张中间表**，存两边主键 |

比如"学生 ↔ 课程"是多对多，就要一张 `student_course` 中间表，字段是 `student_id` + `course_id`，联合主键。

### 2. 交叉连接（笛卡尔积）

```sql
SELECT * FROM A, B;
```

无条件连接：拿 A 的每一行去和 B 的每一行组合。结果 **列数 = A 列 + B 列，行数 = A 行 × B 行**。

交叉连接本身没有业务意义，但它是**所有连接的基础**——所有连接都是在笛卡尔积之上再按条件筛。

### 3. 内连接

只返回**满足关联条件**的行，不满足的直接被丢掉：

```sql
SELECT s.name, c.cname
FROM student s
INNER JOIN course c ON s.course_id = c.id;

-- 等价的隐式写法（老代码里常见，不推荐）
SELECT s.name, c.cname FROM student s, course c WHERE s.course_id = c.id;
```

`INNER` 可以省略，直接写 `JOIN` 就是内连接。注意上面用了**表别名** `s` / `c`，多表查询里不写别名，同名列就会报 `ambiguous`。

### 4. 外连接：主表不能丢

内连接会把匹配不上的行悄悄丢掉，外连接的意义就是**保住主表的所有行**：

```sql
-- 左外连接：以左表为主表，全部保留
SELECT s.name, c.cname
FROM student s LEFT JOIN course c ON s.course_id = c.id;

-- 右外连接：以右表为主表，全部保留
SELECT s.name, c.cname
FROM course c LEFT JOIN student s ON s.course_id = c.id;   -- 交换表位置等价于 RIGHT JOIN
```

规则：主表所有记录都保留 → 去右表匹配 → 匹配上就拼接保留 → **匹配不上，右表所有字段填 NULL**。

所以"查没有选课的学生"就是 `WHERE c.id IS NULL`：

```sql
SELECT s.name FROM student s
LEFT JOIN course c ON s.course_id = c.id
WHERE c.id IS NULL;
```

> **面试题：内连接和外连接的区别？**
> 内连接只返回满足关联条件的记录；外连接返回主表的全部记录，另一张表匹配不上的部分用 NULL 填充。

### 5. 自连接

**一张表自己和自己连**，通常用于表中存在层级关系：

```sql
-- 员工表里存上级 id，查"员工 - 他的领导"
SELECT e.name AS 员工, m.name AS 领导
FROM emp e LEFT JOIN emp m ON e.manager_id = m.id;
```

同一个 `emp` 起了两个别名 `e` 和 `m`，本质是把一张表当成两张来用。

## 七、子查询

一个 select 里又嵌了另一个 select，适用场景是**多层次、多步骤**的查询。

比如"查询年龄大于平均年龄的学生"，逻辑上分两步：① 先求平均年龄 ② 再筛大于这个值的。

写子查询固定三步法：

```sql
-- 第 1 步：先单独写出子查询，确认它的结果是对的
SELECT AVG(age) FROM student;              -- 假设得到 21.5

-- 第 2 步：写主查询，把未知数用一个"伪代码"占位
SELECT * FROM student WHERE age > 【平均值】;

-- 第 3 步：把伪代码替换成第 1 步的子查询（要加括号）
SELECT * FROM student WHERE age > (SELECT AVG(age) FROM student);
```

再看一个 `IN` 场景的例子——查 linux92 班所有学生的成绩，但班级信息在另一张表：

```sql
SELECT name, score FROM student
WHERE cls_id IN (SELECT id FROM class WHERE cls_name = 'linux92');
```

> 子查询能写成 JOIN 的，优先考虑 JOIN。相关子查询（内层引用了外层列）在 MySQL 里可能每行都执行一次，代价很高。

## 八、DCL：用户与权限

### 1. 用户管理

```sql
CREATE USER 'dev'@'192.168.88.%' IDENTIFIED BY 'Dev@123456';
DROP USER 'dev'@'192.168.88.%';
ALTER USER 'dev'@'192.168.88.%' IDENTIFIED BY 'NewPass@123';
RENAME USER 'dev'@'192.168.88.%' TO 'dev01'@'192.168.88.%';

SELECT user, host FROM mysql.user;    -- 查看所有用户
SHOW GRANTS FOR 'dev'@'192.168.88.%'; -- 查看某用户的权限
```

再强调一次：**用户名 + host 共同构成一个账号**，`dev@localhost` 和 `dev@'%'` 是两个独立账号，密码和权限都各算各的。

### 2. 权限管理

```sql
-- 授予全部权限
GRANT ALL ON *.* TO 'dev'@'192.168.88.%';

-- 只给某个库的增删改查
GRANT SELECT, INSERT, UPDATE, DELETE ON db_test.* TO 'dev'@'192.168.88.%';

-- 只给连接权限（常用于建监控账号）
GRANT USAGE ON *.* TO 'dev'@'192.168.88.%';

FLUSH PRIVILEGES;
REVOKE INSERT ON db_test.* FROM 'dev'@'192.168.88.%';   -- 回收
```

| 权限 | 级别 | 含义 |
| --- | --- | --- |
| `usage` | 普通权限 | 只能登录，什么都干不了 |
| `all` | 所有权限 | 管理员级别 |
| `select/insert/update/delete` | 指定权限 | 按需授予 |

`GRANT ... WITH GRANT OPTION` 是一个很容易漏掉的尾巴：加上它，这个用户才有资格**再把自己的权限授给别人**。没这个选项，他建的授权语句一律被拒。

> 权限范围的写法 `ON *.*`、`ON 库.*`、`ON 库.表` 是从大到小三个级别，生产上按"最小可用"原则往下压。

## 九、SQL 在底层是怎么跑完的

到这里你已经会写语句了，接着看它在 MySQL 内部走的路径。MySQL 整体分四层：

```
   客户端 (mysql / DataGrip / Java)
        │  TCP
       ▼
┌─────────────────────────────────────────────────┐
│ ① 连接层  连接器、认证、线程/进程模型、权限校验   │
├─────────────────────────────────────────────────┤
│ ② 服务层  查询缓存(8.0已删) → 解析器 → 优化器    │
│           → 执行器；自带函数、存储过程、触发器    │
├─────────────────────────────────────────────────┤
│ ③ 引擎层  InnoDB / MyISAM / Memory，负责存取数据 │
├─────────────────────────────────────────────────┤
│ ④ 存储层  数据文件、日志文件落在文件系统上        │
└─────────────────────────────────────────────────┘
```

一条 `SELECT` 在服务层的旅程，值得单独记住：

```
发送 SQL
  → 解析器：词法 + 语法分析，生成解析树（语法错就在这里报 1064）
  → 预处理器：检查表名、列名是否真实存在
  → 优化器：决定用哪个索引、多表按什么顺序连接（可能改写你的语句）
  → 执行器：判断有没有权限，然后调用引擎层的接口一行行取数据
  → 结果集返回客户端
```

写 SQL 时"你觉得的执行顺序"和"优化器实际选的执行顺序"可能完全不同——这就是为什么 `EXPLAIN` 是必须会看的命令。

### 引擎层：InnoDB vs MyISAM vs Memory

| 引擎 | 特点 | 锁粒度 | 事务 | 外键 | 适用 |
| --- | --- | --- | --- | --- | --- |
| **InnoDB** | 8.0 默认引擎，擅长**数据安全** | 行级锁 | ✅ | ✅ | 几乎所有业务表 |
| MyISAM | 擅长**查询速度**，索引是独立的 | 表级锁 | ❌ | ❌ | 读多写少、老系统 |
| Memory | 数据全在内存，重启即丢 | 表级锁 | ❌ | ❌ | 临时表、缓存 |

MySQL 8.0 里 MyISAM 基本只剩"知道它存在"的意义了。InnoDB 与 MyISAM 的区别（事务、行锁、外键、崩溃能否恢复）是面试常客。

## 十、慢查询与索引优化

数据库越来越慢的时候，第一件要做的事是**找出慢在哪**。

### 1. 开启慢查询日志

超过阈值（默认单位秒）的 SQL 会被单独记录，这是性能排查的入口：

```sql
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;                    -- 超过 1 秒算慢
SHOW VARIABLES LIKE '%slow%';
```

写进配置文件才持久（`/etc/my.cnf`）：

```ini
[mysqld]
slow_query_log      = ON
slow_query_log_file = /var/log/mysql/slow.log
long_query_time     = 1
log_queries_not_using_indexes = ON    -- 未走索引的语句也记（测试期开，生产会爆量）
```

拿到日志后，用自带的 `mysqldumpslow` 或 `pt-query-digest` 聚合出"最慢的 top N"，逐条 `EXPLAIN`。

### 2. 索引为什么快

一句话解释：**没有索引是全表扫描 O(N)，B+ 树索引是把数据有序组织成树，查一次只需要 3~4 次磁盘 IO，复杂度 O(log N)**。

InnoDB 的 B+ 树特点：

- 叶子节点存数据（聚簇索引以主键为 key），非叶子节点只存索引，一屏能装更多分支
- 叶子节点之间用**双向链表**串起来，所以范围查询 `between`、`>` 特别高效

```sql
CREATE INDEX idx_name ON student (name);
DROP INDEX idx_name ON student;
SHOW INDEX FROM student;
EXPLAIN SELECT * FROM student WHERE name = '张三';
```

`EXPLAIN` 主要看 `type` 和 `key`：`type` 从好到差是 `system > const > eq_ref > ref > range > index > ALL`，出现 `ALL` 就是全表扫描，该建索引了。

索引失效的常见场景（也是面试+实战双高频）：

- 对索引列做**函数或运算**：`WHERE YEAR(dt) = 2026`、`WHERE id + 1 = 3`
- **隐式类型转换**：`varchar` 列写成 `WHERE phone = 13800138000`（数字），MySQL 会对列做 CAST
- `LIKE '%xx'` 前置百分号
- 违反**最左前缀**原则：联合索引 `(a,b,c)`，只查 `b = ?` 用不上
- `OR` 两边有非索引列
- 区分度太低（比如性别只有两个值），优化器主动放弃索引

> 索引不是越多越好：每张表的二级索引都会**拖慢写入**（每次 insert 要同时维护多棵 B+ 树）并占磁盘。原则是给"高频查询 + 有区分度"的列建，而不是给所有列建。

## 十一、几条能立刻用的习惯

- 写完语句先看一眼 `EXPLAIN`，养成肌肉记忆
- `SELECT *` 在测试里方便，在生产代码里是隐患（多查的列走不了覆盖索引，还可能撞上新增字段）
- 建表时字段全部 `NOT NULL` + 给默认值，`NULL` 会让 `count`、`distinct`、索引的行为变得反直觉
- 分页永远配 `ORDER BY`，不配排序的 `LIMIT` 结果顺序是不保证的
- 改结构前先在测试库跑一遍，`ALTER TABLE` 在大表上会锁很久（8.0 的 online DDL 好很多，但也不是没代价）

会写 SQL 只是起点，同一句"查平均年龄以上的人"，写法不同性能能差好几个数量级。下一篇我们聊运维真正每天在干的事：备份与还原——`mysqldump` 怎么做全库备份、binlog 怎么配合它做增量恢复、以及为什么大库必须换 XtraBackup。
