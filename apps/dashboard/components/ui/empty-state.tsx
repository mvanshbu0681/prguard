import clsx from "clsx";
import type { ReactNode } from "react";

export function EmptyState({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <p className="text-sm text-dim">{title}</p>
      {action}
    </div>
  );
}
