// OWNER: t9a (wave 2). Plan A3 / D2: nine of the blueprint's routes are not
// built for the hackathon beta. Every one of them renders this instead of a
// stub — the section-index grammar (design §4.4), no registration marks (this
// is an ordinary panel, not an evidence frame: <Surface> + <IndexStrip> /
// <ProvenanceStrip>, never <Exhibit>), and the exact mono line the brief and
// plan §13 A3 both specify verbatim: "not built for the beta". Stating a
// limitation plainly is the voice (brand-gaps §F), not an apology, so there is
// no illustration and no "Oops!" — and a link to every route that IS built.
import Link from 'next/link';
import { IndexStrip, ProvenanceStrip, Surface } from '@/components/chrome';
import { APP_NAV_ITEMS } from './routes';

export interface BetaNotFoundProps {
  /** The requested path, e.g. "/runs", "/settings/members" — named in the index and the provenance line. */
  route: string;
}

export function BetaNotFound({ route }: BetaNotFoundProps) {
  return (
    <section className="mx-auto max-w-[720px] px-4 py-16 md:px-8" data-beta-not-found={route}>
      <Surface as="figure" elevation={2} variant="panel">
        <IndexStrip as="figcaption" index="404" category="Beta" identifier={route} />
        <div className="flex flex-col gap-5 p-6">
          <p className="type-data text-text-body">not built for the beta</p>
          <nav aria-label="Routes built for the beta">
            <p className="type-label mb-2 text-text-dim">What exists</p>
            <ul className="flex flex-col gap-1.5">
              {APP_NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="link-draw type-body text-signal-text">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <ProvenanceStrip source={`GET ${route}`} />
      </Surface>
    </section>
  );
}
