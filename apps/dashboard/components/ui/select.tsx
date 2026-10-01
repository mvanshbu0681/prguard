import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={clsx("relative inline-flex", className)}>
      <select
        className={clsx(
          "h-8 w-full appearance-none truncate rounded-md border border-line-2 bg-surface-1 pl-2.5 pr-8 text-sm text-primary",
          "transition-colors duration-100 hover:border-line-3 hover:bg-surface-2",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-dim"
      />
    </div>
  );
}
