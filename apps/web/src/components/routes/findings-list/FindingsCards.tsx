"use client";
// OWNER: d2 (wave 3). /findings below 768px: the shell's read-only mode
// (brand-gaps §G, brief MOBILE) — cards instead of the table. Same rows, same
// columns' worth of information, laid out for a thumb instead of a grid.
import Link from "next/link";
import { ContributionBar } from "@/components/evidence/ContributionBar";
import { GateChip, ProofChip, StatusBadge } from "@/components/badges";
import { Surface } from "@/components/chrome";
import type { Finding } from "@/lib/api-types";
import { findingScoreText, middleTruncateLocation, relativeAge, shortFingerprint, toSeverityWeights, NO_VALUE, type RepoLookupEntry } from "./format";

export interface FindingsCardsProps {
  rows: Finding[];
  repoLookup: Map<string, RepoLookupEntry>;
}

function FindingCard({ finding, repoLabel }: { finding: Finding; repoLabel: string }) {
  return (
    <Surface
      as={Link}
      href={`/findings/${finding.id}`}
      elevation={2}
      variant="card"
      interactive
      className="flex flex-col gap-2 no-underline"
      style={finding.blocking ? { boxShadow: "inset 2px 0 0 var(--alarm), inset 0 1px 0 var(--inset-hi)" } : undefined}
      data-slot="finding-card"
    >
      <div className="flex items-center justify-between gap-2">
        {finding.severity ? (
          <ContributionBar density="glyph" score={finding.severity.score} inputs={finding.severity.inputs} weights={toSeverityWeights(finding.severity.weights)} band={finding.severity.band} />
        ) : (
          <span className="type-data text-text-dim">{NO_VALUE}</span>
        )}
        <span className="type-data tabular text-text-dim">{relativeAge(finding.created_at)}</span>
      </div>
      <p className="type-small text-text-primary">{finding.title}</p>
      <p className="type-data truncate text-text-body" title={`${finding.location.file_path}:${finding.location.start_line ?? ""}`}>
        {middleTruncateLocation(finding.location.file_path, finding.location.start_line, 44)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ProofChip status={finding.proof?.status ?? "not_attempted"} />
        <StatusBadge status={finding.status} />
        {finding.blocking ? <GateChip conclusion="failure" /> : null}
      </div>
      <div className="flex items-center justify-between type-data text-text-dim">
        <span className="truncate">{repoLabel}</span>
        <span className="tabular">{shortFingerprint(finding.fingerprint)}</span>
      </div>
      <span className="type-data tabular text-text-dim">score {findingScoreText(finding)}</span>
    </Surface>
  );
}

export function FindingsCards({ rows, repoLookup }: FindingsCardsProps) {
  return (
    <ul className="flex flex-col gap-2 px-4 py-3" data-slot="findings-cards">
      {rows.map((finding) => (
        <li key={finding.id}>
          <FindingCard finding={finding} repoLabel={repoLookup.get(finding.review_id)?.label ?? NO_VALUE} />
        </li>
      ))}
    </ul>
  );
}
