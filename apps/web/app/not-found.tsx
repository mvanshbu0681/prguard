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
import { ArrowUpRight } from "lucide-react";
import { TrackingMark } from "@/components/brand";

// The landing hero's frame: a 12px white inset around a 28px-radius sky
// photograph (a CSS background, not an <img>: the page stays illustration-free
// in the DOM), a white Plus Jakarta headline and the lime pill home.
export default function NotFound() {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-[#ffffff] p-3 max-sm:p-2">
      <div
        className="relative isolate flex min-h-[calc(100dvh-24px)] flex-col items-center justify-center gap-7 overflow-hidden rounded-[28px] px-6 py-16 text-center text-[#ffffff] max-sm:rounded-[22px]"
        style={{
          background:
            "linear-gradient(180deg, rgba(6,34,92,.38) 0%, rgba(6,34,92,.12) 40%, rgba(6,34,92,.2) 100%), url(/marketing/hero-sky.jpg) center top / auto 146% no-repeat, #0b3a8c",
          fontFamily: "var(--font-v2-sans), system-ui, sans-serif",
        }}
      >
        <Link href="/" aria-label="PR Guard home" className="absolute top-5 left-6 inline-flex items-center gap-2.5 text-[20px] font-semibold tracking-[-0.4px] text-[#ffffff]" style={{ fontFamily: "var(--font-v2-display), system-ui, sans-serif" }}>
          <TrackingMark size={30} className="text-[#cbf857]" />
          PR Guard
        </Link>
        <p className="text-[13px] tracking-[0.14em] text-[rgba(255,255,255,0.82)] uppercase" style={{ fontFamily: "var(--font-v2-mono), ui-monospace, monospace" }}>
          / 404 — NO SUCH ROUTE
        </p>
        <h1 className="max-w-[24ch] text-[56px] leading-[1.05] font-semibold tracking-[-1.5px] max-sm:text-[34px] max-sm:tracking-[-0.8px]" style={{ fontFamily: "var(--font-v2-display), system-ui, sans-serif" }}>
          There is nothing at this path.
        </h1>
        <p
          className="rounded-full border border-[rgba(255,255,255,0.45)] px-4 py-2 text-[12.5px] text-[#ffffff] backdrop-blur-[16px]"
          style={{ background: "linear-gradient(160deg, rgba(10,31,68,.62), rgba(12,38,82,.5))", fontFamily: "var(--font-v2-mono), ui-monospace, monospace" }}
        >
          GET {pathname || "/"} · 404
        </p>
        <Link
          href="/#proof"
          className="group inline-flex h-12 items-center gap-4 rounded-full bg-[#cbf857] py-1 pr-1 pl-7 text-[14px] tracking-[1.68px] text-[#131313] uppercase transition-colors hover:bg-[#d6fb77]"
          style={{ fontFamily: "var(--font-v2-mono), ui-monospace, monospace" }}
        >
          Back to the home page
          <span className="grid size-10 place-items-center rounded-full bg-[#0a0a0a] text-[#ffffff] transition-transform duration-300 group-hover:rotate-45" aria-hidden>
            <ArrowUpRight size={18} strokeWidth={2} />
          </span>
        </Link>
      </div>
    </div>
  );
}
