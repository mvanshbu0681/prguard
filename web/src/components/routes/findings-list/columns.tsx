"use client";
// OWNER: d2 (wave 3). /findings' column set (brief TABLE spec, dashboard §2.6,
// §5.5): severity, score, title, location, proof, status, blocking,
// repository#PR, fingerprint, created — in that fixed order. @tanstack/react-table
// owns the column model; every cell composes an already-built component
// (ContributionBar, ProofChip, StatusBadge, GateChip) rather than redrawing
// their encodings.
import { createColumnHelper, type Table } from "@tanstack/react-table";
import { ContributionBar } from "@/components/evidence/ContributionBar";
import { GateChip, ProofChip, StatusBadge } from "@/components/badges";
import type { Finding } from "@/lib/api-types";
import type { RepoLookupEntry } from "./format";
import { findingScoreText, middleTruncateLocation, relativeAge, shortFingerprint, toSeverityWeights, NO_VALUE } from "./format";

/** Extra context every cell needs beyond its own row — threaded through react-table's `meta` (its documented escape hatch for exactly this). */
export interface FindingsTableMeta {
  repoLookup: Map<string, RepoLookupEntry>;
}

export function tableMeta(table: Table<Finding>): FindingsTableMeta {
  return table.options.meta as FindingsTableMeta;
}

const columnHelper = createColumnHelper<Finding>();

/** Column widths, px — a fixed <colgroup> so virtualized rows never reflow independently of the header (design §5.5's "columns refuse to shrink" rule, applied deliberately here instead of fought). */
export const COLUMN_WIDTHS = {
  severity: 108,
  score: 72,
  title: 320,
  location: 240,
  proof: 128,
  status: 132,
  blocking: 96,
  repository: 156,
  fingerprint: 96,
  created: 72,
} as const;

export const findingsColumns = [
  columnHelper.accessor((f) => f.severity?.score ?? -1, {
    id: "severity",
    header: "Severity",
    meta: { width: COLUMN_WIDTHS.severity },
    cell: ({ row }) => {
      const severity = row.original.severity;
      if (!severity) return <span className="type-data text-text-dim">{NO_VALUE}</span>;
      return <ContributionBar density="glyph" score={severity.score} inputs={severity.inputs} weights={toSeverityWeights(severity.weights)} band={severity.band} />;
    },
  }),
  columnHelper.display({
    id: "score",
    header: "Score",
    meta: { width: COLUMN_WIDTHS.score },
    cell: ({ row }) => <span className="type-data tabular text-text-body">{findingScoreText(row.original)}</span>,
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: "Title",
    meta: { width: COLUMN_WIDTHS.title },
    cell: ({ getValue }) => (
      <span className="type-small block truncate text-text-primary" title={getValue()}>
        {getValue()}
      </span>
    ),
  }),
  columnHelper.display({
    id: "location",
    header: "Location",
    meta: { width: COLUMN_WIDTHS.location },
    cell: ({ row }) => {
      const { file_path, start_line } = row.original.location;
      const full = start_line != null ? `${file_path}:${start_line}` : file_path;
      return (
        <span className="type-data block truncate text-text-body" title={full}>
          {middleTruncateLocation(file_path, start_line)}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: "proof",
    header: "Proof",
    meta: { width: COLUMN_WIDTHS.proof },
    cell: ({ row }) => <ProofChip status={row.original.proof?.status ?? "not_attempted"} />,
  }),
  columnHelper.accessor("status", {
    id: "status",
    header: "Status",
    meta: { width: COLUMN_WIDTHS.status },
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  }),
  columnHelper.accessor("blocking", {
    id: "blocking",
    header: "Blocking",
    meta: { width: COLUMN_WIDTHS.blocking },
    cell: ({ getValue }) => (getValue() ? <GateChip conclusion="failure" /> : <span className="type-data text-text-dim">{NO_VALUE}</span>),
  }),
  columnHelper.display({
    id: "repository",
    header: "Repository#PR",
    meta: { width: COLUMN_WIDTHS.repository },
    cell: ({ row, table }) => {
      const entry = tableMeta(table).repoLookup.get(row.original.review_id);
      return <span className="type-data truncate text-text-body">{entry?.label ?? NO_VALUE}</span>;
    },
  }),
  columnHelper.accessor("fingerprint", {
    id: "fingerprint",
    header: "Fingerprint",
    meta: { width: COLUMN_WIDTHS.fingerprint },
    cell: ({ getValue }) => <span className="type-data tabular text-text-body">{shortFingerprint(getValue())}</span>,
  }),
  columnHelper.accessor("created_at", {
    id: "created",
    header: "Created",
    meta: { width: COLUMN_WIDTHS.created },
    cell: ({ getValue }) => (
      <span className="type-data tabular text-text-dim" title={getValue()}>
        {relativeAge(getValue())}
      </span>
    ),
  }),
];

export const FINDINGS_COLUMN_COUNT = findingsColumns.length;
