// OWNER: m5 (wave 3). Section 07's LEFT panel — the fingerprint (landing-blueprint §07
// "LEFT PANEL — the fingerprint"; plan M3). A server component: every value here is
// read once in app/(marketing)/_sections/07-record.tsx from the fixture loaders and
// handed down as plain data, so this file needs no "use client" of its own (the two
// interactive leaves — <CopyableHash> and the badge chips — are client components, and
// a server component may render those directly).
//
// The argument (plan A9/A10, this track's brief): identity is
// `sha256(category | rule_key | symbol_path | shape_hash)` (docs/specs/…v1-spec.md
// line 244). None of those four inputs is a line number, so a finding that reappears
// after its lines drift keeps the same fingerprint. The real corpus has exactly this:
// the proven finding (manifest ids.proven_finding_id) and the finding the superseded
// run raised first (`history.first_seen_run_id`) share one fingerprint, one file, one
// symbol_path — and different line ranges, different severity inputs, different proof
// status, because everything BUT identity did move. That is the demonstration; nothing
// here is invented (plan A7).
import { ProofChip, SeverityMeter, StatusBadge } from "@/components/badges";
import { Exhibit } from "@/components/chrome";
import type { FindingStatus, ProofStatus, SeverityBand } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { CopyableHash } from "./CopyableHash";
import { formatExpiry, formatIsoDate, formatLineRange, occurrenceCaption, occurrenceCountPhrase, symbolName } from "./format";

export interface OccurrenceView {
  reviewId: string;
  prNumber: number;
  prTitle: string | null;
  runStatus: string;
  gateConclusion: string | null;
  createdAt: string;
  filePath: string;
  symbolPath: string;
  startLine: number;
  endLine: number;
  findingStatus: FindingStatus;
  proofStatus: ProofStatus;
  severityScore: number;
  severityBand: SeverityBand;
  blocking: boolean;
}

export interface LedgerRowView {
  seq: number;
  state: "suppressed" | "revoked";
  scope: string;
  matchPath: string | null;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface IdentityPanelProps {
  fingerprint: string;
  findingId: string;
  ruleKey: string;
  occurrences: OccurrenceView[];
  ledgerRows: LedgerRowView[];
}

function OccurrenceRow({ occurrence }: { occurrence: OccurrenceView }) {
  const o = occurrence;
  return (
    <li className="border-b border-rule-1 py-3 first:pt-0 last:border-b-0 last:pb-0" data-anim>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="type-label text-text-dim">
          PR #{o.prNumber} · review {o.reviewId.slice(0, 8)}
        </span>
        <time dateTime={o.createdAt} className="type-micro text-text-dim">
          {formatIsoDate(o.createdAt)}
        </time>
      </div>
      <p className="type-data mt-1 text-text-body">
        {o.filePath}
        <span className="text-text-dim">::{symbolName(o.symbolPath)}</span>{" "}
        <span className="text-text-dim">line {formatLineRange(o.startLine, o.endLine)}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusBadge status={o.findingStatus} />
        <ProofChip status={o.proofStatus} />
        <SeverityMeter score={o.severityScore} band={o.severityBand} density="inline" />
        {o.blocking ? <span className="type-label text-alarm-text">blocks merge</span> : null}
      </div>
      <p className="type-small mt-1.5 text-text-dim">{occurrenceCaption(o)}</p>
    </li>
  );
}

function LedgerRow({ row }: { row: LedgerRowView }) {
  const revoked = row.state === "revoked";
  return (
    <li className="border-b border-rule-1 py-2.5 first:pt-0 last:border-b-0 last:pb-0" data-anim>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="type-data w-12 shrink-0 tabular text-text-dim">seq {row.seq}</span>
        <span className={cn("type-chip uppercase", revoked ? "text-text-dim line-through" : "text-signal-text")}>
          {revoked ? "revoked" : "suppressed"}
        </span>
        <span className="type-micro text-text-dim">
          scope: {row.scope}
          {row.matchPath ? ` · ${row.matchPath}` : ""}
        </span>
      </div>
      <p className={cn("type-small mt-1", revoked ? "text-text-dim line-through" : "text-text-body")}>{row.reason}</p>
      <p className="type-micro mt-1 text-text-dim">
        {revoked && row.revokedAt ? `revoked ${formatIsoDate(row.revokedAt)}` : formatExpiry(row.expiresAt)}
        {row.createdBy ? ` · ${row.createdBy}` : ""}
      </p>
    </li>
  );
}

export function IdentityPanel({ fingerprint, findingId, ruleKey, occurrences, ledgerRows }: IdentityPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <Exhibit
        index="07"
        category="Fingerprint & history"
        identifier={ruleKey}
        provenance={`GET /v1/findings/${findingId.slice(0, 8)} → fingerprint · history`}
        padded
      >
        <ol className="flex flex-col">
          {occurrences.map((o) => (
            <OccurrenceRow key={o.reviewId} occurrence={o} />
          ))}
        </ol>
        <div className="mt-4 border-t border-rule-1 pt-3">
          <p className="type-label text-text-dim">fingerprint</p>
          <CopyableHash value={fingerprint} className="mt-1 text-[15px]" />
          <p className="type-micro mt-1 text-text-dim">unchanged across {occurrenceCountPhrase(occurrences.length)}</p>
        </div>
      </Exhibit>

      <Exhibit index="07" category="Suppression ledger" provenance="GET /v1/suppressions" padded>
        <ol className="flex flex-col">
          {ledgerRows.map((row) => (
            <LedgerRow key={row.seq} row={row} />
          ))}
        </ol>
        <p className="type-small mt-3 text-text-dim">A revocation is itself an event. Nothing is ever deleted.</p>
      </Exhibit>
    </div>
  );
}
