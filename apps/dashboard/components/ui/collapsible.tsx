import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// Native <details>: keyboard and screen-reader behaviour for free.
export function Collapsible({
  title,
  count,
  children,
  variant = "panel",
  defaultOpen = false,
  className,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  variant?: "panel" | "inline";
  defaultOpen?: boolean;
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <details className={clsx("group", className)} open={defaultOpen}>
        <summary className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-dim transition-colors hover:text-primary">
          <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
          {title}
          {count !== undefined && <span className="tabular text-faint">{count}</span>}
        </summary>
        <div className="mt-2">{children}</div>
      </details>
    );
  }

  return (
    <details
      className={clsx("group overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi", className)}
      open={defaultOpen}
    >
      <summary className="flex h-10 items-center gap-2 px-4 text-sm font-medium text-primary transition-colors hover:bg-surface-2">
        <ChevronRight
          className="size-3.5 text-dim transition-transform duration-150 group-open:rotate-90"
          aria-hidden="true"
        />
        {title}
        {count !== undefined && <span className="tabular font-normal text-faint">{count}</span>}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
