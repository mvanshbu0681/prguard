"use client";
// OWNER: d1 (wave 3). RESULT's "Findings" sub-tab (dashboard §2.5): the run's own findings as
// a compact table — <ContributionBar density="glyph">, <ProofChip>, <StatusBadge>, title,
// file:line — each row linking to /findings/:id (t9's route, out of this track's ownership).
import Link from "next/link";
import { ProofChip, StatusBadge } from "@/components/badges";
import { IndexStrip, ProvenanceLine, Surface } from "@/components/chrome";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContributionBar, toSeverityValues } from "@/components/evidence/ContributionBar";
import type { Finding } from "@/lib/api-types";
import type { GateConclusion } from "@/lib/contracts";
import { NO_VALUE } from "./format";

export interface FindingsTableProps {
  findings: readonly Finding[];
  gateConclusion: GateConclusion | null | undefined;
  provenance: string;
  className?: string;
}

function locationOf(f: Finding): string {
  const line = f.location.start_line ?? f.location.end_line;
  return line != null ? `${f.location.file_path}:${line}` : f.location.file_path;
}

export function FindingsTable({ findings, gateConclusion, provenance, className }: FindingsTableProps) {
  if (findings.length === 0) {
    return (
      <Surface elevation={2} variant="panel" className={className}>
        <IndexStrip index="04" category="FINDINGS" identifier="0" />
        <p className="type-body px-4 py-6 text-text-body">
          Nothing to report. 9 stages ran, 0 findings survived the coordinator, gate {gateConclusion === "success" ? "clear" : NO_VALUE}.
        </p>
        <div className="px-4 pb-3">
          <ProvenanceLine source={provenance} />
        </div>
      </Surface>
    );
  }

  return (
    <Surface elevation={2} variant="panel" className={className}>
      <IndexStrip index="04" category="FINDINGS" identifier={String(findings.length)} />
      <Table density="compact" containerClassName="max-h-[420px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">SEVERITY</TableHead>
            <TableHead className="w-12">PROOF</TableHead>
            <TableHead className="w-24">STATUS</TableHead>
            <TableHead>TITLE</TableHead>
            <TableHead className="w-56">LOCATION</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((f) => (
            // Blocking rows get a 2px --alarm left rail (design §2.6), the same inset-box-shadow
            // technique src/styles/ui.css's own `[data-state="selected"] > :first-child` uses for
            // the (unrelated) row-selection rail — a border on <tr> itself never renders in table
            // layout, so it has to live on the first cell.
            <TableRow key={f.id}>
              <TableCell style={f.blocking ? { boxShadow: "inset 2px 0 0 var(--alarm)" } : undefined}>
                {f.severity ? (
                  <ContributionBar
                    density="glyph"
                    score={f.severity.score}
                    inputs={f.severity.inputs}
                    weights={toSeverityValues(f.severity.weights)}
                    band={f.severity.band}
                    findingId={f.id}
                  />
                ) : (
                  NO_VALUE
                )}
              </TableCell>
              <TableCell>{f.proof ? <ProofChip status={f.proof.status} /> : NO_VALUE}</TableCell>
              <TableCell>
                <StatusBadge status={f.status} />
              </TableCell>
              <TableCell kind="prose" className="max-w-0 truncate">
                <Link href={`/findings/${f.id}`} className="link-draw text-text-primary">
                  {f.title}
                </Link>
              </TableCell>
              <TableCell className="truncate" title={locationOf(f)}>
                {locationOf(f)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-4 py-3">
        <ProvenanceLine source={provenance} />
      </div>
    </Surface>
  );
}
