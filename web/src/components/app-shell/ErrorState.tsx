'use client';
// OWNER: t9a (wave 2). The dashboard's one inline-error grammar (dashboard §2.0):
// never a toast (sonner is reserved for write outcomes) — a 1px --alarm border,
// the failing endpoint and status code, a request id with click-to-copy, and
// [Retry]. Every read hook's `error` is an ApiError (src/api/errors.ts), so this
// is the one component every wave-3 screen's error boundary renders.
//
//   <ErrorState error={query.error} onRetry={() => query.refetch()} />
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
    <div role="alert" className={cn('flex flex-col gap-3 rounded-panel border border-alarm p-4', className)} data-error-state="">
      <p className="type-data text-alarm-text">
        {error.status || 'ERR'} · {error.endpoint}
        {error.requestId ? ` · ${error.requestId}` : ''}
      </p>
      <p className="type-body text-text-body">{error.message}</p>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <Button variant="ghost" onClick={onRetry}>
            RETRY
          </Button>
        ) : null}
        {error.requestId ? (
          <Button variant="quiet" onClick={copyRequestId}>
            {copied ? 'COPIED' : 'COPY REQUEST ID'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
