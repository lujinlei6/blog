import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import catppuccinLatte from '@shikijs/themes/catppuccin-latte'
import tokyoNight from '@shikijs/themes/tokyo-night'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { createHighlighter, type ThemeRegistration } from 'shiki/bundle/web'
import { unified } from 'unified'

/**
 * Build-time only. This module runs in the Vite (Node) process via
 * `build/render-plugin.ts` and never enters the worker bundle: workerd forbids
 * compiling WASM at runtime (`WebAssembly.instantiate(): Wasm code generation
 * disallowed by embedder`), which is exactly what Shiki's oniguruma engine
 * does, and grammar compilation would blow the free plan's 10 ms CPU budget
 * per invocation even on a WASM-free engine.
 *
 * The web bundle rather than the full `shiki` entry: the full bundle statically
 * imports every grammar (~400 languages) and slows the build for no benefit.
 * Rust/Go are not in the web bundle; unknown fences fall back to plain text
 * via `fallbackLanguage` instead of throwing.
 */
const LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'bash',
  'css',
  'html',
  'markdown',
  'python',
  'yaml',
] as const

/* Each source theme's own editor.background. prose.css force-overrides the
   rendered surface to --color-void-950 (#06060a dark / #fbfcfe light), which is
   darker than tokyo-night's and lighter than latte's — so measuring here is the
   stricter test in both directions and every lifted token keeps a margin on the
   surface it actually lands on. Re-pointing these at the rendered values would
   still pass AA but would visibly dim the dark tokens; don't. */
const CODE_BG_DARK = '#1a1b26'
const CODE_BG_LIGHT = '#eff1f5'
const AA = 4.5

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

function liftToContrast(fg: string, bg: string, target: number, toward: 'white' | 'black'): string {
  const n = Number.parseInt(fg.slice(1), 16)
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const extreme = toward === 'white' ? 255 : 0
  for (let mix = 0; mix <= 1; mix += 0.05) {
    const hex = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
    if (contrast(hex, bg) >= target) return hex
    r = Math.round(r + (extreme - r) * 0.05)
    g = Math.round(g + (extreme - g) * 0.05)
    b = Math.round(b + (extreme - b) * 0.05)
  }
  return toward === 'white' ? '#ffffff' : '#000000'
}

type MutableRule = { settings?: { foreground?: string } }

/**
 * Both source themes ship tokens well under AA on their own backgrounds —
 * tokyo-night's comments and flow keywords sit at ~2.5:1. Code is content too,
 * so every token foreground is lifted to AA before use.
 *
 * The direction is the theme's polarity: a dark background needs its tokens
 * mixed toward white, a light one toward black. The JSON round-trip yields a
 * mutable copy — the imported registrations are frozen and typed readonly.
 */
function liftedTheme(
  source: ThemeRegistration,
  name: string,
  bg: string,
  toward: 'white' | 'black',
): ThemeRegistration {
  const theme: ThemeRegistration = JSON.parse(JSON.stringify(source))
  theme.name = name

  for (const rule of (theme.tokenColors ?? []) as MutableRule[]) {
    const settings = rule.settings
    const fg = settings?.foreground
    if (settings && typeof fg === 'string' && fg.startsWith('#') && fg.length === 7) {
      settings.foreground = liftToContrast(fg, bg, AA, toward)
    }
  }

  return theme
}

const THEME_DARK_NAME = 'void-night'
const THEME_LIGHT_NAME = 'void-day'
const THEME_DARK = liftedTheme(tokyoNight, THEME_DARK_NAME, CODE_BG_DARK, 'white')
const THEME_LIGHT = liftedTheme(catppuccinLatte, THEME_LIGHT_NAME, CODE_BG_LIGHT, 'black')

type WebHighlighter = Awaited<ReturnType<typeof createHighlighter>>

/**
 * Module-level lazy singleton. Loading grammars and themes is expensive, and
 * doing it per document would dominate build time.
 */
let highlighterPromise: Promise<WebHighlighter> | null = null

function getHighlighter(): Promise<WebHighlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [THEME_DARK, THEME_LIGHT],
    langs: [...LANGS],
  })
  return highlighterPromise
}

/* Same fence as `splitFrontmatter` in src/lib/content.server.ts. The runtime
   half parses the YAML frontmatter; this half only needs the body after it.
   Duplicated rather than shared because the two live in different tsc
   projects (build/ is config-side, src/ is app-side). */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function markdownBody(raw: string, file: string): string {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) {
    throw new Error(`${file}: 缺少 frontmatter（文件必须以 --- 开头）`)
  }
  return raw.slice(match[0].length)
}

export async function renderMarkdown(source: string): Promise<string> {
  const highlighter = await getHighlighter()

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    // No rehype-raw and no allowDangerousHtml: raw HTML in markdown is dropped
    // rather than passed through. Content is repo-authored today, so this costs
    // nothing, and it keeps the boundary safe if an external source is ever
    // wired in.
    .use(remarkRehype)
    .use(rehypeShikiFromHighlighter, highlighter, {
      themes: { dark: THEME_DARK_NAME, light: THEME_LIGHT_NAME },
      /* `false` rather than naming a default: Shiki then writes only
         --shiki-dark / --shiki-light on each span and no inline `color`, so
         prose.css picks between them from data-theme. One payload serves both
         modes and toggling never triggers a re-render. */
      defaultColor: false,
      defaultLanguage: 'text',
      fallbackLanguage: 'text',
      onError: (error) => {
        console.warn('[VOID] syntax highlighting failed:', error)
      },
    })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: 'wrap',
      properties: { className: ['anchor'] },
    })
    .use(rehypeStringify)
    .process(source)

  return String(file)
}
