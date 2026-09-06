import { Icon } from '~/components/Icon'
import { TagList } from '~/components/TagList'
import { cx } from '~/lib/cx'
import { formatDate } from '~/lib/format'
import type { Post } from '~/lib/types'

type PostMetaProps = {
  post: Post
  showTags?: boolean
  className?: string
}

export function PostMeta({ post, showTags = true, className }: Readonly<PostMetaProps>) {
  return (
    <div
      className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-400', className)}
    >
      <span className="flex items-center gap-1.5">
        <Icon name="calendar" className="h-3.5 w-3.5 shrink-0" />
        <time dateTime={post.date}>{formatDate(post.date)}</time>
      </span>
      <span className="flex items-center gap-1.5">
        <Icon name="clock" className="h-3.5 w-3.5 shrink-0" />约 {post.readingMinutes} 分钟
      </span>
      {showTags ? <TagList tags={post.tags} /> : null}
    </div>
  )
}
