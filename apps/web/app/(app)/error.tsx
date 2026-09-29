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
import { Button, GlassTile, PhotoCard } from '@/components/dash/kit';
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
    <div className="mx-auto flex w-full max-w-[1320px] px-4 py-8 md:px-9">
      <PhotoCard className="flex min-h-[520px] w-full flex-col items-center justify-center gap-6 text-center" position="50% 70%">
        <p className="font-w-mono text-[12px] tracking-[0.14em] text-white/80 uppercase">500 · unhandled</p>
        <h1 className="font-w-display text-[44px] leading-[1.05] font-semibold tracking-[-1.2px] text-white max-sm:text-[30px]">
          Something on our side failed
        </h1>
        <GlassTile tone="navy" className="px-4 py-2 font-w-mono text-[12.5px]">
          500{requestId ? ` · ${requestId}` : ''}
        </GlassTile>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="glass" onClick={copyRequestId} disabled={!requestId}>
            {copied ? 'Copied' : 'Copy request id'}
          </Button>
          <Button variant="primary" chip onClick={reset} size="lg">
            Retry
          </Button>
        </div>
        <a href={`${API_BASE}/healthz`} target="_blank" rel="noreferrer" className="font-w-mono text-[12px] text-white/80 underline-offset-4 hover:underline">
          /healthz →
        </a>
      </PhotoCard>
    </div>
  );
}
