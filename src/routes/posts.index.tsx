import { createFileRoute } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { PostCard } from '~/components/PostCard'
import { ScrollReveal } from '~/components/ScrollReveal'
import { fetchPosts } from '~/lib/posts.functions'
import { seo } from '~/lib/seo'
import { SITE, absoluteUrl } from '~/lib/site'

export const Route = createFileRoute('/posts/')({
  loader: () => fetchPosts(),
  head: ({ loaderData }) => {
    const posts = loaderData ?? []
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
  const posts = Route.useLoaderData()

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
