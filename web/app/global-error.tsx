"use client"; // Error boundaries must be Client Components.
// OWNER: t8a (wave 3). Catches an error thrown by the root layout itself
// (app/layout.tsx) — error.tsx cannot: it does not wrap the layout above its
// own segment. Next requires this file to render its own <html>/<body> and
// says plainly it "does not include your global styles" by default, so
// fonts, tokens and globals.css are imported here directly rather than
// assumed; the Providers tree that failed is deliberately not re-mounted.
//
// Same section-index grammar as app/error.tsx (brand-gaps §F: "identical
// structure" for 500), kept deliberately minimal — this is the last line of
// defence, so it reaches for as little as possible.
import { gsc, inter } from "./fonts";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const requestId = error.digest ?? null;

  return (
    <html lang="en" className={`${gsc.variable} ${inter.variable}`}>
      <body>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-ink-0 px-4 py-16 text-center">
          <span aria-hidden="true" className="type-display-h4 tracking-[0.04em] text-text-primary">
            PRGUARD
          </span>
          <div className="flex flex-col items-center gap-3">
            <h1 className="sr-only">500 — unhandled</h1>
            <p aria-hidden="true" className="type-label text-text-dim">
              / 500 — UNHANDLED
            </p>
            <p className="type-body max-w-[36ch] text-text-body">Something on our side failed. The request id is below.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => retry()} className="ui-btn ui-btn--ghost hover-ghost">
              TRY AGAIN
            </button>
            <a href="/" className="link-draw type-label text-signal-text">
              ← BACK TO THE PROOF BENCH
            </a>
          </div>
          <p className="type-micro text-text-dim">{requestId ? `request id ${requestId}` : "request id unavailable"}</p>
        </div>
      </body>
    </html>
  );
}
