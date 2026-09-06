---
title: React 19 之后，前端状态管理还剩下什么
date: 2026-04-14
description: 服务端状态、客户端状态、URL 状态、表单状态——这四类东西过去被塞进同一个 store。React 19 和现代路由框架把它们拆开之后，全局状态库的适用范围比想象中小得多。
category: frontend
tags:
  - React
  - 状态管理
---

2019 年我写过的一个项目里，Redux store 有 47 个 reducer。今天回头看，其中大约 40 个是不该存在的。

不是因为 Redux 不好，而是因为**我们把四种性质完全不同的东西塞进了同一个容器**。

## 四种状态

| 类型 | 例子 | 真相来源 | 生命周期 |
| --- | --- | --- | --- |
| 服务端状态 | 文章列表、用户资料 | 远端数据库 | 随时可能失效 |
| URL 状态 | 当前路由、筛选条件、分页 | 地址栏 | 与页面同寿 |
| 表单状态 | 输入框内容、校验错误 | 用户的输入 | 提交后消失 |
| 客户端状态 | 侧栏是否展开、主题、临时选择 | 浏览器内存 | 组件卸载即结束 |

只有最后一种真正需要「前端状态管理」。前三种各有各的归属，硬塞进 store 会带来一堆人工维护的同步逻辑。

## 服务端状态：不该被复制

服务端状态的本质是**一份你不拥有的数据的缓存**。它有三个特征让它不适合放进 store：

1. 它会在你不知道的时候过期（别人改了数据库）
2. 它需要加载态、错误态、重试、去重
3. 多个组件订阅同一份数据时要共享请求

```tsx
// 把服务端状态塞进 store 的代价：这些逻辑全得自己写
dispatch(fetchPostsStart())
try {
  const posts = await api.getPosts()
  dispatch(fetchPostsSuccess(posts))
} catch (e) {
  dispatch(fetchPostsError(e.message))
}
```

数据层库把这套东西变成了声明式的：

```tsx
const { data, isPending, error } = useQuery({
  queryKey: ['posts'],
  queryFn: api.getPosts,
})
```

而在 SSR 框架里，很多场景连这个都不需要——**loader 在服务端取一次数据，随 HTML 一起下发，客户端导航时由路由缓存接管**。这就是为什么这个博客没有引入任何数据层库：它没有客户端异步取数的场景。

## URL 状态：地址栏就是 store

筛选、排序、分页、标签——这些状态有个特点：**用户期望能刷新页面后还在，也期望能复制链接分享**。

把它们放进内存 store 就等于放弃了这两个能力。

```tsx
// 反例：刷新就丢
const [tag, setTag] = useState('react')

// 正例：可分享、可后退、可刷新
// /posts?tag=react
const { tag } = Route.useSearch()
```

现代路由框架给 search params 做了类型化和校验：

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: z.object({
    tag: z.string().optional(),
    page: z.coerce.number().default(1),
  }),
  component: PostsPage,
})
```

写完这段之后，`tag` 和 `page` 在所有组件里都是类型安全的，而且非法值在边界处就被拦掉了。

## 表单状态：受控组件够用

表单是「状态管理库最容易过度介入」的地方。

一个简单的联系表单，`useState` 完全够：

```tsx
const [email, setEmail] = useState('')
const [error, setError] = useState<string | null>(null)
```

需要「字段级校验」「脏检查」「数组字段」「异步校验」的时候，才值得上表单库。判断标准很简单：**如果你在手写 `touched` / `dirty` / `errors` 三个 map，就该换库了。**

React 19 的 `useActionStatus` 和 form action 进一步把「提交中」「提交结果」这类状态也接管了：

```tsx
const [state, submitAction, isPending] = useActionStatus(subscribe)

<form action={submitAction}>
  <input name="email" type="email" required />
  <button disabled={isPending}>订阅</button>
  {state?.status === 'error' && <p>{state.message}</p>}
</form>
```

## 客户端状态：剩下的这部分真的很小

刨掉上面三类，真正需要跨组件共享的纯客户端状态通常只有：

- 主题（亮/暗）
- 侧栏、抽屉、模态框的开合
- 全局快捷键的注册
- 少量 UI 偏好（列表密度、是否显示某栏）

这些东西的正确归属，按优先级排：

1. **组件自己的 state** —— 如果一个模态框只在一个地方被打开，它就该待在那个组件里
2. **提升一层** —— 两个兄弟组件共享，就提到共同父级，配合 props 或 compound component
3. **Context** —— 真正跨层、低频变化的（主题、当前用户、locale）
4. **外部 store** —— 高频更新、大量订阅者、需要选择器避免重渲染

第 4 条才是状态库的地盘，而它比大多数人以为的要窄得多。

## Context 的正确用法（和错误用法）

Context 的问题不是性能，是**它把「传参」变成了「隐式依赖」**。用得好的场景有两个特征：变化频率低，且消费范围广。

```tsx
// 好：主题。几乎不变，到处都要用
const ThemeContext = createContext<Theme>('dark')

// 坏：一个高频更新的鼠标位置，20 个组件订阅
// 每次移动都重渲染整棵子树
```

如果确实需要高频共享状态，用带选择器的外部 store，让组件只订阅自己关心的切片。

## 一个判断流程

遇到「这个状态该放哪」的时候，我按这个顺序问：

1. 这份数据的真相在服务器上吗？→ 数据层 / loader，不要复制进 store
2. 用户会期望刷新后它还在，或者想分享这个链接吗？→ URL
3. 它是某个表单的输入吗？→ 表单状态
4. 只有一个组件用吗？→ 组件自己的 state
5. 只有相邻几个组件用吗？→ 提升一层
6. 跨很多层但很少变？→ Context
7. 以上都不是，且更新很频繁？→ 外部 store

> 走到第 7 步的情况，在我最近三个项目里一共出现了两次。

## 那 store 库还有意义吗

有，但意义变了。它不再是「应用状态的中央仓库」，而是**处理特定难题的专用工具**：

- 乐观更新与回滚
- 多个独立数据源之间的派生与一致性
- 离线队列
- 跨标签页同步
- 复杂交互的撤销/重做

这些都是真问题。但它们都不是「我需要把文章列表存起来」这种问题。

---

状态管理这些年的演进方向其实很一致：**把状态放回它本来所属的层**。服务端数据回到服务端，可分享状态回到 URL，表单状态回到表单，剩下的那一小撮才留给客户端。

当你发现自己在写一个很大的 store，通常不是 store 设计得不好，而是有东西放错了地方。
