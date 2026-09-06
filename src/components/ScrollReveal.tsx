import { useEffect, useRef, type ReactNode } from 'react'

import { cx } from '~/lib/cx'

type ScrollRevealProps = {
  children: ReactNode
  /** Stagger offset in milliseconds, applied as a transition delay. */
  delay?: number
  className?: string
}

/**
 * The only client-interactive component on the site. One IntersectionObserver,
 * one-way: it observes, reveals, and disconnects — no scroll listeners.
 *
 * Always renders a plain `div`. Callers that need different semantics (`li`,
 * `article`) put this inside that element rather than making this polymorphic,
 * which keeps the ref type honest.
 *
 * No-JS behaviour lives in app.css: the hidden state is gated behind `.js` on
 * `<html>`, so without JS the element is simply never hidden.
 */
export function ScrollReveal({ children, delay = 0, className }: Readonly<ScrollRevealProps>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-revealed', '')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cx('reveal', className)}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
