/**
 * Shared across the server-only pipeline and the isomorphic route/component
 * layer, so this module deliberately has no `.server` suffix.
 */
export type Post = {
  slug: string
  title: string
  description: string
  /**
   * ISO 8601 string rather than a `Date`. Server-function payloads are
   * serialized, and a string round-trips without depending on the serializer
   * reviving dates. Components format it via `formatDate`.
   */
  date: string
  updated?: string
  tags: string[]
  cover?: string
  featured: boolean
  readingMinutes: number
}

export type PostWithContent = Post & {
  contentHtml: string
}

export type AboutPage = {
  title: string
  description: string
  contentHtml: string
}
