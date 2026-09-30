import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-6 flex min-h-8 items-center justify-between gap-4", className)}>
      <h1 className="truncate text-xl font-semibold tracking-[-0.015em] text-primary">{title}</h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
