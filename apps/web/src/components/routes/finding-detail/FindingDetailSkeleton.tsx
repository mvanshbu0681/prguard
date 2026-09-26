// OWNER: d3 (wave 3). Loading grammar for /findings/[id] (dashboard §2.0):
// "Each section renders its header strip and provenance footer immediately,
// with a body skeleton at the section's known height. The sticky mini-header
// renders last (it needs the score) and reserves its 48px." The seven section
// labels below are fixed by the route's own layout, not by data, so they are
// legitimately static here — nothing in this file is a value a fixture or API
// field would otherwise provide.
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { LoadingState } from "@/components/app-shell";

const SECTIONS: { index: string; category: string; rows: number }[] = [
  { index: "01", category: "Claim", rows: 4 },
  { index: "02", category: "Location", rows: 6 },
  { index: "03", category: "Why this score", rows: 5 },
  { index: "04", category: "Proof", rows: 6 },
  { index: "05", category: "Delivery", rows: 3 },
  { index: "06", category: "Identity", rows: 4 },
  { index: "07", category: "Audit", rows: 5 },
];

export function FindingDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Reserves the 48px the sticky mini-header takes once the score is known. */}
      <div aria-hidden="true" className="h-12" />
      <div className="flex flex-col gap-3 pb-2">
        <div className="h-4 w-24 animate-none rounded-[2px] bg-ink-2" />
        <div className="h-9 w-3/4 max-w-(--measure-body) rounded-[2px] bg-ink-2" />
        <div className="h-4 w-1/2 rounded-[2px] bg-ink-2" />
      </div>
      {SECTIONS.map((section) => (
        <Surface key={section.index} as="section" elevation={2} variant="panel" aria-labelledby={`fd-skeleton-${section.index}`}>
          <div className="px-4 pt-4 md:px-6 md:pt-5">
            <IndexStrip index={section.index} category={section.category} labelId={`fd-skeleton-${section.index}`} labelAs="h2" />
          </div>
          <div className="px-4 py-5 md:px-6">
            <LoadingState rows={section.rows} label={`Loading ${section.category.toLowerCase()}.`} />
          </div>
          <div className="px-4 pb-4 md:px-6">
            <ProvenanceStrip source="…" />
          </div>
        </Surface>
      ))}
    </div>
  );
}
