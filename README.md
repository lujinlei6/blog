# VOID · 虚空

暗色优先的中文技术博客。TanStack Start v1（SSR）+ TanStack Router 文件路由 + Tailwind CSS 4，部署在 Cloudflare Workers。

页面：首页 `/`、文章列表 `/posts`、文章详情 `/posts/$slug`、关于 `/about`，外加 `/feed.xml`（RSS 2.0）、`/sitemap.xml`、`/robots.txt`。每页输出 canonical、Open Graph、Twitter Card 与 JSON-LD。

## 命令

```bash
bun install
bun run dev            # http://localhost:3000，SSR 跑在本地 workerd
bun run build          # vite build && tsc -b，产物在 dist/
bun run preview        # 本地跑生产构建（workerd）
bun run deploy         # build && wrangler deploy
bun run lint           # oxlint
bun run format         # oxfmt（--check 只校验）
```

## 写一篇文章

在 `content/posts/` 下新建 `<slug>.md`，无需改任何代码。slug 即文件名，须匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；日期属于 frontmatter，不要放进文件名。

```markdown
---
title: 标题
date: 2026-01-01
updated: 2026-02-01 # 可选
description: 一句话摘要，直接用作 SEO description（≤200 字）
tags: [TanStack, CSS]
cover: /cover.png # 可选
draft: false # 生产构建中 draft 会被排除
featured: false # true 则进首页 bento 大图位
---
```

`content/about.md` 同理，渲染到 `/about`。

Markdown 在**构建期**经 unified 管线渲染（GFM + Shiki 高亮 + 标题锚点，管线在 `build/markdown.ts`），**不启用 `rehype-raw`**：正文里的裸 HTML 会被丢弃而非透传。渲染结果以 `?rendered` 模块内联进 worker bundle，运行时不再碰 Shiki——workerd 禁止运行时编译 WASM（Shiki 的 oniguruma 引擎正是这么干的，报 `Wasm code generation disallowed by embedder`），Workers 免费计划单次调用的 CPU 预算也装不下语法编译。阅读时长按中文 300 字/分、拉丁 200 词/分混合计算。

## 结构约定

- `src/lib/*.server.ts` 只进服务端 bundle；`posts.functions.ts` 用 `createServerFn` 做同构边界（handler 必须内联，编译器才能抽取）。
- 内容经 `import.meta.glob(..., { query: '?raw' })` 内联进服务端产物，不用 `node:fs`；同一批文件再以 `query: '?rendered'` 取构建期渲染好的 HTML（见下条）。
- `build/` 只属于构建期（在 tsconfig.node.json 的 include 里，与 `src/` 分属两个 tsc 项目）：`render-plugin.ts` 在 Vite 的 Node 进程里渲染 Markdown，作为 `?rendered` 模块的 default export，因此 Shiki 进不了 worker bundle。代价是 frontmatter 的栅栏正则在 `build/markdown.ts` 与 `src/lib/content.server.ts` 各存一份——共享常量文件意味着跨 tsc 项目引用，比一行正则重复更糟。
- 设计令牌在 `src/styles/app.css` 的 `@theme`，浅色覆盖在同文件的 `html[data-theme='light']` 块——刻意不放进任何 `@layer`，否则压不过 `@theme` 生成的 `:root`。令牌阶在浅色下**语义反转**（`void-950` 变成最亮表面、`ink-100` 变成最深文字），所以既有工具类的含义在两种模式下都成立，组件类名基本无需改动。CJK 正文排版在 `src/styles/prose.css`（行高 1.8、栏宽 40rem、`text-wrap: pretty` 等）。
- 客户端交互只有两处：`ScrollReveal`（IntersectionObserver）和 `ThemeToggle`（主题切换）。reveal 的隐藏态挂在 `.js .reveal` 下，`.js` 由 `__root.tsx` 的内联 head 脚本同步加上，因此禁用 JS 时内容依然完整可见；同一个脚本还在首屏前解析主题并写 `data-theme`/`data-theme-pref`，所以禁用 JS 时站点停在 `:root` 的深色默认值，而切换按钮由 `.js .theme-toggle` 整体隐藏（没有 JS 它只是个空壳）。`ThemeToggle` 自身不持有任何 state——三个图标都进 SSR 标记，由 CSS 按 `data-theme-pref` 决定显示哪个，否则服务端猜不到解析结果、必然水合不匹配。首屏 hero 不参与 reveal——它是 LCP 元素，必须只靠 SSR HTML 就能绘制。

## 部署

Cloudflare Workers：`wrangler.jsonc` 的 `main` 指向 `@tanstack/react-start/server-entry`，`compatibility_flags` 必须含 `nodejs_compat`；静态资源目录由 `@cloudflare/vite-plugin` 自动接管，不用手写 `assets`。`bun run deploy` 即 build + 上传。

站点绝对 URL 走 `VITE_SITE_URL`（默认 `http://localhost:3000`），影响 canonical、OG 与 RSS。它是 `VITE_` 前缀的**构建期**变量，内联进产物，所以放 `.env.production`（或 CI 的构建环境变量）里；`.dev.vars` 是运行时 secret，对它无效。改域名必须重新部署。

换平台：把 `vite.config.ts` 里的 `cloudflare()` 换成对应插件（Netlify/Vercel 各有官方插件），其余代码不变——Markdown 渲染在构建期完成，与运行时平台无关。

改全静态输出：给 `tanstackStart()` 加 `prerender: { enabled: true, crawlLinks: true }`，产物可直接丢 CDN。

## 已知取舍

- 无搜索、标签页、归档、TOC、相关推荐、评论、分页——均为有意不做。
- React Compiler 已移除：本站没有值得编译器优化的客户端重渲染，且与 Start 插件的 AST 变换叠加属未验证组合。
- `nitro` 仍留在 devDependencies 里，但 `vite.config.ts` 已不引用它：Node 部署路径被 Cloudflare Workers 取代后的遗留。确认 TanStack Start 内部不再间接需要它之后可以删。
- 默认分享图 `public/og-default.svg` 是 SVG；少数社交爬虫只认 PNG，必要时补一张 1200×630 的 PNG 并改 `seo.ts` 的默认 image。
- Shiki 双主题：`void-night` 派生自 tokyo-night、`void-day` 派生自 catppuccin-latte。两个原主题的注释/流程关键字对比度都不足 WCAG AA（tokyo-night 约 2.5:1），构建时按各自极性统一提亮到 4.5:1 以上——深色向白混合、浅色向黑混合。以 `defaultColor: false` 渲染，span 只带 `--shiki-dark`/`--shiki-light` 变量、不内联 `color`，由 `prose.css` 按 `data-theme` 选用，因此同一份 HTML 服务两种模式、切换主题不触发重渲染。代价是每个 token 多约 40 字节。
- `public/favicon.svg` 与 `public/og-default.svg` **刻意保持深色**，不跟随主题：OG 图在社交信息流里消费，与访问者的主题无关；favicon 落在浏览器 chrome 上，深色底块在两种模式下都清晰。这不是漏改。
- `theme-color` 只有**一条**静态 meta（深色值，兼作无 JS 回退），由内联主题脚本在首屏前按解析结果改写 `content`——因此它能跟随手动切换，比 media 查询更准。不要改成按 `prefers-color-scheme` 分域的两条：React 19 按 `name` 去重 `<meta>`，`media` 不参与去重键，两条会塌缩成最后一条（实测只剩浅色那条）。
