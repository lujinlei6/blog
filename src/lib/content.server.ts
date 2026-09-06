import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { CATEGORIES, getCategory } from '~/lib/categories'
import { readingMinutes } from '~/lib/reading-time'
import type { AboutPage, CategorySummary, Heading, Post, PostWithContent } from '~/lib/types'

/**
 * Globbed with `?raw` and `eager` so the Markdown is inlined into the server
 * bundle at build time. Reading `content/` with `node:fs` instead would work in
 * dev and 404 in production, because Nitro's entry is `.output/server/index.mjs`
 * and `process.cwd()` there is not guaranteed to be the project root.
 */
const postSources = import.meta.glob('/content/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const aboutSources = import.meta.glob('/content/about.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * The same documents rendered to HTML at build time by build/render-plugin.ts,
 * which runs in Vite's Node process. The worker never loads Shiki: workerd
 * rejects runtime WASM compilation, and grammar compilation would not fit the
 * free plan's CPU budget per invocation either. Keys match the `?raw` globs.
 */
const postHtml = import.meta.glob<string>('/content/posts/*.md', {
  query: '?rendered',
  import: 'default',
  eager: true,
})

const aboutHtml = import.meta.glob<string>('/content/about.md', {
  query: '?rendered',
  import: 'default',
  eager: true,
})

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const postFrontmatter = z.object({
  title: z.string().min(1),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  description: z.string().min(1).max(200),
  /** Must exist in src/lib/categories.ts — enforced below, after zod. */
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  cover: z.string().optional(),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
})

const aboutFrontmatter = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(200),
})

/** Splits on the first `---`/`---` fence and returns the body after it. */
function splitFrontmatter(raw: string, file: string): { data: unknown; body: string } {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) {
    throw new Error(`${file}: 缺少 frontmatter（文件必须以 --- 开头）`)
  }
  return { data: parseYaml(match[1]), body: raw.slice(match[0].length) }
}

function slugFromPath(path: string): string {
  const file = path.split('/').pop() ?? path
  return file.replace(/\.md$/, '')
}

type Source = { meta: Post }

function buildSources(): Source[] {
  const sources: Source[] = []

  for (const [path, raw] of Object.entries(postSources)) {
    const file = `content/${path.replace(/^\//, '')}`
    const { data, body } = splitFrontmatter(raw, file)
    const parsed = postFrontmatter.safeParse(data)
    if (!parsed.success) {
      throw new Error(`${file}: frontmatter 校验失败 — ${parsed.error.message}`)
    }

    const slug = slugFromPath(path)
    if (!SLUG_RE.test(slug)) {
      throw new Error(`${file}: slug "${slug}" 不合法，文件名只能用小写字母、数字和连字符`)
    }
    if (sources.some((source) => source.meta.slug === slug)) {
      throw new Error(`${file}: slug "${slug}" 重复`)
    }

    const fm = parsed.data
    // Drafts stay visible locally so they can be previewed before publishing.
    if (fm.draft && import.meta.env.PROD) continue

    if (fm.category !== undefined && !getCategory(fm.category)) {
      const known = CATEGORIES.map((category) => category.slug).join(', ')
      throw new Error(
        `${file}: category "${fm.category}" 未注册。请在 src/lib/categories.ts 的 CATEGORIES 里添加它。已注册：${known}`,
      )
    }

    sources.push({
      meta: {
        slug,
        title: fm.title,
        description: fm.description,
        // ISO string, not a Date: server-function payloads are serialized and a
        // string round-trips without depending on the serializer reviving dates.
        date: fm.date.toISOString(),
        updated: fm.updated?.toISOString(),
        category: fm.category,
        tags: fm.tags,
        cover: fm.cover,
        featured: fm.featured,
        readingMinutes: readingMinutes(body),
      },
    })
  }

  return sources
}

/** Rendered HTML ships inside the bundle; a miss means the `?rendered` plugin
    and the `?raw` glob disagree about what is in the content directory. */
function renderedHtml(path: string, sources: Record<string, string>): string {
  const html = sources[path]
  if (html === undefined) {
    throw new Error(`${path}: 缺少构建期渲染产物（?rendered glob 未命中）`)
  }
  return html
}

let cachedSources: Source[] | null = null

