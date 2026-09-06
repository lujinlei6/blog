const envUrl = import.meta.env.VITE_SITE_URL

/** Absolute origin, no trailing slash. Every canonical/OG/sitemap URL derives from this. */
export const SITE_URL =
  typeof envUrl === 'string' && envUrl.length > 0
    ? envUrl.replace(/\/+$/, '')
    : 'http://localhost:3000'

export const SITE = {
  name: 'VOID',
  nameZh: '虚空',
  tagline: '在噪声里留一块空白',
  description:
    'VOID 是一个关于前端工程、界面设计与技术决策的中文博客。不追热点，只写经得起时间的内容。',
  url: SITE_URL,
  locale: 'zh-CN',
  author: {
    // EDIT ME: 站点常量集中在此文件，改掉下面这几项即可全站生效
    name: 'Mt342',
    role: '前端工程师',
    bio: '写界面，也写关于界面的思考。相信好的工程是把复杂度放回它该待的地方。',
    social: [
      { label: 'GitHub', icon: 'github', href: 'https://github.com/' },
      { label: '邮件', icon: 'mail', href: 'mailto:hello@example.com' },
      { label: 'RSS', icon: 'rss', href: '/feed.xml' },
    ],
  },
} as const

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
