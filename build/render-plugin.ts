import { readFile } from 'node:fs/promises'

import type { Plugin } from 'vite'

import { markdownBody, renderMarkdown } from './markdown.ts'

const QUERY = '?rendered'

/**
 * Exposes each Markdown document's rendered HTML as a module default, computed
 * in this (Node) process at dev/build time. `content.server.ts` globs the same
 * paths with `query: '?rendered'`, so the worker bundle receives plain strings
 * and never loads Shiki — see build/markdown.ts for why that matters.
 */
export function renderedMarkdown(): Plugin {
  return {
    name: 'void-rendered-markdown',
    async load(id) {
      if (!id.endsWith(QUERY)) return null
      const file = id.slice(0, -QUERY.length)
      const raw = await readFile(file, 'utf8')
      const html = await renderMarkdown(markdownBody(raw, file))
      return `export default ${JSON.stringify(html)}`
    },
  }
}
