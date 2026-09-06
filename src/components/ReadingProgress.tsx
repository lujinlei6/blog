import { useEffect, useRef } from 'react'

/**
 * A hairline progress bar pinned under the sticky header. It is client-only and
 * gated behind `.js` (added by the inline head script) so the SSR HTML carries
 * no bar and, with JS off, nothing inert is rendered. The read is throttled to
 * animation frames and skipped entirely under `prefers-reduced-motion`.
 */
export function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = ref.current
    if (!bar) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      // Static "done" look — no motion, but still signals the page has a
      // reading track rather than hiding the affordance altogether.
      bar.style.transform = 'scaleX(1)'
      return
    }

    let frame = 0
    const update = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0
      bar.style.transform = `scaleX(${progress})`
      frame = 0
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="pointer-events-none sticky top-16 z-40" aria-hidden>
      <div
        ref={ref}
        className="h-0.5 w-full origin-left scale-x-0 bg-aurora"
        style={{ willChange: 'transform' }}
      />
    </div>
  )
}
