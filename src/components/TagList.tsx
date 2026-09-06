import { cx } from '~/lib/cx'

type TagListProps = {
  tags: readonly string[]
  className?: string
}

/**
 * Display-only. There is no `/tags/$tag` route on this site, so these are
 * deliberately not links — a badge that looks clickable but goes nowhere is
 * worse than one that plainly does not.
 */
export function TagList({ tags, className }: Readonly<TagListProps>) {
  if (tags.length === 0) return null

  return (
    <ul className={cx('flex flex-wrap items-center gap-1.5', className)}>
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-pill border border-void-700 bg-void-850 px-2.5 py-0.5 font-mono text-[11px] leading-5 tracking-wide text-ink-400"
        >
          {tag}
        </li>
      ))}
    </ul>
  )
}
