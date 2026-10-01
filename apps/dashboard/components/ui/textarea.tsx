import clsx from "clsx";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      spellCheck={false}
      className={clsx(
        "block w-full resize-y rounded-md border border-line-2 bg-surface-0 px-3 py-2.5 text-sm text-primary",
        "transition-colors duration-100 hover:border-line-3",
        "focus-visible:border-transparent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
