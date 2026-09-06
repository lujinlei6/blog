import { Link, createFileRoute } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'
import { PostCard } from '~/components/PostCard'
import { ScrollReveal } from '~/components/ScrollReveal'
import { cx } from '~/lib/cx'
import { fetchCategories, fetchFeaturedPosts, fetchPosts } from '~/lib/posts.functions'
import { seo } from '~/lib/seo'
import { SITE } from '~/lib/site'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [featured, posts, categories] = await Promise.all([
      fetchFeaturedPosts({ data: { limit: 5 } }),
      fetchPosts(),
      fetchCategories(),
    ])
    return { featured, posts, categories }
  },
  head: () =>
    seo({
      title: `${SITE.name} · ${SITE.tagline}`,
      description: SITE.description,
      path: '/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': ['WebSite', 'Blog'],
        name: SITE.name,
        alternateName: SITE.nameZh,
        description: SITE.description,
        url: SITE.url,
        inLanguage: SITE.locale,
        author: {
          '@type': 'Person',
          name: SITE.author.name,
          jobTitle: SITE.author.role,
        },
      },
    }),
  component: Home,
})

/**
 * Explicit cell placement rather than letting the grid auto-flow: the bento
 * reads as a 3x3 with the lead article taking the 2x2 top-left, and the last
 * cell is the "all posts" tile rather than a sixth article.
 */
const BENTO_CELLS = [
  'md:col-span-2 md:row-span-2',
  'md:col-start-3 md:row-start-1',
  'md:col-start-3 md:row-start-2',
  'md:col-start-1 md:row-start-3',
  'md:col-start-2 md:row-start-3',
] as const

