import { Link } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { ThemeToggle } from '~/components/ThemeToggle'
import { SITE } from '~/lib/site'

const linkClass =
  'text-sm text-ink-400 transition-colors duration-[var(--dur-fast)] ease-out-expo hover:text-ink-100'
const linkActiveClass = 'text-ink-100'

/**
 * Nav is four items. To keep the 320px fit without a hamburger menu, the `/`
 * separators hide below `sm` and the nav gap tightens to `gap-1` there —
 * the two tweaks together reclaim roughly the width of the extra item.
 * The toggle is the header's only client-interactive part and is sized `h-8`
 * rather than the footer's `h-9` to keep that fit.
 */
export function SiteHeader() {
  return (
    <header className="surface-glass sticky top-0 z-50 border-x-0 border-t-0">
      <Container as="div" className="flex h-16 items-center justify-between gap-4">
        <Link to="/" className="group flex items-center gap-2.5" aria-label={`${SITE.name} 首页`}>
          <svg
            viewBox="0 0 64 64"
            className="h-7 w-7 shrink-0 transition-transform duration-[var(--dur-slow)] ease-spring group-hover:-translate-y-0.5"
            aria-hidden
          >
            <defs>
              <linearGradient id="hdr-aurora" x1="0" y1="0" x2="1" y2="1">
                {/* Inline style, not the stopColor attribute: var() in a
                    presentation attribute is not reliably supported. */}
                <stop offset="0" style={{ stopColor: 'var(--color-aurora-cyan)' }} />
                <stop offset="0.55" style={{ stopColor: 'var(--color-aurora-violet)' }} />
                <stop offset="1" style={{ stopColor: 'var(--color-aurora-rose)' }} />
              </linearGradient>
            </defs>
            {/* A cloud built from three overlapping circles and a flat base, all
                sharing one gradient fill so the lobes read as one silhouette. */}
            <g fill="url(#hdr-aurora)">
              <circle cx="22" cy="40" r="11" />
              <circle cx="36" cy="34" r="15" />
              <circle cx="48" cy="42" r="10" />
              <rect x="20" y="38" width="30" height="13" rx="6" />
            </g>
          </svg>
          <span className="font-mono text-base font-semibold tracking-[0.18em] text-ink-100">
            {SITE.name}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{ className: linkActiveClass }}
              className={linkClass}
            >
              首页
            </Link>
            <span aria-hidden className="hidden text-void-600 sm:inline">
              /
            </span>
            <Link
              to="/categories"
              activeProps={{ className: linkActiveClass }}
              className={linkClass}
            >
              分类
            </Link>
            <span aria-hidden className="hidden text-void-600 sm:inline">
              /
            </span>
            <Link to="/posts" activeProps={{ className: linkActiveClass }} className={linkClass}>
              文章
            </Link>
            <span aria-hidden className="hidden text-void-600 sm:inline">
              /
            </span>
            <Link to="/about" activeProps={{ className: linkActiveClass }} className={linkClass}>
              关于
            </Link>
          </nav>

          <ThemeToggle />
        </div>
      </Container>
    </header>
  )
}
