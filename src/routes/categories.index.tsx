import { Link, createFileRoute } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'
import { ScrollReveal } from '~/components/ScrollReveal'
import { fetchCategories } from '~/lib/posts.functions'
import { seo } from '~/lib/seo'
import { SITE, absoluteUrl } from '~/lib/site'

export const Route = createFileRoute('/categories/')({
  loader: () => fetchCategories(),
  head: ({ loaderData }) => {
    const categories = loaderData ?? []
    const description = `按技术栈浏览 ${SITE.name} 的全部内容：${categories
      .map((category) => category.name)
      .join('、')}。`

    return seo({
      title: '知识分类',
      description,
      path: '/categories',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `知识分类 · ${SITE.name}`,
        description,
        url: absoluteUrl('/categories'),
        inLanguage: 'zh-CN',
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: categories.map((category, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: category.name,
            url: absoluteUrl(`/categories/${category.slug}`),
          })),
        },
      },
    })
  },
  component: CategoriesIndex,
})

function CategoriesIndex() {
  const categories = Route.useLoaderData()

  return (
    <Container as="main" className="pt-16 pb-24 sm:pt-20">
      <ScrollReveal>
        <p className="font-mono text-xs tracking-[0.2em] text-aurora-cyan uppercase">Categories</p>
        <h1 className="mt-3 text-title font-semibold text-ink-100">知识分类</h1>
        <p className="mt-4 max-w-[34rem] text-ink-400">
          运维是个大杂烩，先把架子搭好。挑一个你正在折腾的方向进去，里面的文章都是我亲手踩过坑才写下来的。
        </p>
      </ScrollReveal>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, index) => (
          <ScrollReveal key={category.slug} delay={Math.min(index, 5) * 60} className="h-full">
            <Link
              to="/categories/$category"
              params={{ category: category.slug }}
              className="group relative flex h-full flex-col overflow-hidden rounded-card border border-void-700 bg-void-850/60 p-6 shadow-card transition-[transform,border-color,background-color,box-shadow] duration-[var(--dur-base)] ease-out-expo hover:-translate-y-0.5 hover:border-void-600 hover:bg-void-800/70 hover:shadow-glow-violet"
            >
              <span
                aria-hidden
                className="rule-aurora absolute inset-x-0 top-0 origin-left scale-x-0 transition-transform duration-[var(--dur-base)] ease-out-expo group-hover:scale-x-100"
              />

              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-mono text-lg font-semibold tracking-wide text-ink-100 transition-colors duration-[var(--dur-fast)] ease-out-expo group-hover:text-ink-50">
                  {category.name}
                </h2>
                <span className="shrink-0 font-mono text-xs text-ink-600 tabular-nums">
                  {category.count} 篇
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-ink-400">{category.description}</p>

              <div className="mt-auto flex items-center gap-1.5 pt-6 text-xs text-ink-600 transition-colors duration-[var(--dur-fast)] ease-out-expo group-hover:text-aurora-cyan">
                进入分类
                <Icon
                  name="arrowRight"
                  className="h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ease-out-expo group-hover:translate-x-1"
                />
              </div>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </Container>
  )
}
