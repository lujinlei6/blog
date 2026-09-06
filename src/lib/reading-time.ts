/** CJK ideographs plus Japanese kana and Korean hangul. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g

/**
 * Mixed-script reading speed: Chinese reads at roughly 300 characters per
 * minute, Latin at roughly 200 words per minute. Counting both and adding the
 * two estimates handles articles that interleave prose with English terms.
 *
 * Fenced code blocks are excluded — skimming a listing is not reading prose.
 */
export function readingMinutes(markdown: string): number {
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ')
  const cjkChars = (prose.match(CJK) ?? []).length
  const latinWords = (prose.replace(CJK, ' ').match(/[\p{L}\p{N}'_-]+/gu) ?? []).length

  return Math.max(1, Math.ceil(cjkChars / 300 + latinWords / 200))
}
