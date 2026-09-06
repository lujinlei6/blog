import { SITE, absoluteUrl } from '~/lib/site'
import { THEME_COLOR } from '~/lib/theme'

type SeoInput = {
  title: string
  description?: string
  /** Site-relative path, e.g. `/posts/hello-world`. Used for canonical + OG url. */
  path?: string
  image?: string
  type?: 'website' | 'article'
  jsonLd?: Record<string, unknown>
}

/** Drops entries whose content resolved to undefined so we never emit `content="undefined"`. */
function prune<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.filter((row) =>
    Object.entries(row).every(([key, value]) => key === 'title' || value != null),
  )
}

/**
 * Returns exactly the shape a route's `head()` option expects, so a route can
 * do `head: ({ loaderData }) => seo({ ... })` with no glue.
 */
export function seo({
  title,
  description,
  path = '/',
  image = '/og-default.svg',
  type = 'website',
  jsonLd,
}: Readonly<SeoInput>) {
  const fullTitle = title.includes(SITE.name) ? title : `${title} · ${SITE.name}`
  const url = absoluteUrl(path)
  const ogImage = absoluteUrl(image)
  const desc = description ?? SITE.description

  return {
    meta: prune([
      { title: fullTitle },
      { name: 'description', content: desc },
      /* One static tag, not a dark/light pair scoped by `media`: React 19
         dedupes <meta> on name and `media` is not part of the key, so the pair
         collapses to whichever renders last. The inline theme script rewrites
         `content` before first paint, which also tracks a manual override that
         a media query never could. This value is the no-JS fallback and matches
         --color-void-900 in :root. */
      { name: 'theme-color', content: THEME_COLOR.dark },
      { property: 'og:site_name', content: SITE.name },
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: desc },
      { property: 'og:type', content: type },
      { property: 'og:url', content: url },
      { property: 'og:image', content: ogImage },
      { property: 'og:locale', content: SITE.locale },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle },
      { name: 'twitter:description', content: desc },
      { name: 'twitter:image', content: ogImage },
    ]),
    links: [{ rel: 'canonical', href: url }],
    scripts: jsonLd
      ? [
          {
            type: 'application/ld+json',
            children: JSON.stringify(jsonLd),
          },
        ]
      : [],
  }
}
