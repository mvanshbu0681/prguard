import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={clsx("overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("flex min-h-11 items-center gap-3 border-b border-line px-4 py-2", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h2 className="shrink-0 text-sm font-semibold text-primary">{title}</h2>
        {meta && <div className="flex min-w-0 items-center gap-3 text-xs text-dim">{meta}</div>}
      </div>
      {actions && <div className="-mr-1 flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("p-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("flex min-h-12 items-center justify-end gap-2 border-t border-line px-4 py-2.5", className)}
      {...props}
    />
  );
}
