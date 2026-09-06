import { Link, isNotFound, useLocation, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'
import { NotFound } from '~/components/NotFound'

export function ErrorFallback({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isAtRoot = useLocation({
    select: (location) => location.pathname === '/',
  })

  if (isNotFound(error)) {
    return <NotFound />
  }

  console.error('[CLOUD] route error:', error)

  return (
    <Container
      as="main"
      width="content"
      className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center"
    >
      <span className="surface-glass flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] text-aurora-rose">
        <Icon name="alert" className="h-5 w-5" />
      </span>
      <h1 className="mt-6 text-title text-ink-100">页面出错了</h1>
      <p className="mt-3 max-w-md text-ink-400">
        渲染这个页面时发生了未预期的错误。可以重试，或者回到其他页面。
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            router.invalidate()
          }}
          className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-aurora-violet/12 px-5 py-2.5 text-sm text-ink-100 ring-1 ring-aurora-violet/35 transition-all duration-[var(--dur-base)] ease-out-expo hover:bg-aurora-violet/20 hover:shadow-glow-violet"
        >
          重试
        </button>
        {isAtRoot ? (
          <Link
            to="/posts"
            className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-5 py-2.5 text-sm text-ink-400 ring-1 ring-void-700 transition-colors duration-[var(--dur-base)] ease-out-expo hover:text-ink-100"
          >
            浏览文章
          </Link>
        ) : (
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-5 py-2.5 text-sm text-ink-400 ring-1 ring-void-700 transition-colors duration-[var(--dur-base)] ease-out-expo hover:text-ink-100"
          >
            返回首页
          </Link>
        )}
      </div>
      <details className="mt-10 w-full max-w-lg text-left">
        <summary className="cursor-pointer font-mono text-xs text-ink-600 transition-colors hover:text-ink-400">
          错误详情
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-[var(--radius-card)] border border-void-700 bg-void-950 p-4 font-mono text-xs leading-relaxed text-ink-400">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </details>
    </Container>
  )
}
