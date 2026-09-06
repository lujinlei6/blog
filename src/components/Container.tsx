import type { ReactNode } from 'react'

import { cx } from '~/lib/cx'

const widths = {
  /** Article column. Matches --prose-width so reading measure is identical everywhere. */
  reading: 'max-w-[var(--prose-width)]',
  content: 'max-w-3xl',
  page: 'max-w-6xl',
} as const

type ContainerProps = {
  children: ReactNode
  width?: keyof typeof widths
  className?: string
  as?: 'div' | 'main' | 'section' | 'article' | 'header' | 'footer'
}

export function Container({
  children,
  width = 'page',
  className,
  as: Tag = 'div',
}: Readonly<ContainerProps>) {
  return (
    <Tag className={cx('mx-auto w-full px-5 sm:px-8', widths[width], className)}>{children}</Tag>
  )
}
