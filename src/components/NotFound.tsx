import { Link } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'

export function NotFound() {
  return (
    <Container
      as="main"
      width="content"
      className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center"
    >
      <p className="text-aurora font-mono text-6xl font-semibold tracking-tight">404</p>
      <h1 className="mt-6 text-title text-ink-100">这个页面不存在</h1>
      <p className="mt-3 max-w-md text-ink-400">链接可能已经失效，或者内容被移动到了别处。</p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/posts"
          className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-aurora-violet/12 px-5 py-2.5 text-sm text-ink-100 ring-1 ring-aurora-violet/35 transition-all duration-[var(--dur-base)] ease-out-expo hover:bg-aurora-violet/20 hover:shadow-glow-violet"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          浏览全部文章
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-5 py-2.5 text-sm text-ink-400 ring-1 ring-void-700 transition-colors duration-[var(--dur-base)] ease-out-expo hover:text-ink-100 hover:ring-void-600"
        >
          返回首页
        </Link>
      </div>
    </Container>
  )
}
