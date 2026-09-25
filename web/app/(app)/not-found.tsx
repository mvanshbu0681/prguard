'use client';
// OWNER: t9a (wave 2). The dashboard's 404 (brand-gaps §F): Lockup C, --ink-0,
// graph paper, no grain — no illustration, no "Oops!", no search box, no
// sitemap. The provenance footer prints the path that was actually requested
// and the status code, same device as every evidence frame, applied to a
// failure. §F's own example CTA ("← BACK TO THE PROOF BENCH") targets the
// marketing site's pinned section; the dashboard has no such section, so the
// ghost CTA here returns to /overview instead — the one adaptation this track
// made to the copy, flagged under `raised`.
//
// usePathname (not a route param: not-found.tsx receives none) is what makes
// the requested path printable, so this is a Client Component.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lockup } from '@/components/brand';
import { GraphPaper, ProvenanceLine } from '@/components/chrome';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const pathname = usePathname();
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center bg-ink-0 px-4">
      <GraphPaper aria-hidden="true" className="absolute inset-0" />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <p className="type-label text-text-dim">/ 404 — NO SUCH ROUTE</p>
        <Lockup variant="C" />
        <p className="type-body max-w-(--measure-body) text-text-body">There is nothing at this path.</p>
        <Button asChild variant="ghost">
          <Link href="/overview">← BACK TO OVERVIEW</Link>
        </Button>
      </div>
      <div className="relative z-10 mt-16">
        <ProvenanceLine source={`GET ${pathname} · 404`} />
      </div>
    </div>
  );
}
