import { useEffect, useRef, useState } from 'react'

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

/**
 * Left-edge drawer variant for the desktop. The panel sits off-screen
 * (translate-x-full) and slides in only when the pointer hovers the left edge
 * of the viewport, so the reading column never has to fight it for space. On
 * touch devices there is no hover, so this renders nothing — the mobile
 * `<details>` disclosure is the fallback.
 */
export function TableOfContentsDrawer({ headings }: Readonly<{ headings: Heading[] }>) {
  const [open, setOpen] = useState(false)
  // The slim always-visible trigger band at the very left edge.
  const triggerRef = useRef<HTMLDivElement>(null)
  // The slide-in panel (covers the trigger band once open).
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // No fine pointer -> no hover -> the drawer is unusable; let the caller's
    // mobile disclosure handle it instead.
    if (!window.matchMedia('(pointer: fine)').matches) return

    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const enter = () => {
      if (timer) clearTimeout(timer)
      setOpen(true)
    }
    const leave = () => {
      if (timer) clearTimeout(timer)
      // Brief grace period so crossing the small gap between the trigger band
      // and the panel doesn't snap the drawer shut.
      timer = setTimeout(() => setOpen(false), 260)
    }

    trigger.addEventListener('pointerenter', enter)
    trigger.addEventListener('pointerleave', leave)
    panel.addEventListener('pointerenter', enter)
    panel.addEventListener('pointerleave', leave)
    return () => {
      trigger.removeEventListener('pointerenter', enter)
      trigger.removeEventListener('pointerleave', leave)
      panel.removeEventListener('pointerenter', enter)
      panel.removeEventListener('pointerleave', leave)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (headings.length === 0) return null

  return (
    <>
      {/* Always-visible catch strip at the far left. */}
      <div
        ref={triggerRef}
        aria-hidden
        className="fixed inset-y-0 left-0 z-[60] hidden w-6 lg:block"
      />
      {/* The slide-in panel. */}
      <div
        ref={panelRef}
        aria-hidden={!open}
        className={cx(
          'fixed inset-y-0 left-0 z-[60] hidden w-80 transition-transform duration-500 ease-out-expo lg:block',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-full w-full overflow-y-auto rounded-r-card border border-l-0 border-void-700 bg-void-900/95 py-6 pl-5 pr-4 shadow-card backdrop-blur-md">
          <TableOfContents headings={headings} />
        </div>
      </div>
    </>
  )
}
