'use client';
// OWNER: t9a (wave 2). A roving-tabindex j/k/Enter controller for `role="grid"`
// tables (dashboard §1.5: "j/k are scoped to a roving-tabindex role=grid and
// bound only while focus is inside it"). Exported for wave 3's findings,
// suppressions and audit tables — this track has no table to drive it with,
// so it is unit-tested against a synthetic list (tests/unit/app-shell).
//
// Usage (wave 3):
//   const { activeIndex, gridProps, rowProps } = useListKeys({ count: rows.length, onOpen: (i) => router.push(rows[i].href) });
//   <div {...gridProps}>
//     {rows.map((row, i) => <div key={row.id} {...rowProps(i)}>…</div>)}
//   </div>
//
// j/k move the roving index (loop is off by default: k at row 0 stays at row 0,
// matching a scrollbar rather than wrapping past the ends unexpectedly). Enter
// or `o` opens the focused row. The handler never fires while the keystroke
// belongs to an input, textarea, select, contenteditable region or an ARIA
// textbox/searchbox/combobox nested in a cell (isTypingTarget, shared with the
// go-to chords and the palette — the same guard everywhere means one bug to fix).
import { useCallback, useState, type KeyboardEvent } from 'react';
import { isTypingTarget } from '@/motion/keys';

export interface UseListKeysOptions {
  /** Number of rows. 0 disables navigation without the caller needing an `enabled` flag of its own. */
  count: number;
  /** Enter or `o` on the focused row. */
  onOpen?: (index: number) => void;
  /** `v` on the focused row (design §1.5: select/deselect). Optional — most tables have no selection yet. */
  onToggleSelect?: (index: number) => void;
  enabled?: boolean;
}

export interface UseListKeysResult {
  /** The roving index, clamped to `[0, count).` -1 when `count` is 0 (nothing to focus). */
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  /** Spread on the `role="grid"` container. */
  gridProps: {
    role: 'grid';
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
  /** Spread on each row: the roving `tabIndex` (0 for the active row, -1 otherwise) and `aria-selected`. */
  rowProps: (index: number) => { tabIndex: 0 | -1; 'aria-selected': boolean; 'data-active'?: string };
}

/** j/k/Enter (and o for open, v for toggle-select) inside a `role="grid"` table. */
export function useListKeys({ count, onOpen, onToggleSelect, enabled = true }: UseListKeysOptions): UseListKeysResult {
  const [activeIndex, setActiveIndexState] = useState(0);
  const clamped = count > 0 ? Math.min(activeIndex, count - 1) : -1;

  const setActiveIndex = useCallback(
    (index: number) => {
      if (count === 0) return;
      setActiveIndexState(Math.max(0, Math.min(index, count - 1)));
    },
    [count],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!enabled || count === 0) return;
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'j') {
        event.preventDefault();
        setActiveIndex(clamped + 1);
      } else if (key === 'k') {
        event.preventDefault();
        setActiveIndex(clamped - 1);
      } else if ((key === 'enter' || key === 'o') && onOpen && clamped >= 0) {
        event.preventDefault();
        onOpen(clamped);
      } else if (key === 'v' && onToggleSelect && clamped >= 0) {
        event.preventDefault();
        onToggleSelect(clamped);
      }
    },
    [enabled, count, clamped, setActiveIndex, onOpen, onToggleSelect],
  );

  const rowProps = useCallback(
    (index: number) => ({
      tabIndex: (index === clamped ? 0 : -1) as 0 | -1,
      'aria-selected': index === clamped,
      ...(index === clamped ? { 'data-active': '' } : {}),
    }),
    [clamped],
  );

  return { activeIndex: clamped, setActiveIndex, gridProps: { role: 'grid', onKeyDown }, rowProps };
}
