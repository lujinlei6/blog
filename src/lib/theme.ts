/**
 * Theme resolution lives here so the pre-paint inline script and the toggle
 * button cannot drift apart. Only `INLINE_THEME_SCRIPT` is injected into the
 * document; `ThemeToggle` imports the key and the cycle order, then calls back
 * into the script's own resolver via `window.__cloudTheme`.
 */
export const THEME_STORAGE_KEY = 'cloud-theme'

export type ThemePreference = 'dark' | 'light' | 'system'

/** Click order. `system` is a real destination, not just the absence of a choice. */
export const NEXT_PREFERENCE: Readonly<Record<ThemePreference, ThemePreference>> = {
  dark: 'light',
  light: 'system',
  system: 'dark',
}

/** Browser-chrome tint per *resolved* theme. Must match --color-void-900. */
export const THEME_COLOR = {
  dark: '#0a0a11',
  light: '#f5f6fa',
} as const

declare global {
  interface Window {
    /**
     * Re-resolve and re-apply. Installed by the inline head script. Pass a
     * preference to apply it directly instead of reading storage — that is what
     * keeps the toggle working in private mode, where the write throws.
     */
    __cloudTheme?: (preference?: ThemePreference) => void
  }
}

/**
 * Two attributes, not one. `data-theme` is always a *resolved* value so the
 * token overrides in app.css never need a `prefers-color-scheme` duplicate,
 * while `data-theme-pref` keeps the raw choice so the toggle can show which
 * state the user picked. Splitting them is what lets the button be rendered
 * entirely by CSS — the server cannot know the resolved theme, so any React
 * state driving the icon would mismatch on hydration.
 *
 * The `change` listener re-reads storage instead of closing over the
 * preference, so switching away from `system` cannot leave a stale handler
 * fighting the user's explicit choice.
 */
export const INLINE_THEME_SCRIPT = `(function () {
  var el = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var meta = document.querySelector('meta[name="theme-color"]');
  function read() {
    try {
      var v = localStorage.getItem('${THEME_STORAGE_KEY}');
      return v === 'dark' || v === 'light' ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }
  function apply(override) {
    var pref = override || read();
    var theme = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
    el.setAttribute('data-theme-pref', pref);
    el.setAttribute('data-theme', theme);
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '${THEME_COLOR.light}' : '${THEME_COLOR.dark}');
    }
  }
  window.__cloudTheme = apply;
  mq.addEventListener('change', function () {
    apply();
  });
  apply();
  el.classList.add('js');
})();`
