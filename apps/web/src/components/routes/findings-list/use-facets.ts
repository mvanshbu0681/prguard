"use client";
// Exact counts for the summary strip and the status segments, straight from the
// API: each is GET /v1/findings with limit=1, read for totals.matched. Every
// number is true for the whole filtered set, not just the rows loaded so far,
// and composes with any filter the URL carries.
import { PROOF_ENCODING, type ProofKey } from "@/components/dash/kit";
import { useFindings, type FindingFilters } from "@/lib/hooks";
import { SEVERITY_BANDS, type SeverityBand } from "@/lib/contracts";
import { emptyBands, emptyProof, type FindingsSummary } from "./format";
import { STATUS_VIEWS, type StatusView } from "./types";

function useCount(filters: FindingFilters, enabled: boolean): number | undefined {
  const query = useFindings({ ...filters, limit: 1 }, { enabled });
  if (!enabled) return 0;
  return query.data?.totals?.matched;
}

const BAND_ORDER: readonly SeverityBand[] = SEVERITY_BANDS; // ascending: info … critical

/**
 * The composition of the filtered set. `severity_min` is a floor, so a band's
 * count is N(≥ band) − N(≥ next band); bands under the active floor are 0 without
 * a request. A proof outcome or blocking the active filter already excludes is 0 too.
 */
export function useSummaryFacets(base: FindingFilters, total: number | undefined, enabled: boolean): FindingsSummary | undefined {
  const floor = base.severity_min ? BAND_ORDER.indexOf(base.severity_min) : 0;
  // One hook call per band and per proof outcome, in a fixed order (rules of hooks).
  const atLeast = [
    useCount({ ...base, severity_min: "info" }, enabled && floor <= 0),
    useCount({ ...base, severity_min: "low" }, enabled && floor <= 1),
    useCount({ ...base, severity_min: "medium" }, enabled && floor <= 2),
    useCount({ ...base, severity_min: "high" }, enabled && floor <= 3),
    useCount({ ...base, severity_min: "critical" }, enabled && floor <= 4),
  ];
  const proofFilter = typeof base.proof_status === "string" ? [base.proof_status] : [...(base.proof_status ?? [])];
  const allowed = (p: ProofKey) => proofFilter.length === 0 || (proofFilter as string[]).includes(p);
  const byProof = [
    useCount({ ...base, proof_status: "proven" }, enabled && allowed("proven")),
    useCount({ ...base, proof_status: "disproven" }, enabled && allowed("disproven")),
    useCount({ ...base, proof_status: "inconclusive" }, enabled && allowed("inconclusive")),
    useCount({ ...base, proof_status: "skipped_no_env" }, enabled && allowed("skipped_no_env")),
    useCount({ ...base, proof_status: "not_attempted" }, enabled && allowed("not_attempted")),
    useCount({ ...base, proof_status: "not_applicable" }, enabled && allowed("not_applicable")),
  ];
  const blocking = useCount({ ...base, blocking: true }, enabled && base.blocking !== false);

  if (!enabled || total === undefined) return undefined;
  if (atLeast.some((n) => n === undefined) || byProof.some((n) => n === undefined) || blocking === undefined) return undefined;
  const n = atLeast as number[];
  const bands = emptyBands();
  BAND_ORDER.forEach((band, i) => {
    bands[band] = i < floor ? 0 : n[i] - (i + 1 < n.length ? n[i + 1] : 0);
  });
  const proof = emptyProof();
  PROOF_ENCODING.forEach((p, i) => {
    proof[p.key] = byProof[i] as number;
  });
  // A finding with no proof object at all matches no proof_status filter; the API
  // treats it as not attempted, and so does summarize(): fold any remainder there.
  const counted = Object.values(proof).reduce((a, b) => a + b, 0);
  if (counted < total && allowed("not_attempted")) proof.not_attempted += total - counted;
  return { total, bands, unscored: Math.max(0, total - n[floor]), proof, blocking };
}

/** How many findings each status segment would show under the other active filters. */
export function useStatusCounts(base: FindingFilters): Record<StatusView, number | undefined> {
  const counts = {
    published: useCount({ ...base, status: "published" }, true),
    disproven: useCount({ ...base, status: "disproven" }, true),
    suppressed: useCount({ ...base, status: "suppressed" }, true),
    dropped: useCount({ ...base, status: "dropped" }, true),
    proposed: useCount({ ...base, status: "proposed" }, true),
    all: useCount({ ...base, status: null }, true),
  } satisfies Record<(typeof STATUS_VIEWS)[number], number | undefined>;
  return counts;
}
