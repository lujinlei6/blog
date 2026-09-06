---
title: 中文网页排版的十条规矩
date: 2026-07-19
description: 把西文排版经验直接套用到中文上，几乎每一条都会出错。这十条是我在真实项目里反复验证过的中文网页排版约束，附可以直接抄的 CSS。
tags:
  - 排版
  - CSS
  - 中文
---

中文排版的资料大多来自印刷时代，而网页有自己的约束：可变视口、系统字体不可控、渲染引擎差异。下面十条是针对**屏幕上的中文长文**的。

## 一、行高至少 1.8

汉字是方块字，字面率高，笔画密度大。西文靠升降部（ascender/descender）在行间制造天然留白，中文没有这个机制。

```css
body {
  line-height: 1.8; /* 西文常用的 1.5 对中文来说太挤 */
}
```

标题可以压到 1.25–1.35，因为标题短、不需要长时间扫读。**正文和标题必须用不同的行高**，很多站点只设一个全局值，结果两边都不对。

## 二、栏宽按字数算，不按字符算

西文的经典结论是每行 65–75 个字符。中文的舒适区是**每行 30–35 个汉字**。

如果直接用 `max-width: 75ch`，中文一行会排到 70 多个字，读者的眼睛在换行时找不到下一行的起点。

```css
.prose {
  max-width: 40rem; /* 16px 基准下约 640px，一行 32-35 个汉字 */
}
```

`ch` 单位在中文场景下不可靠——它以字符 `0` 的宽度为基准，而汉字宽度约等于两个 `0`。用 `rem` 更可控。

## 三、永远不要两端对齐

> `text-align: justify` 在中文长文里会制造「白河」。

原因是汉字等宽，浏览器为了撑满行宽只能把间隙均摊到每个字之间，视觉上形成从上到下贯穿段落的空白通道。西文因为单词宽度不等，均摊之后不明显；中文会非常明显。

左对齐（在中文语境下即 `text-align: left`，不是 `start`——如果将来做 RTL 语言再考虑）是唯一稳妥的选择。

## 四、字距只能为正，或者为零

```css
body {
  letter-spacing: 0.01em; /* 可以 */
}
h1 {
  letter-spacing: -0.02em; /* 西文标题的常规做法，中文慎用 */
}
```

西文大字号标题收紧字距是为了视觉密度。汉字本身已经很密，再收紧会让笔画粘连。**标题的字距最多收到 `-0.01em`，正文保持 `0` 到 `0.02em`。**

## 五、段间距用 em，不用固定值

```css
.prose > * + * {
  margin-top: 1.4em; /* 随字号缩放 */
}
```

用 `em` 的好处是在移动端调大字号时段落节奏不会崩。用固定的 `margin-bottom: 1rem` 则会在大字号下显得局促。

用相邻兄弟选择器 `> * + *` 而不是给 `p` 加 `margin-bottom`，可以避免第一个元素上方多出空白、以及最后一个元素下方影响容器高度。

## 六、中文没有斜体

浏览器对中文应用 `font-style: italic` 时会**合成倾斜**——把字形整体剪切变形，而不是使用真正的斜体字面。结果是难看的伪斜体。

```css
.prose em {
  font-style: normal; /* 关掉合成倾斜 */
  color: var(--color-ink-100);
  text-decoration: underline dashed;
  text-underline-offset: 0.25em;
}
```

用颜色、下划线或字重变化来表达强调，不要倾斜。

## 七、中西文之间要留缝隙

行内代码和英文片段夹在中文里时，字形会贴死：

```
使用import.meta.glob读取文件 —— 太挤
```

给行内元素加一点水平内边距就够了：

```css
.prose :not(pre) > code {
  padding: 0.15em 0.4em;
  margin-inline: 0.1em;
}
```

自动在中英文之间插入空格（所谓「盘古之白」）需要构建期处理正文，成本高、边界情况多。用 CSS 留缝是投入产出比更高的做法。

## 八、不要加载中文 webfont

一个中文字体单字重就有 **3–8 MB**，因为要覆盖几千个常用字。可变字体也救不了——问题在字形数量，不在字重数量。

```css
font-family:
  'Inter Variable',        /* 拉丁字符走 webfont，只有几十 KB */
  'PingFang SC',           /* macOS / iOS */
  'Microsoft YaHei',       /* Windows */
  'Noto Sans CJK SC',      /* Android / Linux */
  system-ui,
  sans-serif;
```

把拉丁字符和 CJK 字符**分开对待**：拉丁用自托管 webfont保证品牌一致性，中文交给系统字体保证零成本。现代设备上系统中文字体的渲染质量已经很好。

如果真的必须用自定义中文字面，考虑**字体子集化**——只打包站点实际用到的字符。标题字体尤其适合这么做，因为标题字符集是有限且已知的。

## 九、标点要挂出去，或者至少别断行

中文标点占一个全角宽度，行首出现逗号、句号、右引号会很难看。

```css
.prose {
  hanging-punctuation: allow-end; /* Safari 支持，其他浏览器忽略 */
  line-break: strict;             /* 严格的 CJK 断行规则 */
}
```

`hanging-punctuation` 目前只有 Safari 实现，但它是渐进增强的——写上去不会有副作用。`line-break: strict` 在各引擎上都能阻止标点出现在行首。

## 十、`word-break: break-all` 是错的

```css
.prose {
  word-break: normal;       /* 让浏览器应用原生 CJK 断行 */
  overflow-wrap: break-word; /* 只在超长不可断词（URL、代码）时强制断开 */
}
```

`break-all` 会在任意字符处断行，包括英文单词中间，中英文混排时结果非常糟。浏览器本身知道怎么给中文断行，你只需要处理超长 URL 这一个特例，那是 `overflow-wrap: break-word` 的工作。

---

## 汇总

下面这份可以直接抄走，覆盖了上面十条里能纯 CSS 解决的部分：

```css
.prose {
  max-width: 40rem;
  font-size: 1.0625rem;
  line-height: 1.8;
  letter-spacing: 0.01em;
  text-align: left;
  word-break: normal;
  overflow-wrap: break-word;
  line-break: strict;
  hanging-punctuation: allow-end;
}

.prose > * + * {
  margin-top: 1.4em;
}

.prose em {
  font-style: normal;
  text-decoration: underline dashed;
  text-underline-offset: 0.25em;
}

.prose :not(pre) > code {
  padding: 0.15em 0.4em;
  margin-inline: 0.1em;
}
```

排版这件事的门槛不在于知道规则，而在于**愿意为一种文字单独调一遍**。绝大多数难看的中文网页，都是直接把西文的数值抄过来的结果。
