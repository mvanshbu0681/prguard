'use client';
// OWNER: t9a (wave 2). The 768px line brand-gaps §G draws for the dashboard.
// SSR and the first client render both answer `false` (the server does not
// know the viewport), so nothing the palette or the chords do can run before
// hydration; MobileBanner's own visibility comes from a CSS media query, not
// this hook, so it is correct even in that first frame.
import { useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 767px)';

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

const serverSnapshot = () => false;

/** True below 768px (brand-gaps §G): the shell collapses to a read-only band, no palette, no chords. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
