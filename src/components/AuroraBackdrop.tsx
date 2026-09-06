/**
 * Fixed decorative background. Pure CSS — no JS, no canvas, no animation loop.
 * Three layers: aurora pools, a faded grid, and a film-grain noise overlay that
 * stops the large flat dark areas from banding on gradient-heavy displays.
 *
 * Every colour is an app.css variable so light mode can re-tune the layer
 * wholesale. A glow mixed for a near-black surface reads as a dirty smear on a
 * white one, and grain that breaks up banding in the dark just looks like dirt
 * in the light — so the light values drop to a faint mist and turn the noise
 * off entirely.
 */
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")"

/* Black here is a mask, not a colour: it marks the fully visible region of the
   grid. Masks are luminance/alpha-driven and must not follow the theme. */
const GRID_MASK = 'radial-gradient(ellipse 85% 55% at 50% 0%, #000 35%, transparent 100%)'

export function AuroraBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void-900"
    >
      <div
        className="absolute -top-[22rem] left-1/2 h-[38rem] w-[76rem] -translate-x-1/2 blur-[130px]"
        style={{
          background:
            'radial-gradient(ellipse at 30% 50%, var(--aurora-pool-cyan), transparent 60%), radial-gradient(ellipse at 70% 50%, var(--aurora-pool-violet), transparent 60%)',
        }}
      />
      <div
        className="absolute top-[45rem] -right-[18rem] h-[34rem] w-[34rem] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, var(--aurora-pool-rose), transparent 65%)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: GRID_MASK,
          WebkitMaskImage: GRID_MASK,
        }}
      />
      {/* Faint clouds. The mask tiles a single soft-edged cloud across the
          viewport; the fill colour is `--cloud-fill`, so it stays a whisper in
          both themes. Opacity is low enough that tiling over content never
          hurts readability. */}
      <div className="cloud-pattern absolute inset-0" />
      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{ backgroundImage: NOISE, opacity: 'var(--noise-opacity)' }}
      />
    </div>
  )
}
