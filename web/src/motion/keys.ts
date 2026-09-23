// OWNER: T3 (wave 1). Single-key bindings for replays (P, D, R …).
//
// A replay key must never fire while someone is typing, and never on a chord:
// ⌘P prints, Ctrl+D bookmarks, Shift+P is a capital letter in a text field. So a
// key is handled only when ALL of these hold:
//   - the event is not already handled (defaultPrevented), not an auto-repeat,
//     and not part of an IME composition;
//   - no modifier is held (Ctrl, Meta, Alt or Shift);
//   - focus is not in a typing context: <input>, <textarea>, <select>, anything
//     contenteditable, or an ARIA textbox / searchbox / combobox (cmdk's input).
// Matching is on `event.key`, case-insensitive, so Caps Lock still replays.
//
// Engine-free.

import { useEffect, useEffectEvent } from "react";

export type KeySpec = string | readonly string[];

const TYPING_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

/** True when keystrokes on this target are someone typing, not a command. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // jsdom and some shadow hosts do not compute isContentEditable; check the attribute too.
  if (el.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  const role = el.getAttribute("role");
  return role !== null && TYPING_ROLES.has(role);
}

function keysOf(spec: KeySpec): string[] {
  return (typeof spec === "string" ? [spec] : [...spec]).map((k) => k.toLowerCase());
}

/** True when the event's key is one of `spec` (case-insensitive). */
export function matchesKey(event: Pick<KeyboardEvent, "key">, spec: KeySpec): boolean {
  const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
  return key.length > 0 && keysOf(spec).includes(key);
}

/** The full guard: the key matches and nothing says this keystroke belongs to someone else. */
export function shouldHandleKey(event: KeyboardEvent, spec: KeySpec): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  if (!matchesKey(event, spec)) return false;
  const origin = typeof event.composedPath === "function" ? (event.composedPath()[0] ?? event.target) : event.target;
  return !isTypingTarget(origin) && !isTypingTarget(document.activeElement);
}

/**
 * Bind `spec` on window keydown for the lifetime of the component. The handler is
 * always the latest render's (no stale closures) and receives the event.
 */
export function useKeyBinding(spec: KeySpec | undefined, handler: (event: KeyboardEvent) => void, enabled = true): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => handler(event));
  const signature = spec === undefined ? "" : keysOf(spec).join("\u0000");
  useEffect(() => {
    if (!enabled || signature === "") return;
    const keys = signature.split("\u0000");
    const listener = (event: KeyboardEvent) => {
      if (!shouldHandleKey(event, keys)) return;
      event.preventDefault();
      onKey(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled, signature]);
}
