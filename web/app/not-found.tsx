"use client";
// OWNER: t8a (wave 3). The root 404 — brand-gaps §F, plan D2 ("Unbuilt routes
// 404 with `not built for the beta`", satisfied by /overview-adjacent routes
// that call notFound(); this file is the catch-all for anything unmatched
// anywhere in the app, marketing or dashboard). Renders inside the root
// layout (fonts, handshake, providers) but with neither route group's chrome
// — no data-surface, so no Nav/Footer — because it has to look right for a
// bad /runs/:id link as much as a bad marketing path.
//
// The section-index grammar, not an illustration: Lockup C, "/ 404 — NO SUCH
// ROUTE", one ghost CTA home, a provenance footer stating the path that was
// actually requested and the status code — the same device as every evidence
// frame, applied to a failure (brand-gaps §F). No search box, no "popular
// pages", no sitemap, no "Oops".
//
// usePathname (client-only) is what the Next.js docs recommend when a
// not-found page needs the path that failed to match: the file cannot be
// async/server here and still read the URL (see not-found.md "If you need to
// use Client Component hooks like usePathname ... you must fetch data on the
// client-side instead").
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraphPaper, IndexLabel, ProvenanceLine } from "@/components/chrome";
import { Lockup } from "@/components/brand";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <GraphPaper as="div" className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-ink-0 px-4 py-16 text-center">
      <Lockup variant="C" />
      <div className="flex flex-col items-center gap-3">
        {/* IndexLabel's `as` union has no "h1"; the visible grammar stays a
            <p>, and a visually-hidden <h1> gives the page its real heading. */}
        <h1 className="sr-only">404 — no such route</h1>
        <IndexLabel as="p" index="404" category="NO SUCH ROUTE" aria-hidden="true" className="text-text-dim" />
        <p className="type-body max-w-[36ch] text-text-body">There is nothing at this path.</p>
      </div>
      <Link href="/#proof" className="link-draw type-label text-signal-text">
        ← BACK TO THE PROOF BENCH
      </Link>
      <ProvenanceLine source={`GET ${pathname || "/"} · 404`} className="mt-4" />
    </GraphPaper>
  );
}
