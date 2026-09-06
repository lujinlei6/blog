const envUrl = import.meta.env.VITE_SITE_URL

/** Absolute origin, no trailing slash. Every canonical/OG/sitemap URL derives from this. */
export const SITE_URL =
  typeof envUrl === 'string' && envUrl.length > 0
    ? envUrl.replace(/\/+$/, '')
    : 'http://localhost:3000'

export const SITE = {
  name: 'CLOUD',
  nameZh: '云栈',
  tagline: '把踩过的坑，铺成上云的路',
  description:
    'CLOUD 是一名运维工程师的云端自留地：Docker、Kubernetes、Nginx、Zabbix……每一次深夜排障、每一回上线救火，都沉淀成这里可以直接复用的实战经验。不抄文档，只写干货。',
  url: SITE_URL,
  locale: 'zh-CN',
  author: {
    // EDIT ME: 站点常量集中在此文件，改掉下面这几项即可全站生效
    name: '小路ops',
    role: '运维工程师',
    bio: '白天守着监控大盘，晚上啃着官方文档。信奉「一切皆可自动化」，也敬畏每一次生产变更。把命令行里摸出来的经验，一篇篇写进云端。',
    social: [
      { label: 'GitHub', icon: 'github', href: 'https://github.com/lujinlei6' },
      { label: '邮件', icon: 'mail', href: 'mailto:hello@example.com' },
      { label: 'RSS', icon: 'rss', href: '/feed.xml' },
    ],
  },
} as const

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
