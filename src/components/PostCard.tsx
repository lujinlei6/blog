import { Link } from '@tanstack/react-router'

import { Icon } from '~/components/Icon'
import { PostMeta } from '~/components/PostMeta'
import { cx } from '~/lib/cx'
import type { Post } from '~/lib/types'

type PostCardProps = {
  post: Post
  size?: 'large' | 'small'
  className?: string
}

const cardClass =
  'group relative flex h-full flex-col overflow-hidden rounded-card border border-void-700 bg-void-850/60 shadow-card ' +
  'transition-[transform,border-color,background-color,box-shadow] duration-[var(--dur-base)] ease-out-expo ' +
  'hover:-translate-y-0.5 hover:border-void-600 hover:bg-void-800/70 hover:shadow-glow-violet'

export function PostCard({ post, size = 'small', className }: Readonly<PostCardProps>) {
  const large = size === 'large'

  return (
    <Link
      to="/posts/$slug"
      params={{ slug: post.slug }}
      className={cx(cardClass, large ? 'justify-center p-8 sm:p-12' : 'p-6', className)}
    >
      {/* Accent hairline that wipes in from the left on hover. */}
      <span
        aria-hidden
        className="rule-aurora absolute inset-x-0 top-0 origin-left scale-x-0 transition-transform duration-[var(--dur-base)] ease-out-expo group-hover:scale-x-100"
      />

      {/* The 2x2 cell stretches past its content; the glow gives the leftover
          space depth instead of leaving a flat void. Clipped by overflow-hidden. */}
      {large ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-aurora-violet/12 blur-3xl"
        />
      ) : null}

      {post.featured ? (
        <span className="w-fit rounded-pill border border-aurora-violet/40 bg-aurora-violet/10 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.18em] text-aurora-violet uppercase">
          精选
        </span>
      ) : null}

      <h3
        className={cx(
          'font-semibold text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo group-hover:text-ink-50',
          large ? 'mt-6 text-3xl leading-[1.3] sm:text-[2.5rem]' : 'mt-3 text-lg leading-snug',
        )}
      >
        {post.title}
      </h3>

      <p
        className={cx(
          'text-ink-400',
          large
            ? 'mt-5 max-w-[34rem] text-lead leading-relaxed'
            : 'mt-3 line-clamp-3 text-sm leading-relaxed',
        )}
      >
        {post.description}
      </p>

      <div className={cx('flex items-end justify-between gap-4', large ? 'mt-10' : 'mt-auto pt-6')}>
        <PostMeta post={post} showTags={large} className="shrink-0" />
        <Icon
          name="arrowUpRight"
          className="h-4 w-4 shrink-0 text-ink-600 transition-[color,transform] duration-[var(--dur-base)] ease-out-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-aurora-cyan"
        />
      </div>
    </Link>
  )
}
