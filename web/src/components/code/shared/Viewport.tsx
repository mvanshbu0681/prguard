// OWNER: t1d (wave 1). The scroll viewport every code surface renders its <pre> into.
//
// One element carries the whole accessibility contract of a scrollable artifact:
//   - role="region" + aria-label: a named landmark, announced on focus
//     (role="log" instead for live output, design §8.4);
//   - tabIndex={0}: the only way a keyboard user can scroll sideways through a
//     long traceback (axe: scrollable-region-focusable). The focus ring is the
//     global 2px --signal-hi outline, inset by code.css so no ancestor clips it.
// Both axes scroll; nothing inside ever wraps (code.css).
import type { CSSProperties, ReactNode } from "react";

export interface ViewportProps {
  className: string;
  label: string;
  describedBy?: string;
  /** "log" for output that is still arriving (the live run's proof terminal). */
  role?: "region" | "log";
  /** Only meaningful with role="log": true while a burst of lines is landing. */
  busy?: boolean;
  /** Fixed height in px; taller content scrolls. */
  height?: number;
  /** Maximum height in px; shorter content shrinks the viewport. */
  maxHeight?: number;
  children: ReactNode;
}

export function Viewport({ className, label, describedBy, role = "region", busy, height, maxHeight, children }: ViewportProps) {
  const style: CSSProperties | undefined =
    height !== undefined || maxHeight !== undefined ? { height, maxHeight } : undefined;
  return (
    <div
      className={className}
      role={role}
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={role === "log" ? Boolean(busy) : undefined}
      tabIndex={0}
      style={style}
    >
      {children}
    </div>
  );
}
