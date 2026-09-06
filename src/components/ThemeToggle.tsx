import { Icon } from '~/components/Icon'
import { NEXT_PREFERENCE, THEME_STORAGE_KEY, type ThemePreference } from '~/lib/theme'

const ICON: Readonly<Record<ThemePreference, 'sun' | 'moon' | 'monitor'>> = {
  dark: 'moon',
  light: 'sun',
  system: 'monitor',
}

function currentPreference(): ThemePreference {
  const value = document.documentElement.dataset.themePref
  return value === 'dark' || value === 'light' ? value : 'system'
}

/**
 * Cycles dark -> light -> system.
 *
 * Holds no state of its own. All three icons render into the SSR markup and
 * `.theme-icon` rules in app.css show exactly one based on `data-theme-pref`,
 * which the inline head script wrote before first paint. Any React state here
 * would have to guess the resolved theme on the server and mismatch on
 * hydration; the `aria-label` is static for the same reason.
 *
 * There is no `flex` utility on the button: display comes from
 * `.js .theme-toggle`, which also hides the whole control when JS is off, since
 * a theme toggle without JS is an inert empty pill.
 */
export function ThemeToggle() {
  function cycle() {
    const next = NEXT_PREFERENCE[currentPreference()]
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Unwritable storage costs persistence only — the override passed below
      // still switches this session, and a reload falls back to the system
      // preference, which is the right degradation.
    }
    window.__voidTheme?.(next)
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label="切换主题"
      className="theme-toggle surface-glass h-8 w-8 items-center justify-center rounded-card text-ink-400 transition-colors duration-[var(--dur-fast)] ease-out-expo hover:text-ink-100"
    >
      <span className="theme-icon theme-icon-dark">
        <Icon name={ICON.dark} className="h-4 w-4" />
      </span>
      <span className="theme-icon theme-icon-light">
        <Icon name={ICON.light} className="h-4 w-4" />
      </span>
      <span className="theme-icon theme-icon-system">
        <Icon name={ICON.system} className="h-4 w-4" />
      </span>
    </button>
  )
}
