import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'
import { SITE } from '~/lib/site'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-24 border-t border-void-700/60">
      <Container className="py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <p className="font-mono text-sm tracking-[0.18em] text-ink-100">
              {SITE.name}
              <span className="ml-2 text-ink-600">{SITE.nameZh}</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-400">{SITE.tagline}</p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs tracking-[0.14em] text-ink-600 uppercase">Elsewhere</p>
            <div className="flex gap-2">
              {SITE.author.social.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className="surface-glass flex h-9 w-9 items-center justify-center rounded-[var(--radius-card)] text-ink-400 transition-all duration-[var(--dur-base)] ease-out-expo hover:-translate-y-0.5 hover:text-aurora-cyan hover:shadow-glow-cyan"
                >
                  <Icon name={item.icon} className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-void-700/60 pt-6 text-xs text-ink-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.author.name} · 由 TanStack Start 驱动
          </p>
          <a
            href="/feed.xml"
            className="inline-flex items-center gap-1.5 transition-colors duration-[var(--dur-fast)] hover:text-ink-400"
          >
            <Icon name="rss" className="h-3.5 w-3.5" />
            RSS 订阅
          </a>
        </div>
      </Container>
    </footer>
  )
}
