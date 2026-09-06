import { Link } from '@tanstack/react-router'

import { Icon } from '~/components/Icon'
import { getCategory } from '~/lib/categories'
import type { Post } from '~/lib/types'

type RelatedPostsProps = {
  posts: Post[]
}

/**
 * Article-footer recommendations. Same-category and tag-overlap posts are
 * ranked server-side (see `getRelatedPosts`); this just renders the shortlist.
 */
export function RelatedPosts({ posts }: Readonly<RelatedPostsProps>) {
  if (posts.length === 0) return null

  return (
    <section aria-label="相关文章" className="mt-16 border-t border-void-700 pt-10">
      <p className="font-mono text-xs tracking-[0.2em] text-ink-600 uppercase">继续阅读</p>
      <ul className="mt-4 divide-y divide-void-800">
        {posts.map((post) => {
          const category = post.category !== undefined ? getCategory(post.category) : undefined
          return (
            <li key={post.slug}>
              <Link
                to="/posts/$slug"
                params={{ slug: post.slug }}
                className="group flex items-baseline justify-between gap-5 py-4"
              >
                <span className="flex min-w-0 items-baseline gap-4">
                  {category ? (
                    <span className="shrink-0 rounded-pill border border-aurora-cyan/40 bg-aurora-cyan/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-aurora-cyan uppercase">
                      {category.name}
                    </span>
                  ) : null}
                  <span className="truncate text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo group-hover:text-aurora-cyan">
                    {post.title}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs text-ink-600 tabular-nums">
                    {post.readingMinutes} min
                  </span>
                  <Icon
                    name="arrowUpRight"
                    className="h-3.5 w-3.5 text-ink-600 transition-[color,transform] duration-[var(--dur-base)] ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-aurora-cyan"
                  />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
