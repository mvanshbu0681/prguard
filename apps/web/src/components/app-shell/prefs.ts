'use client';
// OWNER: t9a (wave 2). Shell preferences: the projector-contrast toggle and the
// compact-rows toggle (brief bullets 3), plus the sidebar's collapse state
// (bullet 2). Same shape as src/motion/reduced.ts (owner T3, read-only here):
// the DOM attribute on <html> is the source of truth, a module-level store
// fans out changes with useSyncExternalStore, and every reader gets the same
// answer without a context provider. This file adds the one thing that hook
// does not need: persistence, because a reload should not silently drop the
// toggle a judge just flipped for a projector.
//
// data-contrast="high" and data-density="compact"|"full" both live on <html>
// (design §7.3; brief bullet 3: "a data attribute other routes can read").
// Sidebar collapse has no visual-spec attribute of its own, so it gets one
// scoped to the shell: data-collapsed on the shell root, plus the same
// localStorage persistence.
import { useSyncExternalStore } from 'react';

import { CONTRAST_ATTR, CONTRAST_STORAGE_KEY, DENSITY_ATTR, DENSITY_STORAGE_KEY, RAIL_ATTR, SIDEBAR_STORAGE_KEY } from './pref-keys';

export { CONTRAST_ATTR, CONTRAST_STORAGE_KEY, DENSITY_ATTR, DENSITY_STORAGE_KEY, RAIL_ATTR, SIDEBAR_STORAGE_KEY };

type Listener = () => void;

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Private-window / blocked storage: the toggle still works for the session, it just does not persist.
    return null;
  }
}

/** A tiny persisted-attribute store: <html data-ATTR="ON_VALUE"> when on, the attribute absent when off. */
function createAttrStore(attr: string, storageKey: string, onValue: string) {
  const listeners = new Set<Listener>();

  function html(): HTMLElement | null {
    return typeof document === 'undefined' ? null : document.documentElement;
  }

  function get(): boolean {
    return html()?.getAttribute(attr) === onValue;
  }

  function set(next: boolean): void {
    const el = html();
    if (!el) return;
    if (next) el.setAttribute(attr, onValue);
    else el.removeAttribute(attr);
    safeLocalStorage()?.setItem(storageKey, next ? '1' : '0');
    listeners.forEach((l) => l());
  }

  /** Read the persisted value and apply it to <html>, once, before paint (called from a mount effect). */
  function hydrate(): void {
    const stored = safeLocalStorage()?.getItem(storageKey);
    if (stored === '1' && !get()) set(true);
    else if (stored === '0' && get()) set(false);
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const serverSnapshot = () => false;

  return { get, set, hydrate, subscribe, serverSnapshot };
}

const contrastStore = createAttrStore(CONTRAST_ATTR, CONTRAST_STORAGE_KEY, 'high');
const densityStore = createAttrStore(DENSITY_ATTR, DENSITY_STORAGE_KEY, 'compact');

/** Live `data-contrast="high"` state, backed by localStorage. */
export function useContrastToggle(): [boolean, (next?: boolean) => void] {
  const on = useSyncExternalStore(contrastStore.subscribe, contrastStore.get, contrastStore.serverSnapshot);
  return [on, (next) => contrastStore.set(next ?? !contrastStore.get())];
}

/** Live `data-density="compact"` state, backed by localStorage. Off (`"full"`, 32px rows) by default. */
export function useCompactRowsToggle(): [boolean, (next?: boolean) => void] {
  const on = useSyncExternalStore(densityStore.subscribe, densityStore.get, densityStore.serverSnapshot);
  return [on, (next) => densityStore.set(next ?? !densityStore.get())];
}

/** Apply both persisted preferences to <html>. Call once, on mount, from the shell layout. */
export function hydrateShellPrefs(): void {
  contrastStore.hydrate();
  densityStore.hydrate();
}

// ---------------------------------------------------------------------------
// Sidebar collapse — scoped to the shell, not <html> (design §1.3: "224px,
// collapsible to 52px icon-only via ⌘B, persisted").
// ---------------------------------------------------------------------------

const sidebarListeners = new Set<Listener>();
let sidebarCollapsed = false;
let sidebarHydrated = false;

function readSidebarStorage(): boolean {
  return safeLocalStorage()?.getItem(SIDEBAR_STORAGE_KEY) === '1';
}

function getSidebarCollapsed(): boolean {
  if (!sidebarHydrated && typeof window !== 'undefined') {
    sidebarCollapsed = readSidebarStorage();
    sidebarHydrated = true;
  }
  return sidebarCollapsed;
}

function setSidebarCollapsed(next: boolean): void {
  sidebarCollapsed = next;
  sidebarHydrated = true;
  safeLocalStorage()?.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
  // Mirrors the pre-paint flag (see RAIL_ATTR) so CSS and state never disagree.
  if (typeof document !== 'undefined') {
    if (next) document.documentElement.setAttribute(RAIL_ATTR, '');
    else document.documentElement.removeAttribute(RAIL_ATTR);
  }
  sidebarListeners.forEach((l) => l());
}

function subscribeSidebar(listener: Listener): () => void {
  sidebarListeners.add(listener);
  return () => sidebarListeners.delete(listener);
}

const sidebarServerSnapshot = () => false;

/** Live sidebar-collapsed state, backed by localStorage. Rail width follows from this in CSS. */
export function useSidebarCollapsed(): [boolean, (next?: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribeSidebar, getSidebarCollapsed, sidebarServerSnapshot);
  return [collapsed, (next) => setSidebarCollapsed(next ?? !getSidebarCollapsed())];
}
