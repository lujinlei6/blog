import { createFileRoute } from '@tanstack/react-router'

/**
 * A server route rather than a static `public/robots.txt`: the Sitemap
 * directive requires an absolute URL, and a checked-in file would have to
 * hardcode one origin. Deriving it from the request means the same build is
 * correct on localhost, a preview deployment, and production.
 */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin

        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
