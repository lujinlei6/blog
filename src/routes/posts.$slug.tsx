import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'
import { PostMeta } from '~/components/PostMeta'
import { Prose } from '~/components/Prose'
import { ReadingProgress } from '~/components/ReadingProgress'
import { RelatedPosts } from '~/components/RelatedPosts'
import { TableOfContents, TableOfContentsDrawer } from '~/components/TableOfContents'
import { formatDate } from '~/lib/format'
import { getCategory } from '~/lib/categories'
import { fetchPost, fetchRelatedPosts } from '~/lib/posts.functions'
import { seo } from '~/lib/seo'
import { SITE, absoluteUrl } from '~/lib/site'

export const Route = createFileRoute('/posts/$slug')({
  loader: async ({ params }) => {
    const [post, related] = await Promise.all([
      fetchPost({ data: { slug: params.slug } }),
      fetchRelatedPosts({ data: { slug: params.slug, limit: 3 } }),
    ])
    if (!post) throw notFound()
    return { post, related }
  },
  head: ({ loaderData }) => {
    const post = loaderData?.post
    if (!post) {
      return seo({ title: '文章未找到', path: '/posts' })
    }

    const path = `/posts/${post.slug}`
    const image = post.cover ?? '/og-default.svg'

    return seo({
      title: post.title,
      description: post.description,
      path,
      image,
      type: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        image: absoluteUrl(image),
        datePublished: post.date,
        dateModified: post.updated ?? post.date,
        inLanguage: SITE.locale,
        mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(path) },
        author: {
          '@type': 'Person',
          name: SITE.author.name,
          jobTitle: SITE.author.role,
        },
        publisher: { '@type': 'Organization', name: SITE.name },
        keywords: post.tags.join(', '),
        articleSection: post.category
          ? [getCategory(post.category)?.name, ...post.tags].filter(Boolean)
          : post.tags,
      },
    })
  },
  component: PostDetail,
})

function PostDetail() {
  const { post, related } = Route.useLoaderData()
  const category = post.category !== undefined ? getCategory(post.category) : undefined

  return (
    <article>
      <ReadingProgress />

      <Container width="reading" className="pt-14 pb-10 sm:pt-20">
        <Link
          to="/posts"
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 transition-colors duration-[var(--dur-fast)] ease-out-expo hover:text-ink-100"
        >
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          返回文章列表
        </Link>

        {category ? (
          <Link
            to="/categories/$category"
            params={{ category: category.slug }}
            className="mt-6 inline-flex items-center gap-1.5 rounded-pill border border-aurora-cyan/40 bg-aurora-cyan/10 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-aurora-cyan uppercase transition-[border-color,background-color] duration-[var(--dur-fast)] ease-out-expo hover:border-aurora-cyan/70 hover:bg-aurora-cyan/20"
          >
            <Icon name="tag" className="h-3 w-3" />
            {category.name}
          </Link>
        ) : null}

        <div className="rule-aurora mt-8 w-20" aria-hidden />

        <h1 className="mt-6 text-3xl font-semibold text-ink-100 sm:text-title">{post.title}</h1>

        <p className="mt-5 text-lead leading-relaxed text-ink-400">{post.description}</p>

        <PostMeta post={post} className="mt-7" />
      </Container>

      {post.cover ? (
        <Container className="pb-4">
          <img
            src={post.cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-card border border-void-700 object-cover shadow-card"
          />
        </Container>
      ) : null}

      <Container width="reading" className="pb-24">
        {post.headings.length > 0 ? (
          <details className="group mb-6 rounded-card border border-void-700 bg-void-850/60 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm text-ink-100 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Icon name="tag" className="h-3.5 w-3.5 text-aurora-cyan" />
                目录
              </span>
              <Icon
                name="arrowRight"
                className="h-3.5 w-3.5 text-ink-600 transition-transform duration-[var(--dur-base)] ease-out-expo group-open:rotate-90"
              />
            </summary>
            <div className="border-t border-void-700 px-5 py-4">
              <TableOfContents headings={post.headings} showEyebrow={false} />
            </div>
          </details>
        ) : null}

        <div className="lg:flex lg:gap-12">
          <div className="min-w-0 flex-1">
            <Prose html={post.contentHtml} className="mt-10" />

            <footer className="mt-16 border-t border-void-700 pt-8 text-sm text-ink-400">
              <p>
                发布于 {formatDate(post.date)}
                {post.updated ? `，最后更新于 ${formatDate(post.updated)}` : ''}。
              </p>
              <Link
                to="/posts"
                className="mt-8 inline-flex items-center gap-1.5 text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo hover:text-aurora-cyan"
              >
                <Icon name="arrowLeft" className="h-4 w-4" />
                浏览全部文章
              </Link>
            </footer>

            <RelatedPosts posts={related} />
          </div>
        </div>

        {/* Left-edge hover drawer for the desktop outline. */}
        <TableOfContentsDrawer headings={post.headings} />
      </Container>
    </article>
  )
}
