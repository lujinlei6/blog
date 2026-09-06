import { useEffect, useState } from 'react'

import { cx } from '~/lib/cx'
import type { Heading } from '~/lib/types'

type TableOfContentsProps = {
  headings: Heading[]
  /** Hide the internal "目录" eyebrow when a caller provides its own label. */
  showEyebrow?: boolean
}

/**
 * Sidebar outline for the article. The list is rendered from server-provided
 * headings (see `extractHeadings`), so it is present in SSR HTML and usable
 * with JS off — each link is a plain `#id` anchor. The only client behaviour is
 * tracking the heading currently in view to highlight the active entry.
 */
export function TableOfContents({ headings, showEyebrow = true }: Readonly<TableOfContentsProps>) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      // A band just below the sticky header: a heading enters "active" the
      // moment it scrolls past that line, before the next one pushes it out.
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    )

    const nodes = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((node): node is HTMLElement => node !== null)

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav aria-label="文章目录" className="text-sm">
      {showEyebrow ? (
        <p className="font-mono text-xs tracking-[0.2em] text-ink-600 uppercase">目录</p>
      ) : null}
      <ul className={cx('space-y-1 border-l border-void-700', showEyebrow && 'mt-3')}>
        {headings.map((heading) => {
          const active = heading.id === activeId
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={cx(
                  '-ml-px block border-l-2 py-1 pl-4 leading-snug transition-colors duration-[var(--dur-fast)] ease-out-expo',
                  heading.level === 3 ? 'pl-7 text-[0.8125rem]' : 'text-[0.875rem]',
                  active
                    ? 'border-aurora-cyan text-ink-100'
                    : 'border-transparent text-ink-400 hover:border-void-600 hover:text-ink-100',
                )}
              >
                {heading.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
