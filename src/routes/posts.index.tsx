import { createFileRoute } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { PostCard } from '~/components/PostCard'
import { ScrollReveal } from '~/components/ScrollReveal'
import { fetchCategories, fetchPosts } from '~/lib/posts.functions'
import { seo } from '~/lib/seo'
import { SITE, absoluteUrl } from '~/lib/site'
import { cx } from '~/lib/cx'

export const Route = createFileRoute('/posts/')({
  loader: async () => {
    const [posts, categories] = await Promise.all([fetchPosts(), fetchCategories()])
    return { posts, categories }
  },
  head: ({ loaderData }) => {
    const posts = loaderData?.posts ?? []
    const description = `全部 ${posts.length} 篇文章，按发布时间倒序。`

    return seo({
      title: '文章',
      description,
      path: '/posts',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `文章 · ${SITE.name}`,
        description,
        url: absoluteUrl('/posts'),
        inLanguage: 'zh-CN',
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: posts.map((post, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: post.title,
            url: absoluteUrl(`/posts/${post.slug}`),
          })),
        },
      },
    })
  },
  component: PostsIndex,
})

function PostsIndex() {
  const { posts, categories } = Route.useLoaderData()

  return (
    <Container as="main" className="pt-16 pb-24 sm:pt-20">
      <ScrollReveal>
        <p className="font-mono text-xs tracking-[0.2em] text-aurora-cyan uppercase">Archive</p>
        <h1 className="mt-3 text-title font-semibold text-ink-100">文章</h1>
        <p className="mt-4 max-w-[34rem] text-ink-400">
          共 {posts.length}{' '}
          篇，按发布时间倒序。写的都是我自己踩过的坑，尽量把结论和推导过程一起留下来。
        </p>
      </ScrollReveal>

      {/* Category filter: links out to the per-category pages rather than doing
          client-side filtering, so each hop is a real URL that stays shareable
          and crawlable. */}
      <div className="mt-8 flex flex-wrap gap-2">
        {categories.map((category) => (
          <a
            key={category.slug}
            href={`/categories/${category.slug}`}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-pill border border-void-700 bg-void-850/60 px-4 py-2',
              'font-mono text-xs text-ink-400 transition-[border-color,background-color,color] duration-[var(--dur-fast)] ease-out-expo',
              'hover:border-void-600 hover:bg-void-800 hover:text-ink-100',
            )}
          >
            {category.name}
            <span className="text-ink-600 tabular-nums">{category.count}</span>
          </a>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, index) => (
          <ScrollReveal key={post.slug} delay={Math.min(index, 5) * 60} className="h-full">
            <PostCard post={post} />
          </ScrollReveal>
        ))}
      </div>
    </Container>
  )
}
