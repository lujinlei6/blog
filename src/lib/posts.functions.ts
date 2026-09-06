/**
 * This module must not carry a `.server` suffix. Routes are isomorphic — they
 * land in both the client and server bundles — and Start's import protection
 * refuses to let client code import a `.server` file. `createServerFn` is the
 * boundary: the compiler lifts each handler into a server-only chunk and leaves
 * an RPC stub behind, so the `.server` import below is stripped from the client
 * variant.
 *
 * Handlers must be written inline. A bare reference to an imported function
 * cannot be extracted by the compiler.
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getAbout, getFeaturedPosts, getPost, listPosts } from '~/lib/content.server'

export const fetchPosts = createServerFn({ method: 'GET' }).handler(async () => {
  return listPosts()
})

export const fetchFeaturedPosts = createServerFn({ method: 'GET' })
  .validator(z.object({ limit: z.number().int().min(1).max(12) }))
  .handler(async ({ data }) => {
    return getFeaturedPosts(data.limit)
  })

export const fetchPost = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    return getPost(data.slug)
  })

export const fetchAbout = createServerFn({ method: 'GET' }).handler(async () => {
  return getAbout()
})
