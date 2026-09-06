/**
 * Stroke icons use `currentColor`; only brand marks that must read as solid
 * shapes opt into `filled`. The zero-length subpath trick (`h0.01`) renders a
 * dot via round line caps, which keeps every icon a single path string.
 */
const icons = {
  arrowRight: { d: 'M4 12h15M13 6l6 6-6 6' },
  arrowLeft: { d: 'M20 12H5M11 6l-6 6 6 6' },
  arrowUpRight: { d: 'M7 17 17 7M8 7h9v9' },
  clock: {
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.5V12l3 2',
  },
  calendar: {
    d: 'M7.5 3v3M16.5 3v3M3.5 9h17M5 4.5h14A1.5 1.5 0 0 1 20.5 6v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5z',
  },
  tag: {
    d: 'M11.6 3.5H20.5v8.9l-8.7 8.7a1.5 1.5 0 0 1-2.1 0l-6.3-6.3a1.5 1.5 0 0 1 0-2.1zM16.6 7.4h0.01',
  },
  rss: {
    d: 'M5.5 18.5h0.01M4.5 12.5a7 7 0 0 1 7 7M4.5 6.5a13 13 0 0 1 13 13',
  },
  mail: { d: 'M3.5 6.5h17v11h-17zM3.5 7.2l8.5 5.8 8.5-5.8' },
  spark: { d: 'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4' },
  alert: { d: 'M12 4.5 21.5 20h-19zM12 10v4.2M12 17.2h0.01' },
  sun: {
    d: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8',
  },
  moon: { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
  monitor: {
    d: 'M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5zM8.5 20h7M12 16.5v3.5',
  },
  github: {
    filled: true,
    d: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z',
  },
} as const

export type IconName = keyof typeof icons

type IconProps = {
  name: IconName
  className?: string
  title?: string
}

export function Icon({ name, className, title }: Readonly<IconProps>) {
  const icon = icons[name]
  const filled = 'filled' in icon && icon.filled

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      <path d={icon.d} />
    </svg>
  )
}
