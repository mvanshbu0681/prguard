'use client';
// OWNER: t9a (wave 2). The dashboard's 500 (brand-gaps §F): identical grammar
// to the 404, "/ 500 — UNHANDLED", body "Something on our side failed. The
// request id is below." Never "we're working on it" — nobody is, and the
// product's voice does not lie about state. Next's error boundary hands an
// Error with an optional `digest`: the one identifier that survives past the
// component tree that just threw, so it stands in for the request id the spec
// asks for. A link to /healthz, and [Retry] (Next's own `reset()`) alongside
// the copy button.
import { useState } from 'react';
import { Lockup } from '@/components/brand';
import { GraphPaper, ProvenanceLine } from '@/components/chrome';
import { Button } from '@/components/ui/button';
import { API_BASE } from '@/lib/env';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false);
  const requestId = error.digest ?? null;

  async function copyRequestId() {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied: the id is still printed below for manual copy.
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center bg-ink-0 px-4">
      <GraphPaper aria-hidden="true" className="absolute inset-0" />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <p className="type-label text-alarm-text">/ 500 — UNHANDLED</p>
        <Lockup variant="C" />
        <p className="type-body max-w-(--measure-body) text-text-body">Something on our side failed. The request id is below.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="ghost" onClick={reset}>
            RETRY
          </Button>
          {requestId ? (
            <Button variant="quiet" onClick={copyRequestId}>
              {copied ? 'COPIED' : 'COPY REQUEST ID'}
            </Button>
          ) : null}
          <Button asChild variant="link">
            <a href={`${API_BASE}/healthz`} target="_blank" rel="noreferrer">
              /healthz →
            </a>
          </Button>
        </div>
      </div>
      <div className="relative z-10 mt-16">
        <ProvenanceLine source={`500${requestId ? ` · ${requestId}` : ''}`} />
      </div>
    </div>
  );
}
