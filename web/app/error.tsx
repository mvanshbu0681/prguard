"use client"; // Error boundaries must be Client Components.
// OWNER: t8a (wave 3). The root 500 — brand-gaps §F: identical structure to
// the 404, "/ 500 — UNHANDLED", "Something on our side failed. The request
// id is below.", a request id with click-to-copy, a way home. Never "we're
// working on it" (nobody is, and the product's voice does not lie about
// state).
//
// Renders inside the root layout (fonts, handshake, providers are intact —
// only the failed segment below it is replaced), so unlike global-error it
// does not need its own <html>/<body>.
//
// Next 16.3: the stable recovery prop is `retry` (`reset` still exists but
// the docs now lead with `retry`); this file uses it.
import { useState } from "react";
import Link from "next/link";
import { GraphPaper, IndexLabel, ProvenanceLine } from "@/components/chrome";
import { Lockup } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const requestId = error.digest ?? null;
  const [copied, setCopied] = useState(false);

  const copyRequestId = async () => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (insecure context, permission denied).
      // The id is still selectable text below; nothing else to do here.
    }
  };

  return (
    <GraphPaper as="div" className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-ink-0 px-4 py-16 text-center">
      <Lockup variant="C" />
      <div className="flex flex-col items-center gap-3">
        <h1 className="sr-only">500 — unhandled</h1>
        <IndexLabel as="p" index="500" category="UNHANDLED" aria-hidden="true" className="text-text-dim" />
        <p className="type-body max-w-[36ch] text-text-body">Something on our side failed. The request id is below.</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => retry()}>
          TRY AGAIN
        </Button>
        <Link href="/" className="link-draw type-label text-signal-text">
          ← BACK TO THE PROOF BENCH
        </Link>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ProvenanceLine source={requestId ? `request id ${requestId}` : "request id unavailable"} />
        {requestId ? (
          <Button type="button" variant="ghost" size="sm" onClick={copyRequestId}>
            {copied ? "COPIED" : "COPY REQUEST ID"}
          </Button>
        ) : null}
      </div>
    </GraphPaper>
  );
}
