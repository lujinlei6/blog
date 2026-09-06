---
title: 为什么我把博客迁到了 TanStack Start
date: 2026-08-28
description: TanStack Start 在 v1 正式版之后终于值得认真对待。这篇记录我从 Next.js 迁移过来的完整决策过程，以及 client-first 架构到底解决了什么问题。
category: frontend
tags:
  - TanStack
  - React
  - 架构
featured: true
---

迁移一个博客听起来是件小事，直到你发现要同时处理路由类型、服务端数据、SEO 元信息和构建产物四个层面的兼容问题。这篇记录我做决定时真正权衡过的东西。

## 起因：类型断了

原来的站点跑在一个成熟的全栈框架上，一切都能工作。问题出在一次很小的重构——我把某篇文章的路径从 `/blog/:slug` 改成了 `/posts/:slug`。

改完之后构建通过了，测试通过了，上线之后站内有三处链接指向了 404。

```tsx
// 改动之前，这三处都是字符串字面量，没有任何东西能帮你
<Link href={`/blog/${post.slug}`}>阅读全文</Link>
<a href="/blog">全部文章</a>
router.push(`/blog/${slug}`)
```

字符串路由的本质问题是：**路由表存在于你的脑子里，而不是类型系统里**。项目小的时候这不是问题，项目活过三年之后它就是持续的小额税收。

TanStack Router 把路由表变成了类型。改动路径之后，上面三处会立刻变成编译错误：

```tsx
<Link to={`/posts/${post.slug}`}>阅读全文</Link>
//        ^? 类型系统知道有哪些路由、每个路由需要什么参数
```

这不是花哨的 DX 糖。这是把一类只能在运行时发现的 bug 前移到了编辑期。

## client-first 是什么意思

大多数全栈框架是 server-first 的：默认所有东西在服务端渲染，你需要显式标注哪些部分属于客户端。TanStack Start 反过来——**默认所有代码是同构的**，你需要显式标注哪些部分属于服务端。

标注的方式是 `createServerFn`：

```tsx
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const getPost = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    // 这里的代码只在服务端执行，打包时会被抽取出去
    return db.posts.findUnique({ where: { slug: data.slug } })
  })
```

关键点在于：**调用方不需要知道这是一次 RPC**。在 loader 里写 `await getPost({ data: { slug } })`，SSR 时它是本地函数调用，客户端导航时它自动变成一次同源 HTTP 请求。

```tsx
export const Route = createFileRoute('/posts/$slug')({
  loader: ({ params }) => getPost({ data: { slug: params.slug } }),
  component: PostPage,
})
```

这个设计消除了一整类心智负担。我不再需要判断「这段代码现在跑在哪」，框架根据执行上下文自动决定。

## v1 正式版改了什么

如果你半年前看过 TanStack Start 然后放弃了，现在值得重新看一眼。v1 稳定版有几个实质变化：

| 变化 | 之前 | 现在 |
| --- | --- | --- |
| 服务端引擎 | Vinxi（封装层） | Nitro（可选，或 Cloudflare/Netlify 官方插件） |
| 入口文件 | 需要手写 `client.tsx` / `ssr.tsx` | 内置默认，根路由直接渲染 `<html>` |
| 配置文件 | `app.config.ts` | 标准 `vite.config.ts` |
| HTML 文档壳 | `component` 里返回整个文档 | `shellComponent`，语义更准确 |
| 状态 | beta | 正式版 |

「不需要 `index.html`」这一点第一次看到会觉得奇怪，但它其实很合理：既然根路由要控制 `<head>` 里的每一个 meta 标签，那 HTML 文档本身就应该是路由树的产物，而不是一个静态模板加一个挂载点。

```tsx
export const Route = createRootRoute({
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

## 迁移中真正花时间的地方

不是路由，也不是数据层。是**元信息**。

博客的 SEO 全靠 `<head>`，而 `<head>` 在新架构里由 `head()` 选项产生，并且沿着路由树逐层合并。根路由定义站点级默认值，文章路由覆盖标题和描述：

```tsx
head: ({ loaderData }) =>
  seo({
    title: loaderData.post.title,
    description: loaderData.post.description,
    path: `/posts/${loaderData.post.slug}`,
    type: 'article',
    jsonLd: blogPosting(loaderData.post),
  }),
```

合并规则需要理解清楚：子路由的 `title` 覆盖父路由，`meta` 数组按 name/property 去重，`links` 累加。搞明白之后它比手动管理 `<Head>` 组件要干净得多——**元信息成了路由定义的纯函数**，而不是一个有自己生命周期的组件。

## 什么时候不该用它

说点反面的。

如果你的站点是纯静态的、内容不常变的、部署在 CDN 上就完事了，那 TanStack Start 提供的东西你用不上多少，Astro 会更轻。

如果团队已经有一套成熟的 Next.js 基础设施——中间件、鉴权、部署流水线——迁移的成本不在代码，在于那些隐性约定。

它真正的甜区是：**你已经在用 TanStack Router 或 TanStack Query，并且需要一个类型安全的全栈层**。这种情况下迁移是渐进的，收益是即时的。

---

迁移花了一个周末。类型错误帮我找出了四个我自己都不知道存在的死链接，光这一条就已经值回票价了。
