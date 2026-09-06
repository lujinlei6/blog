/**
 * Hand-rolled instead of `Intl.DateTimeFormat('zh-CN', ...)`: the output must
 * be byte-identical between the Node server and every browser, otherwise SSR
 * markup and the hydration render disagree. ICU data differs across
 * environments; arithmetic on UTC fields does not.
 *
 * UTC getters are deliberate — frontmatter dates are date-only, so they parse
 * as UTC midnight, and local-time getters would shift them a day backwards in
 * any negative-offset timezone.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}
