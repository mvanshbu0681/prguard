// OWNER: d3 (wave 3). The ordinary-panel grammar for the sections of
// /findings/[id] that are not themselves evidence frames (§01 CLAIM, §05
// DELIVERY, §06 IDENTITY): a <Surface> bracketed by <IndexStrip> /
// <ProvenanceStrip> with NO registration marks (chrome/index.ts "Ordinary
// panel"; plan §2 hard rule 1 — marks only through <Exhibit>, only on
// evidence-bearing frames). §03 SEVERITY, §04 PROOF and §07 AUDIT wrap
// THEMSELVES in <Exhibit> (ContributionBar withFrame, ProofBench, ChainRail)
// and never pass through here.
import type { ReactNode } from "react";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";

export interface OrdinaryPanelProps {
  index: string;
  category: string;
  meta?: ReactNode;
  provenance: ReactNode;
  capturedAt?: string;
  children: ReactNode;
  className?: string;
}

export function OrdinaryPanel({ index, category, meta, provenance, capturedAt, children, className }: OrdinaryPanelProps) {
  return (
    <Surface as="section" elevation={2} variant="panel" className={className} aria-labelledby={`fd-${index}`}>
      <div className="px-4 pt-4 md:px-6 md:pt-5">
        <IndexStrip index={index} category={category} meta={meta} labelId={`fd-${index}`} labelAs="h2" />
      </div>
      <div className="px-4 py-5 md:px-6">{children}</div>
      <div className="px-4 pb-4 md:px-6">
        <ProvenanceStrip source={provenance} capturedAt={capturedAt} />
      </div>
    </Surface>
  );
}
