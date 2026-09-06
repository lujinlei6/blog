import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'
import { PostCard } from '~/components/PostCard'
import { ScrollReveal } from '~/components/ScrollReveal'
import { getCategory } from '~/lib/categories'
import { fetchPostsByCategory } from '~/lib/posts.functions'
import { seo } from '~/lib/seo'
import { SITE, absoluteUrl } from '~/lib/site'

export const Route = createFileRoute('/categories/$category')({
  loader: async ({ params }) => {
    // Registry check first: an unknown slug is a 404 even before counting posts.
    const category = getCategory(params.category)
    if (!category) throw notFound()

    const posts = await fetchPostsByCategory({ data: { category: params.category } })
    return { category, posts }
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return seo({ title: '分类未找到', path: '/categories' })
    }

    const { category, posts } = loaderData
    const description =
      posts.length > 0
        ? `${category.name} 分类下共 ${posts.length} 篇文章。${category.description}`
        : `${category.description}（暂无文章，陆续更新中）`

    return seo({
      title: `${category.name} · 分类`,
      description,
      path: `/categories/${category.slug}`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${category.name} · ${SITE.name}`,
        description,
        url: absoluteUrl(`/categories/${category.slug}`),
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
  component: CategoryDetail,
})

function CategoryDetail() {
  const { category, posts } = Route.useLoaderData()

  return (
    <Container as="main" className="pt-16 pb-24 sm:pt-20">
      <ScrollReveal>
        <Link
          to="/categories"
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 transition-colors duration-[var(--dur-fast)] ease-out-expo hover:text-ink-100"
        >
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          全部分类
        </Link>

        <div className="mt-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <p className="font-mono text-xs tracking-[0.2em] text-aurora-violet uppercase">
              Category
            </p>
            <span className="font-mono text-xs text-ink-600">{category.slug}</span>
          </div>
          <h1 className="mt-3 font-mono text-title font-semibold tracking-wide text-ink-100">
            {category.name}
          </h1>
          <p className="mt-4 max-w-[34rem] text-ink-400">{category.description}</p>
          <p className="mt-2 font-mono text-xs text-ink-600">共 {posts.length} 篇文章</p>
        </div>
      </ScrollReveal>

      {posts.length > 0 ? (
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <ScrollReveal key={post.slug} delay={Math.min(index, 5) * 60} className="h-full">
              <PostCard post={post} />
            </ScrollReveal>
          ))}
        </div>
      ) : (
        <ScrollReveal>
          <div className="mt-12 rounded-card border border-dashed border-void-700 p-10 text-center">
            <p className="text-ink-400">这个分类的文章还在路上——坑已经踩了，笔记正在整理。</p>
            <Link
              to="/posts"
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo hover:text-aurora-cyan"
            >
              先去看看全部文章
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
      )}
    </Container>
  )
}
