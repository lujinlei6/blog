import { createFileRoute } from '@tanstack/react-router'

import { listCategories, listPosts } from '~/lib/content.server'
import { absoluteUrl } from '~/lib/site'
import { buildSitemap, type SitemapEntry } from '~/lib/xml'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const [posts, categories] = await Promise.all([listPosts(), listCategories()])

        const entries: SitemapEntry[] = [
          { loc: absoluteUrl('/'), changefreq: 'weekly', priority: 1 },
          { loc: absoluteUrl('/posts'), changefreq: 'weekly', priority: 0.9 },
          { loc: absoluteUrl('/categories'), changefreq: 'weekly', priority: 0.8 },
          ...categories.map((category) => ({
            loc: absoluteUrl(`/categories/${category.slug}`),
            changefreq: 'weekly' as const,
            priority: 0.7,
          })),
          { loc: absoluteUrl('/about'), changefreq: 'yearly', priority: 0.5 },
          ...posts.map((post) => ({
            loc: absoluteUrl(`/posts/${post.slug}`),
            lastmod: post.updated ?? post.date,
            changefreq: 'monthly' as const,
            priority: 0.8,
          })),
        ]

        return new Response(buildSitemap(entries), {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
