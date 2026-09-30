import clsx from "clsx";
import type { CSSProperties } from "react";

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  // Callers may pass their own radius (dots, avatars); only default when they don't.
  const rounded = className?.includes("rounded") ? undefined : "rounded-sm";
  return (
    <span aria-hidden="true" style={style} className={clsx("block animate-shimmer bg-surface-3", rounded, className)} />
  );
}

// A few lines of text-shaped skeleton, for prose that hasn't arrived yet.
export function SkeletonText({ lines = 4, className }: { lines?: number; className?: string }) {
  const widths = ["92%", "84%", "96%", "62%", "88%", "74%", "90%", "48%"];
  return (
    <div className={clsx("space-y-2.5", className)} aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: i === lines - 1 ? "42%" : widths[i % widths.length] }} />
      ))}
    </div>
  );
}
