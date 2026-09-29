'use client';
// Radix restores focus on close only to a registered <Trigger>. Most of our
// dialogs are controlled (opened from a key, a menu item, a button elsewhere),
// so focus fell to <body>. This remembers whatever was focused when the
// content mounted and puts focus back there on close — unless the caller's
// own onCloseAutoFocus already handled it.
import { useRef } from 'react';

type FocusEventHandler = (event: Event) => void;

export function useRestoreFocus(onOpenAutoFocus?: FocusEventHandler, onCloseAutoFocus?: FocusEventHandler) {
  const previous = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      // FocusScope fires this before it moves focus in: activeElement is still the opener.
      const active = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
      previous.current = active && active !== document.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const el = previous.current;
      previous.current = null;
      if (el && el.isConnected) {
        event.preventDefault();
        el.focus({ preventScroll: true });
      }
    },
  };
}
