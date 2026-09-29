'use client';
// The dashboard's light/dark theme. The resolved theme lives on <html> as
// data-dash-theme="light"|"dark" (app/tokens/dashboard.css keys every token off
// it); the viewer's choice — light, dark or system — persists in localStorage.
// Same store shape as app-shell/prefs.ts: the DOM attribute is the source of
// truth and useSyncExternalStore fans changes out without a context provider.
import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

// useLayoutEffect on the client (apply before paint on a client navigation), a no-op on the server.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type DashThemeChoice = 'light' | 'dark' | 'system';
export type DashTheme = 'light' | 'dark';

import { DASH_THEME_ATTR, DASH_THEME_STORAGE_KEY } from './theme-init';

export { DASH_THEME_ATTR, DASH_THEME_STORAGE_KEY };

type Listener = () => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readChoice(): DashThemeChoice {
  const v = storage()?.getItem(DASH_THEME_STORAGE_KEY);
  return v === 'dark' || v === 'system' || v === 'light' ? v : 'light';
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(choice: DashThemeChoice): DashTheme {
  return choice === 'dark' || (choice === 'system' && systemDark()) ? 'dark' : 'light';
}

function apply(choice: DashThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(DASH_THEME_ATTR, resolve(choice));
}

let choice: DashThemeChoice | null = null;

function getChoice(): DashThemeChoice {
  if (choice === null) choice = typeof window === 'undefined' ? 'light' : readChoice();
  return choice;
}

export function setDashTheme(next: DashThemeChoice): void {
  choice = next;
  try {
    storage()?.setItem(DASH_THEME_STORAGE_KEY, next);
  } catch {
    /* storage blocked: the choice still applies for this session */
  }
  apply(next);
  listeners.forEach((l) => l());
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The viewer's choice (light / dark / system) and a setter. */
export function useDashThemeChoice(): [DashThemeChoice, (next: DashThemeChoice) => void] {
  const c = useSyncExternalStore(subscribe, getChoice, () => 'light' as DashThemeChoice);
  return [c, setDashTheme];
}

/** The resolved theme actually on screen. Charts that need literal colours read this. */
export function useDashTheme(): DashTheme {
  const c = useSyncExternalStore(subscribe, getChoice, () => 'light' as DashThemeChoice);
  return c === 'system' ? (typeof window !== 'undefined' && systemDark() ? 'dark' : 'light') : c;
}

/**
 * Mounted once by the dashboard shell: keeps the attribute in sync with the OS
 * while the choice is "system", and removes it when the dashboard unmounts so a
 * client-side navigation back to the marketing page drops the dashboard tokens.
 */
export function useDashThemeRoot(): void {
  useBeforePaint(() => {
    apply(getChoice());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getChoice() === 'system') {
        apply('system');
        listeners.forEach((l) => l());
      }
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      document.documentElement.removeAttribute(DASH_THEME_ATTR);
    };
  }, []);
}
