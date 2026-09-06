/**
 * 站点知识点分类的唯一注册表。
 *
 * ── 如何新增一个分类 ──────────────────────────────────────────────
 * 1. 在下方 CATEGORIES 数组里加一个对象：
 *      { slug: 'prometheus', name: 'Prometheus', description: '云原生监控……' }
 *    slug 只能用小写字母、数字和连字符，且不能与已有 slug 重复。
 * 2. 写文章时在 frontmatter 里引用它：
 *      ---
 *      title: ...
 *      category: prometheus
 *      ---
 * 3. 完事。导航、分类页、计数都会自动出现，无需改任何其他代码。
 *
 * 若文章引用了未注册的 category，构建会直接报错并指出缺哪个 slug，
 * 所以不用担心拼写错误悄悄溜上线。
 * ─────────────────────────────────────────────────────────────────
 */
export type Category = {
  /** URL 段，同时是文章 frontmatter 里的 `category` 值。^[a-z0-9]+(?:-[a-z0-9]+)*$ */
  slug: string
  /** 展示名，出现在分类页标题、卡片与徽标上。 */
  name: string
  /** 一句话简介，用于分类卡片与 SEO description。 */
  description: string
}

export const CATEGORIES: readonly Category[] = [
  {
    slug: 'docker',
    name: 'Docker',
    description: '镜像、容器、网络与数据卷——把服务装进盒子里的所有学问。',
  },
  {
    slug: 'kubernetes',
    name: 'Kubernetes',
    description: 'Pod、Service、Ingress 与调度：云原生世界的操作系统。',
  },
  {
    slug: 'nginx',
    name: 'Nginx',
    description: '从编译安装到反向代理、负载均衡与 HTTPS 配置实战。',
  },
  {
    slug: 'zabbix',
    name: 'Zabbix',
    description: '模板、触发器与告警策略，让故障在你用户之前被发现。',
  },
  {
    slug: 'redis',
    name: 'Redis',
    description: '缓存、持久化、主从与哨兵——高性能内存数据库的运维笔记。',
  },
  {
    slug: 'linux',
    name: 'Linux',
    description: '系统管理、性能排查与那些 man 手册里没写的坑。',
  },
  {
    slug: 'prometheus',
    name: 'Prometheus',
    description: '指标采集、PromQL 与 Grafana 可视化，云原生监控三件套。',
  },
  {
    slug: 'ansible',
    name: 'Ansible',
    description: '用 YAML 描述你的基础设施，批量变更不再靠手速。',
  },
  {
    slug: 'shell',
    name: 'Shell 脚本',
    description: '一行命令救一次火，一个脚本省一整年的重复劳动。',
  },
  {
    slug: 'network',
    name: '网络',
    description: 'TCP/IP、路由交换与抓包排障，把网线里的东西看清楚。',
  },
  {
    slug: 'frontend',
    name: '前端',
    description: '运维偶尔也要写点页面：博客本身与一些前端杂记。',
  },
]

const CATEGORY_MAP = new Map(CATEGORIES.map((category) => [category.slug, category]))

/** Returns undefined when the slug is not in the registry. */
export function getCategory(slug: string): Category | undefined {
  return CATEGORY_MAP.get(slug)
}
