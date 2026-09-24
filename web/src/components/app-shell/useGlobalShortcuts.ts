'use client';
// OWNER: t9a (wave 2). The shell's global keyboard map (dashboard §1.5,
// brief bullet 5): ⌘K opens the palette, ⌘B collapses the rail, `?` opens the
// shortcut sheet, and `g` then a letter jumps to a route (CHORD_MAP in
// ./routes). Esc closing an overlay is Radix's own job (Dialog/CommandDialog
// close on Escape and return focus to the trigger) — this hook does not
// duplicate it.
//
// Every binding is dropped while the keystroke belongs to an input, textarea,
// select, contenteditable region or an ARIA textbox/searchbox/combobox
// (isTypingTarget, shared with useListKeys and the replay keys in
// src/motion/keys.ts — one guard, everywhere a track binds a bare key).
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isTypingTarget } from '@/motion/keys';
import { CHORD_MAP } from './routes';

/** The `g …` leader window: a second key after `g` past this many ms starts over, not chains. */
const CHORD_WINDOW_MS = 900;

export interface GlobalShortcutHandlers {
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  onOpenShortcuts: () => void;
  /** Disabled below 768px (brief bullet 9: the mobile shell has no palette, no chords). */
  enabled?: boolean;
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? navigator.userAgent ?? '');
}

export function useGlobalShortcuts({ onOpenPalette, onToggleSidebar, onOpenShortcuts, enabled = true }: GlobalShortcutHandlers): void {
  const router = useRouter();
  const chordArmedAt = useRef<number | null>(null);

  // The "latest ref" pattern: written from an effect (never during render, which
  // react-hooks/refs forbids), so the listener below always reads this render's
  // closures without itself needing to be re-bound on every render.
  const handlersRef = useRef({ onOpenPalette, onToggleSidebar, onOpenShortcuts, router });
  useEffect(() => {
    handlersRef.current = { onOpenPalette, onToggleSidebar, onOpenShortcuts, router };
  });

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const target = typeof event.composedPath === 'function' ? (event.composedPath()[0] ?? event.target) : event.target;
      if (isTypingTarget(target) || isTypingTarget(document.activeElement)) return;

      const meta = isMac() ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();

      // ⌘K / Ctrl+K — the palette.
      if (meta && key === 'k' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        chordArmedAt.current = null;
        handlersRef.current.onOpenPalette();
        return;
      }
      // ⌘B / Ctrl+B — collapse the rail.
      if (meta && key === 'b' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        chordArmedAt.current = null;
        handlersRef.current.onToggleSidebar();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // `?` — the shortcut sheet. A bare key (no modifier check beyond the block above):
      // Shift produces the `?` character itself on a US layout, so shiftKey is expected here.
      if (event.key === '?') {
        event.preventDefault();
        chordArmedAt.current = null;
        handlersRef.current.onOpenShortcuts();
        return;
      }
      if (event.shiftKey) return;

      // `g` arms the leader; the next bare key within the window resolves it.
      if (key === 'g') {
        event.preventDefault();
        chordArmedAt.current = performance.now();
        return;
      }
      const armedAt = chordArmedAt.current;
      if (armedAt !== null) {
        chordArmedAt.current = null;
        if (performance.now() - armedAt <= CHORD_WINDOW_MS) {
          const item = CHORD_MAP.get(key);
          if (item) {
            event.preventDefault();
            handlersRef.current.router.push(item.href);
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