function getSources(): Source[] {
  cachedSources ??= buildSources()
  return cachedSources
}

/** Newest first. ISO date strings sort chronologically with a plain compare. */
export async function listPosts(): Promise<Post[]> {
  return getSources()
    .map((source) => source.meta)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Every registry category with its published post count, in registry order.
 * Categories with zero posts are kept so the taxonomy is browsable up front.
 */
export async function listCategories(): Promise<CategorySummary[]> {
  const posts = await listPosts()
  return CATEGORIES.map((category) => ({
    ...category,
    count: posts.filter((post) => post.category === category.slug).length,
  }))
}

/** Newest first, filtered to one registry category. */
export async function getPostsByCategory(categorySlug: string): Promise<Post[]> {
  const posts = await listPosts()
  return posts.filter((post) => post.category === categorySlug)
}

export async function getPost(slug: string): Promise<PostWithContent | null> {
  const source = getSources().find((item) => item.meta.slug === slug)
  if (!source) return null

  const contentHtml = renderedHtml(`/content/posts/${source.meta.slug}.md`, postHtml)
  return { ...source.meta, contentHtml, headings: extractHeadings(contentHtml) }
}

/**
 * Extracts the h2/h3 outline from already-rendered HTML. rehype-slug assigns
 * each heading an `id`, so the TOC links are plain in-page anchors. Text is
 * stripped of the trailing `#` that rehype-autolink-headings appends as a
 * wrapped `.anchor` child.
 */
function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = []
  const re = /<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const level = Number(match[1]) as 2 | 3
    const id = match[2]
    const text = match[3]
      .replace(/<[^>]+>/g, '')
      .replace(/[#\s]+$/, '')
      .trim()
    if (text) headings.push({ id, text, level })
  }
  return headings
}

/**
 * Featured posts first, then the newest remaining ones as filler, so the home
 * page bento grid always has enough cards even if `featured` is unset.
 */
export async function getFeaturedPosts(limit: number): Promise<Post[]> {
  const posts = await listPosts()
  const featured = posts.filter((post) => post.featured)
  const filler = posts.filter((post) => !post.featured)
  return [...featured, ...filler].slice(0, limit)
}

/** Newest first, with rendered HTML — the RSS feed ships full content. The
    heading outline is omitted: it only exists to drive the article TOC. */
export async function getFeedPosts(limit: number): Promise<Omit<PostWithContent, 'headings'>[]> {
  const sources = getSources()
    .slice()
    .sort((a, b) => b.meta.date.localeCompare(a.meta.date))

  return sources.slice(0, limit).map((source) => ({
    ...source.meta,
    contentHtml: renderedHtml(`/content/posts/${source.meta.slug}.md`, postHtml),
  }))
}

/**
 * Related posts for the article footer: same-category posts first, then
 * tag-overlap matches, newest first, excluding the current post. Falls back to
 * the newest posts when there is neither signal.
 */
export async function getRelatedPosts(slug: string, limit: number): Promise<Post[]> {
  const posts = await listPosts()
  const current = posts.find((post) => post.slug === slug)
  if (!current) return []

  const others = posts.filter((post) => post.slug !== slug)

  const score = (post: Post): number => {
    let s = 0
    if (current.category && post.category === current.category) s += 3
    const overlap = post.tags.filter((tag) => current.tags.includes(tag)).length
    s += overlap
    return s
  }

  const scored = others
    .map((post) => ({ post, score: score(post) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.post.date.localeCompare(a.post.date))
    .map((entry) => entry.post)

  const fill = others
    .filter((post) => !scored.includes(post))
    .sort((a, b) => b.date.localeCompare(a.date))

  return [...scored, ...fill].slice(0, limit)
}

export async function getAbout(): Promise<AboutPage> {
  const sources = Object.values(aboutSources)
  if (sources.length === 0) {
    throw new Error('content/about.md 不存在')
  }
  const { data } = splitFrontmatter(sources[0], 'content/about.md')
  const parsed = aboutFrontmatter.safeParse(data)
  if (!parsed.success) {
    throw new Error(`content/about.md: frontmatter 校验失败 — ${parsed.error.message}`)
  }

  const contentHtml = renderedHtml('/content/about.md', aboutHtml)
  return {
    title: parsed.data.title,
    description: parsed.data.description,
    contentHtml,
  }
}
