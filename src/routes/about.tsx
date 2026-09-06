import { createFileRoute } from '@tanstack/react-router'

import { Container } from '~/components/Container'
import { Icon } from '~/components/Icon'
import { Prose } from '~/components/Prose'
import { ScrollReveal } from '~/components/ScrollReveal'
import { fetchAbout } from '~/lib/posts.functions'
import { seo } from '~/lib/seo'
import { SITE, absoluteUrl } from '~/lib/site'

export const Route = createFileRoute('/about')({
  loader: () => fetchAbout(),
  head: ({ loaderData }) =>
    seo({
      title: '关于',
      description: loaderData?.description,
      path: '/about',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: `关于 · ${SITE.name}`,
        description: loaderData?.description ?? SITE.description,
        url: absoluteUrl('/about'),
        inLanguage: SITE.locale,
        about: {
          '@type': 'Person',
          name: SITE.author.name,
          jobTitle: SITE.author.role,
          description: SITE.author.bio,
          url: absoluteUrl('/'),
          // sameAs must be resolvable profile URLs, so the relative RSS link
          // and the mailto are excluded.
          sameAs: SITE.author.social
            .map((item) => item.href)
            .filter((href) => href.startsWith('http')),
        },
      },
    }),
  component: About,
})

function About() {
  const about = Route.useLoaderData()

  return (
    <Container as="main" width="reading" className="pt-16 pb-24 sm:pt-20">
      <ScrollReveal>
        <p className="font-mono text-xs tracking-[0.2em] text-aurora-violet uppercase">About</p>
        <h1 className="mt-3 text-title font-semibold text-ink-100">{about.title}</h1>
        <p className="mt-4 text-lead text-ink-400">
          {SITE.author.name} · {SITE.author.role}
        </p>
      </ScrollReveal>

      <Prose html={about.contentHtml} className="mt-12" />

      <div className="mt-16 border-t border-void-700 pt-8">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-600 uppercase">联系</p>
        <ul className="mt-4 flex flex-wrap gap-2.5">
          {SITE.author.social.map((item) => {
            const external = item.href.startsWith('http')
            return (
              <li key={item.label}>
                <a
                  href={item.href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="inline-flex items-center gap-2 rounded-pill border border-void-700 bg-void-850 px-4 py-2 text-sm text-ink-400 transition-[border-color,color,background-color] duration-[var(--dur-fast)] ease-out-expo hover:border-void-600 hover:bg-void-800 hover:text-ink-100"
                >
                  <Icon name={item.icon} className="h-4 w-4" />
                  {item.label}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </Container>
  )
}
