"use client";

import clsx from "clsx";
import { CircleAlert } from "lucide-react";

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-center gap-2 px-6 py-12 text-sm", className)} role="alert">
      <CircleAlert className="size-3.5 text-err" aria-hidden="true" />
      <span className="text-body">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-sm px-1 font-medium text-accent-text underline-offset-4 hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// Inline, one-line error for failed mutations.
export function InlineError({ message }: { message: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-err-text" role="alert">
      <CircleAlert className="size-3" aria-hidden="true" />
      {message}
    </span>
  );
}