function Home() {
  const { featured, posts, categories } = Route.useLoaderData()

  return (
    <main>
      <Container as="section" width="content" className="pt-24 pb-20 sm:pt-32">
        {/* Above the fold on purpose: no ScrollReveal here, because the hero is
            the LCP element and must paint from SSR HTML alone. */}
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-pill border border-void-700 bg-void-850/60 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.2em] text-ink-400 uppercase">
            <Icon name="spark" className="h-3 w-3 text-aurora-violet" />
            {SITE.name} / {SITE.nameZh}
          </span>

          <h1 className="mt-8 text-[2.5rem] leading-[1.15] font-semibold text-ink-100 sm:text-6xl lg:text-display">
            把踩过的坑
            <br />
            铺成<span className="text-aurora-animated">上云的路</span>
          </h1>

          <p className="mt-7 max-w-[34rem] text-lead leading-relaxed text-ink-400">
            {SITE.description}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/categories"
              className="bg-aurora inline-flex items-center gap-2 rounded-pill px-6 py-3 text-sm font-semibold text-void-950 shadow-glow-violet transition-transform duration-[var(--dur-base)] ease-spring hover:scale-[1.03]"
            >
              浏览知识分类
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
            <Link
              to="/posts"
              className="inline-flex items-center gap-2 rounded-pill border border-void-700 bg-void-850/60 px-6 py-3 text-sm text-ink-100 transition-[border-color,background-color] duration-[var(--dur-base)] ease-out-expo hover:border-void-600 hover:bg-void-800"
            >
              全部文章
            </Link>
          </div>
        </div>
      </Container>

      <Container as="section" className="py-16">
        <ScrollReveal>
          <SectionHeading eyebrow="Categories" title="知识分类" accent="violet" />
        </ScrollReveal>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.slice(0, 12).map((category) => (
            <ScrollReveal key={category.slug} className="h-full">
              <Link
                to="/categories/$category"
                params={{ category: category.slug }}
                className="group flex h-full flex-col items-start justify-between gap-4 rounded-card border border-void-700 bg-void-850/60 p-4 transition-[transform,border-color,background-color] duration-[var(--dur-base)] ease-out-expo hover:-translate-y-0.5 hover:border-void-600 hover:bg-void-800/70"
              >
                <span className="font-mono text-sm font-semibold tracking-wide text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo group-hover:text-aurora-cyan">
                  {category.name}
                </span>
                <span className="font-mono text-[11px] text-ink-600 tabular-nums">
                  {category.count} 篇
                </span>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </Container>

      <Container as="section" className="py-16">
        <ScrollReveal>
          <SectionHeading eyebrow="Featured" title="精选文章" accent="violet" />
        </ScrollReveal>

        <div className="mt-10 grid grid-cols-1 gap-4 md:auto-rows-fr md:grid-cols-3">
          {featured.map((post, index) => (
            <ScrollReveal
              key={post.slug}
              delay={index * 70}
              className={cx('h-full', BENTO_CELLS[index])}
            >
              <PostCard post={post} size={index === 0 ? 'large' : 'small'} />
            </ScrollReveal>
          ))}

          <ScrollReveal
            delay={featured.length * 70}
            className="h-full md:col-start-3 md:row-start-3"
          >
            <Link
              to="/posts"
              className="group flex h-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-void-700 p-6 text-center transition-[border-color,background-color] duration-[var(--dur-base)] ease-out-expo hover:border-void-600 hover:bg-void-850/60"
            >
              <span className="font-mono text-xs tracking-[0.18em] text-ink-600 uppercase">
                {posts.length} posts
              </span>
              <span className="text-lg font-semibold text-ink-100">浏览全部文章</span>
              <Icon
                name="arrowRight"
                className="h-4 w-4 text-ink-600 transition-[color,transform] duration-[var(--dur-base)] ease-out-expo group-hover:translate-x-1 group-hover:text-aurora-cyan"
              />
            </Link>
          </ScrollReveal>
        </div>
      </Container>

      <Container as="section" width="content" className="py-16">
        <ScrollReveal>
          <SectionHeading eyebrow="Latest" title="最近更新" accent="cyan" />
        </ScrollReveal>

        <ul className="mt-8 border-t border-void-800">
          {posts.map((post, index) => (
            <li key={post.slug} className="border-b border-void-800">
              <ScrollReveal delay={Math.min(index, 5) * 50}>
                <Link
                  to="/posts/$slug"
                  params={{ slug: post.slug }}
                  className="group flex items-baseline justify-between gap-5 py-4"
                >
                  <span className="flex min-w-0 items-baseline gap-4">
                    <time
                      dateTime={post.date}
                      className="shrink-0 font-mono text-xs text-ink-600 tabular-nums"
                    >
                      {post.date.slice(0, 10)}
                    </time>
                    <span className="truncate text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo group-hover:text-aurora-cyan">
                      {post.title}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-ink-600">
                    {post.readingMinutes} min
                  </span>
                </Link>
              </ScrollReveal>
            </li>
          ))}
        </ul>
      </Container>

      <Container as="section" width="content" className="pt-8 pb-24">
        <ScrollReveal>
          <div className="surface-glass flex flex-col gap-6 rounded-card p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div className="max-w-[34rem]">
              <p className="font-mono text-xs tracking-[0.2em] text-aurora-rose uppercase">About</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink-100">
                {SITE.author.name} · {SITE.author.role}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-400">{SITE.author.bio}</p>
            </div>
            <Link
              to="/about"
              className="group inline-flex shrink-0 items-center gap-2 text-sm text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo hover:text-aurora-rose"
            >
              了解更多
              <Icon
                name="arrowRight"
                className="h-4 w-4 transition-transform duration-[var(--dur-base)] ease-out-expo group-hover:translate-x-1"
              />
            </Link>
          </div>
        </ScrollReveal>
      </Container>
    </main>
  )
}

const accents = {
  cyan: 'text-aurora-cyan',
  violet: 'text-aurora-violet',
  rose: 'text-aurora-rose',
} as const

type SectionHeadingProps = {
  eyebrow: string
  title: string
  accent: keyof typeof accents
}

function SectionHeading({ eyebrow, title, accent }: Readonly<SectionHeadingProps>) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={cx('font-mono text-xs tracking-[0.2em] uppercase', accents[accent])}>
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-ink-100 sm:text-2xl">{title}</h2>
      </div>
    </div>
  )
}
