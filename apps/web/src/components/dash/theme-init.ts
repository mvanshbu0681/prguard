// Server-safe theme constants (no 'use client'): the app layout inlines
// DASH_THEME_INIT_JS as a literal <script>, which it cannot do with a value
// imported from a client module (that arrives as a client reference).
export const DASH_THEME_ATTR = 'data-dash-theme';
export const DASH_THEME_STORAGE_KEY = 'witness:dash-theme';

/**
 * Inline, pre-paint: resolve the stored choice and set the attribute before
 * React hydrates, so a reload never flashes the other theme. Light is the
 * default, matching the landing page.
 */
export const DASH_THEME_INIT_JS = `try{var c=localStorage.getItem(${JSON.stringify(DASH_THEME_STORAGE_KEY)})||'light';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute(${JSON.stringify(DASH_THEME_ATTR)},d?'dark':'light');}catch(e){document.documentElement.setAttribute(${JSON.stringify(DASH_THEME_ATTR)},'light');}`;
