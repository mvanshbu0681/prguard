// A path the beta knows about but has not built: says so in one mono line,
// names the request, and links to every page that does exist.
import { ArrowUpRight, Construction } from 'lucide-react';
import Link from 'next/link';
import { Card, Eyebrow } from '@/components/dash/kit';
import { APP_NAV_ITEMS } from './routes';

export interface BetaNotFoundProps {
  /** The requested path, e.g. "/cost", "/settings/members" — named in the header and the footer. */
  route: string;
}

export function BetaNotFound({ route }: BetaNotFoundProps) {
  return (
    <section className="mx-auto w-full max-w-[760px] px-4 py-16 md:px-8" data-beta-not-found={route}>
      <Card tone="surface" pad="lg" className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <span className="grid size-12 flex-none place-items-center rounded-w-pill bg-w-lime text-w-on-lime" aria-hidden>
            <Construction size={20} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <Eyebrow>Beta · {route}</Eyebrow>
            <h1 className="mt-2 font-w-display text-[26px] font-semibold tracking-[-0.6px] text-w-text">This page is on its way</h1>
            <p className="mt-1 font-w-mono text-[13px] text-w-muted">not built for the beta</p>
          </div>
        </div>
        <nav aria-label="Routes built for the beta">
          <p className="mb-3 text-[13px] font-medium text-w-muted">What exists</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {APP_NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex h-12 items-center justify-between rounded-w-tile bg-w-surface-2 px-4 text-[14px] font-medium text-w-text transition-colors hover:bg-w-surface-3"
                >
                  {item.label}
                  <ArrowUpRight size={16} strokeWidth={1.9} className="text-w-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="font-w-mono text-[12px] text-w-subtle">GET {route} · 404</p>
      </Card>
    </section>
  );
}
