'use client';
// A read failure, inline where the data would have been: status · endpoint ·
// request id in mono, the message in plain words, and pill actions to retry or
// copy the request id. Never a toast (dashboard §2.0).
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/dash/kit';
import type { ApiError } from '@/lib/hooks';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  error: ApiError;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const [copied, setCopied] = useState(false);

  async function copyRequestId() {
    if (!error.requestId) return;
    try {
      await navigator.clipboard.writeText(error.requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable: the id is still selectable in the text.
    }
  }

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-4 rounded-w-card border border-[var(--w-danger-line)] bg-w-danger-soft p-5', className)}
      data-error-state=""
    >
      <span className="grid size-10 flex-none place-items-center rounded-w-pill bg-w-danger text-white" aria-hidden>
        <CircleAlert size={18} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-w-mono text-[12px] break-all text-w-danger-text">
          {error.statusLabel} · {error.endpoint}
          {error.requestId ? ` · ${error.requestId}` : ''}
        </p>
        <p className="text-[15px] leading-relaxed text-w-text">{error.message}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {onRetry ? (
            <Button variant="dark" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
          {error.requestId ? (
            <Button variant="ghost" size="sm" onClick={copyRequestId}>
              {copied ? 'Copied' : 'Copy request id'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
