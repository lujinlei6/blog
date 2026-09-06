import { createFileRoute } from '@tanstack/react-router'

import { getFeedPosts } from '~/lib/content.server'
import { SITE, absoluteUrl } from '~/lib/site'
import { buildRss } from '~/lib/xml'

/**
 * Non-UI server route. The `[.]` in the filename escapes the dot so the router
 * reads this as the literal path `/feed.xml` instead of a nested `feed/xml`
 * segment.
 */
export const Route = createFileRoute('/feed.xml')({
  server: {
    handlers: {
      GET: async () => {
        const posts = await getFeedPosts(20)

        const xml = buildRss({
          title: `${SITE.name} · ${SITE.nameZh}`,
          description: SITE.description,
          siteUrl: absoluteUrl('/'),
          feedUrl: absoluteUrl('/feed.xml'),
          language: SITE.locale,
          items: posts.map((post) => ({
            title: post.title,
            description: post.description,
            url: absoluteUrl(`/posts/${post.slug}`),
            date: post.date,
            updated: post.updated,
            tags: post.tags,
            contentHtml: post.contentHtml,
          })),
        })

        return new Response(xml, {
          headers: {
            'content-type': 'application/rss+xml; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
