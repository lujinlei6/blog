/**
 * The five XML predefined entities. `&` must be replaced first or the escapes
 * it introduces get escaped again.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RFC 822 / 1123, the only date format RSS 2.0 accepts. */
function rfc822(iso: string): string {
  return new Date(iso).toUTCString()
}

/** W3C datetime for sitemaps; a date-only value is valid and timezone-safe. */
function w3cDate(iso: string): string {
  return iso.slice(0, 10)
}

export type FeedItem = {
  title: string
  description: string
  url: string
  date: string
  updated?: string
  tags: string[]
  contentHtml: string
}

export type FeedOptions = {
  title: string
  description: string
  siteUrl: string
  feedUrl: string
  language: string
  items: FeedItem[]
}

/**
 * RSS 2.0 with an Atom self link, which is what feed readers use to
 * self-identify the canonical feed URL after a redirect or a copy.
 *
 * Body HTML goes through `escapeXml` rather than a CDATA section. The RSS 2.0
 * spec requires escaped HTML in element content, and escaping has no edge
 * cases — CDATA breaks if an article ever contains the literal `]]>`, which is
 * entirely plausible in a post about XML.
 */
export function buildRss({
  title,
  description,
  siteUrl,
  feedUrl,
  language,
  items,
}: Readonly<FeedOptions>): string {
  const lastBuildDate = items[0]
    ? rfc822(items[0].updated ?? items[0].date)
    : new Date().toUTCString()

  const entries = items.map((item) => {
    const categories = item.tags
      .map((tag) => `      <category>${escapeXml(tag)}</category>`)
      .join('\n')

    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <pubDate>${rfc822(item.date)}</pubDate>
      <description>${escapeXml(item.description)}</description>
      <content:encoded>${escapeXml(item.contentHtml)}</content:encoded>
${categories}
    </item>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>${escapeXml(language)}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
${entries.join('\n')}
  </channel>
</rss>
`
}

export type SitemapEntry = {
  loc: string
  lastmod?: string
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority?: number
}

export function buildSitemap(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const parts = [`      <loc>${escapeXml(entry.loc)}</loc>`]
    if (entry.lastmod) parts.push(`      <lastmod>${w3cDate(entry.lastmod)}</lastmod>`)
    if (entry.changefreq) parts.push(`      <changefreq>${entry.changefreq}</changefreq>`)
    if (entry.priority != null) parts.push(`      <priority>${entry.priority}</priority>`)
    return `    <url>\n${parts.join('\n')}\n    </url>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}
