import { useEffect, useRef } from 'react'

/**
 * Mouse "reveal" effect, in the style of the MiMo Code hero. A canvas sits over
 * the hero's aurora/cloud backdrop and is filled with a semi-transparent "fog"
 * in the page-surface colour. As the pointer moves, stamps are placed along the
 * path and each frame the fog is repainted, then holes are cut with
 * `destination-out` — so the clouds sharpen where the pointer wipes, then dim
 * back as the stamps age out.
 *
 * Constraints this respects:
 * - SSR-safe: nothing renders on the server but an inert, transparent canvas.
 * - No pointer on touch devices -> the fog is never drawn, backdrop shows.
 * - `prefers-reduced-motion` -> the layer is disabled outright.
 * - rAF-driven, one canvas, stamps capped so a long drag can't allocate.
 */

const STAMP_LIFE = 520 // ms
const STAMP_START = 10 // px
const STAMP_MAX = 132 // px
const MAX_STAMPS = 90
// How opaque the resting fog is. Semi-transparent so the clouds stay faintly
// visible behind it (matching the site's "barely-there clouds"), and the wipe
// then just sharpens them instead of revealing from black.
const FOG_ALPHA = 0.7

type Stamp = {
  x: number
  y: number
  born: number
  radius: number
}

export function RevealCanvas({ className }: Readonly<{ className?: string }>) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    // Reduced motion: never paint the fog, so the backdrop is always visible.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // No fine pointer (touch): skip entirely, same outcome.
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (reduced || coarse) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // The fog colour rides the `color` property (set to --color-void-900 in JSX)
    // so `getComputedStyle(...).color` returns the *resolved* value — matching
    // the page surface in both themes, which is what makes the fog invisible.
    const fog = getComputedStyle(canvas).color
    // Rebind so the hoisted `paintFog` below sees a non-null value; TS narrows
    // the guard above but not across function-declaration boundaries.
    const c: CanvasRenderingContext2D = ctx

    const stamps: Stamp[] = []
    let width = 0
    let height = 0
    let frame = 0
    let last: { x: number; y: number } | null = null

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Function declaration (hoisted) so `resize` below can call it. Clears to
    // transparent, then lays the semi-transparent fog — clearing first is what
    // prevents the fog from accumulating to opaque over successive frames.
    function paintFog() {
      c.clearRect(0, 0, width, height)
      c.globalCompositeOperation = 'source-over'
      c.globalAlpha = FOG_ALPHA
      c.fillStyle = fog
      c.fillRect(0, 0, width, height)
      c.globalAlpha = 1
    }

    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Paint the fog so the layer never flashes transparent after a resize.
      paintFog()
    }

    const place = (x: number, y: number) => {
      // Space stamps along fast movements so the trail reads continuous.
      if (last) {
        const dx = x - last.x
        const dy = y - last.y
        const dist = Math.hypot(dx, dy)
        const steps = Math.max(1, Math.floor(dist / 24))
        for (let i = 1; i <= steps; i++) {
          addStamp(last.x + (dx * i) / steps, last.y + (dy * i) / steps)
        }
      } else {
        addStamp(x, y)
      }
      last = { x, y }
    }

    const addStamp = (x: number, y: number) => {
      stamps.push({ x, y, born: performance.now(), radius: STAMP_START })
      if (stamps.length > MAX_STAMPS) stamps.splice(0, stamps.length - MAX_STAMPS)
    }

    const draw = (now: number) => {
      // Repaint the fog, then cut holes for live stamps.
      paintFog()

      c.globalCompositeOperation = 'destination-out'
      for (let i = stamps.length - 1; i >= 0; i--) {
        const s = stamps[i]
        const t = (now - s.born) / STAMP_LIFE
        if (t >= 1) {
          stamps.splice(i, 1)
          continue
        }
        // Ease-out growth, opacity fades as it expands — the classic reveal puff.
        const eased = 1 - Math.pow(1 - t, 3)
        s.radius = STAMP_START + (STAMP_MAX - STAMP_START) * eased
        const alpha = 1 - t
        c.globalAlpha = alpha
        c.beginPath()
        // Slightly irregular: three overlapping lobes read softer than a circle.
        c.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
        c.arc(s.x - s.radius * 0.5, s.y - s.radius * 0.2, s.radius * 0.7, 0, Math.PI * 2)
        c.arc(s.x + s.radius * 0.5, s.y - s.radius * 0.2, s.radius * 0.7, 0, Math.PI * 2)
        c.fill()
      }
      c.globalAlpha = 1
      c.globalCompositeOperation = 'source-over'

      frame = stamps.length > 0 ? requestAnimationFrame(draw) : 0
    }

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      // Only stamp when the pointer is within the hero bounds. The canvas is
      // pointer-events-none so content above stays clickable; we listen on the
      // window and clip to the rect instead.
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        last = null
        return
      }
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      place(x, y)
      if (!frame) frame = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', resize)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{ color: 'var(--color-void-900)' }}
    />
  )
}
