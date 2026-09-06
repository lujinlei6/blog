import { cx } from '~/lib/cx'

type ProseProps = {
  html: string
  className?: string
}

/**
 * The HTML arrives pre-rendered from `build/markdown.ts` at build time, which
 * runs remark-rehype without `allowDangerousHtml` and without rehype-raw — so
 * raw HTML in a source file is dropped rather than passed through. Every
 * string that reaches this prop originated from a Markdown file committed to
 * this repository.
 */
export function Prose({ html, className }: Readonly<ProseProps>) {
  return <div className={cx('prose', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
