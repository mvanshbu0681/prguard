"use client";
// OWNER: d3 (wave 3). The 48px sticky mini-header that never scrolls away
// (dashboard-blueprint §2.7): severity readout, proof chip, fingerprint
// click-to-copy, gate impact, [Suppress s] [Export evidence e]. `sticky top-0`
// is relative to <main>'s own scroll container (app-shell's AppShell.tsx: the
// TopBar sits outside <main> in the flex column, so <main> is the nearest
// scrolling ancestor and needs no extra offset).
import { ProofChip, formatScore } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { consequence, CONSEQUENCE_TEXT_CLASS } from "@/components/evidence/ProofBench";
import { cn } from "@/lib/utils";
import type { Finding } from "@/lib/api-types";
import { CopyableValue } from "./CopyableValue";

export interface StickyMiniHeaderProps {
  finding: Finding;
  onSuppress: () => void;
  onExport: () => void;
  suppressed: boolean;
}

export function StickyMiniHeader({ finding, onSuppress, onExport, suppressed }: StickyMiniHeaderProps) {
  const impact = consequence(finding.proof?.status ?? "not_attempted", finding.blocking);
  return (
    <div
      data-slot="finding-sticky-header"
      className="sticky top-0 z-20 -mx-4 flex h-12 items-center gap-2 overflow-hidden border-b border-rule-1 bg-ink-1/92 px-4 backdrop-blur-[16px] sm:gap-4 md:-mx-8 md:px-8"
    >
      <span className="type-readout shrink-0 text-text-primary" title="severity score">
        {finding.severity ? formatScore(finding.severity.score) : "—"}
        {/* The band letter alone at <640px (matches the findings-list glyph density); the full word from sm up. */}
        {finding.severity ? <span className="ml-1.5 type-label text-text-dim sm:ml-2">{finding.severity.band.toUpperCase().slice(0, 1)}</span> : null}
      </span>
      {finding.proof ? <ProofChip status={finding.proof.status} /> : null}
      {finding.fingerprint ? (
        <CopyableValue
          label="fingerprint"
          display={`${finding.fingerprint.slice(0, 8)}…${finding.fingerprint.slice(-4)}`}
          full={finding.fingerprint}
          className="hidden sm:inline-flex"
        />
      ) : null}
      <span className={cn("type-data hidden truncate lg:inline", CONSEQUENCE_TEXT_CLASS[impact.tone])}>{impact.text}</span>
      <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Button variant={suppressed ? "quiet" : "ghost"} size="sm" onClick={onSuppress} aria-disabled={suppressed} aria-label={suppressed ? "Suppressed" : "Suppress"}>
          <span aria-hidden="true">{suppressed ? "SUPPRESSED" : "SUPPRESS"}</span>
          <Kbd className="ml-1.5 hidden sm:inline">S</Kbd>
        </Button>
        <Button variant="ghost" size="sm" onClick={onExport} aria-label="Export evidence">
          <span aria-hidden="true" className="sm:hidden">
            EXPORT
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            EXPORT EVIDENCE
          </span>
          <Kbd className="ml-1.5 hidden sm:inline">E</Kbd>
        </Button>
      </div>
    </div>
  );
}
