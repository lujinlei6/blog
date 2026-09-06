/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AuroraBackdrop } from '~/components/AuroraBackdrop'
import { ErrorFallback } from '~/components/ErrorFallback'
import { NotFound } from '~/components/NotFound'
import { SiteFooter } from '~/components/SiteFooter'
import { SiteHeader } from '~/components/SiteHeader'
import { seo } from '~/lib/seo'
import { SITE } from '~/lib/site'
import { INLINE_THEME_SCRIPT } from '~/lib/theme'

import appCss from '~/styles/app.css?url'
import proseCss from '~/styles/prose.css?url'

export const Route = createRootRoute({
  head: () => {
    // Fallback document metadata for URLs that match no route, so the 404 page
    // still gets a title and description. A matched route's head() overrides
    // these: React dedupes <title> and <meta> by name/property, but it does NOT
    // dedupe <link rel="canonical"> or ld+json <script>, and head from root and
    // child is concatenated. Those two must therefore come from the route alone.
    const fallback = seo({
      title: `${SITE.name} · ${SITE.tagline}`,
      description: SITE.description,
      path: '/',
    })

    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        ...fallback.meta,
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'stylesheet', href: proseCss },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: `${SITE.name} RSS`,
          href: '/feed.xml',
        },
      ],
    }
  },
  errorComponent: ErrorFallback,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The inline script below writes `.js`, `data-theme` and `data-theme-pref`
    // straight to the DOM, so these attributes can never match the client
    // render. suppressHydrationWarning is scoped to this element's own
    // attributes — it does not leak to children.
    <html lang={SITE.locale} suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Runs before first paint: resolves the theme so light mode never
            flashes dark, and adds `.js` so `.js .reveal` can start hidden.
            With JS off neither attribute is set, nothing is hidden, and the
            site stays in the dark defaults from :root. */}
        <script dangerouslySetInnerHTML={{ __html: INLINE_THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <AuroraBackdrop />
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
        <Scripts />
      </body>
    </html>
  )
}
