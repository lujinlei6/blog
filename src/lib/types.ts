/**
 * Shared across the server-only pipeline and the isomorphic route/component
 * layer, so this module deliberately has no `.server` suffix.
 */
import type { Category } from '~/lib/categories'

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
  /** Slug into src/lib/categories.ts; optional so legacy posts keep working. */
  category?: string
  tags: string[]
  cover?: string
  featured: boolean
  readingMinutes: number
}

/** A registry category plus how many published posts carry it. */
export type CategorySummary = Category & { count: number }

export type PostWithContent = Post & {
  contentHtml: string
}

export type AboutPage = {
  title: string
  description: string
  contentHtml: string
}
