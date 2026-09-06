---
title: 用 Tailwind 4 的 @theme 搭一套暗色设计系统
date: 2026-06-02
description: Tailwind 4 把配置从 JS 搬进了 CSS，@theme 成了唯一的真相来源。这篇讲怎么用它搭一套有纪律的暗色系统，而不是堆一堆一次性色值。
tags:
  - Tailwind
  - 设计系统
  - CSS
featured: true
---

Tailwind 4 最大的变化不是性能，是**配置文件消失了**。没有 `tailwind.config.js`，设计令牌直接写在 CSS 里。

这看起来只是换了个地方写配置，实际上改变了心智模型：令牌不再是构建工具的输入，而是样式表本身的一部分。

## 命名空间决定一切

`@theme` 里的变量名不是随便起的。Tailwind 通过**前缀命名空间**判断这个变量应该生成什么工具类：

```css
@theme {
  --color-void-900: #0a0a11;   /* → bg-void-900 / text-void-900 / border-void-900 */
  --font-sans: 'Inter';        /* → font-sans */
  --text-display: 3.5rem;      /* → text-display */
  --radius-card: 1rem;         /* → rounded-card */
  --shadow-glow: 0 0 32px #0003; /* → shadow-glow */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* → ease-spring */
}
```

反过来，**不在命名空间里的变量不会生成任何工具类**：

```css
@theme {
  --gradient-aurora: linear-gradient(...); /* 没有 --gradient-* 命名空间 */
  --dur-fast: 150ms;                        /* 没有 --dur-* 命名空间 */
}
```

这两个变量仍然会作为 CSS 自定义属性输出，但你写不出 `bg-gradient-aurora`。新手最常踩的坑就在这里——把一个自定义变量放进 `@theme`，然后困惑为什么工具类不存在。

正确做法是把它们放在 `:root`，然后在 `@layer utilities` 里封装成语义明确的工具类：

```css
:root {
  --gradient-aurora: linear-gradient(
    100deg,
    var(--color-aurora-cyan),
    var(--color-aurora-violet) 55%,
    var(--color-aurora-rose)
  );
}

@layer utilities {
  .text-aurora {
    background-image: var(--gradient-aurora);
    background-clip: text;
    color: transparent;
  }
}
```

## 暗色不是把白色反过来

暗色系统最常见的失败是**用纯黑做底、用纯白做字**，然后把中间层做成不同透明度的白。结果是页面看起来扁平、没有纵深，长时间阅读还会刺眼。

三个修正：

**1. 底色带一点色相。** 我给 VOID 选的是蓝调：

```css
--color-void-950: #06060a; /* 最底 */
--color-void-900: #0a0a11; /* 页面底色 */
--color-void-850: #101018; /* 卡片面 */
--color-void-800: #16161f; /* 抬升面 */
--color-void-700: #23232f; /* 描边 */
```

这几档之间的差值很小（每档约 6–8 个点亮度），肉眼几乎分辨不出「更亮」，但能分辨出「更靠前」。这就是纵深感。

**2. 文字不用纯白。**

```css
--color-ink-100: #eceaf4; /* 正文，不是 #fff */
--color-ink-400: #a3a1b5; /* 次要信息 */
--color-ink-600: #6e6c85; /* 装饰性文字 */
```

纯白在暗底上的对比度过高（约 21:1），会产生光晕效应。`#eceaf4` 大约是 15:1，仍然远超 WCAG AAA 的 7:1，但读起来舒服得多。

**3. 用彩色阴影，不是黑色阴影。** 暗底上的黑色阴影是看不见的。要制造「浮起」的感觉，阴影必须带颜色：

```css
--shadow-glow-cyan: 0 0 32px -8px rgb(34 211 238 / 0.35);
--shadow-card:
  0 1px 0 0 rgb(255 255 255 / 0.04) inset, /* 顶部一道高光 */
  0 16px 40px -24px rgb(0 0 0 / 0.9);      /* 底部扩散 */
```

那条 `inset` 的顶部高光很关键——它模拟了光线从上方打在卡片边缘的效果，是让平面元素「立起来」最便宜的手段。

## 强调色要有硬上限

暗色科技风最容易翻车的地方是**渐变滥用**。屏幕上同时出现五六种高饱和色，看起来就像 2018 年的加密货币落地页。

我的规矩是：**三种色相，写进令牌，不允许在组件里出现第四种。**

```css
--color-aurora-cyan: #22d3ee;
--color-aurora-violet: #a78bfa;
--color-aurora-rose: #f472b6;
```

所有渐变都只由这三个组合。有了这个约束之后，「这个按钮该用什么颜色」不再是设计决策，而是查表。

## 动效时长也要收进令牌

```css
:root {
  --dur-fast: 150ms;
  --dur-base: 300ms;
  --dur-slow: 500ms;
}
```

三档，没有第四档。配合两条缓动曲线：

```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1); /* 大部分过渡 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 需要一点弹性的强调 */
```

在 Tailwind 里用起来是 `duration-[var(--dur-base)] ease-out-expo`。有点啰嗦，但**它让「这个动效该多快」变成了一致的问题**。项目里出现 `duration-237` 是设计系统开始腐烂的信号。

## 尊重 prefers-reduced-motion

这不是可选项。前庭功能障碍用户看到大幅位移和缩放会真的产生生理不适。

```css
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

用 `0.01ms` 而不是 `0s`，是因为某些浏览器在 `0s` 时会完全跳过过渡结束事件，导致依赖 `transitionend` 的逻辑卡住。

## 渐进增强比想象的重要

如果你的动效是「初始隐藏、滚动到视口时淡入」，那么**禁用 JS 的用户会看到一片空白**。

解法是把隐藏状态挂在一个只有 JS 能加上的类名下：

```html
<head>
  <script>document.documentElement.classList.add('js')</script>
</head>
```

```css
.reveal {
  transition: opacity 500ms, transform 500ms;
}
.js .reveal {
  opacity: 0;
  transform: translateY(16px);
}
.js .reveal[data-revealed] {
  opacity: 1;
  transform: none;
}
```

那段脚本必须是**同步的、在 `<head>` 里的**。放在 body 末尾或者加了 `defer`，用户会先看到内容再看到它消失，也就是所谓的闪烁。

---

设计系统的价值不在于令牌有多漂亮，而在于**它替你做了多少个决定**。写完之后如果每次加新组件还要重新想颜色、想时长、想圆角，那这套令牌就只是把魔法数字从组件里搬到了 CSS 里而已。
