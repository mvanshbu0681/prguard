// OWNER: m4 (wave 3). Pure logic behind section 05's band legend (landing
// blueprint §05: "info < 0.15 · low ≥ 0.15 · medium ≥ 0.35 · high ≥ 0.55 ·
// critical ≥ 0.75"). Every threshold is read from SEVERITY_THRESHOLDS (frozen,
// @/lib/contracts) — never a typed literal — so the legend can never drift
// from the arithmetic <ContributionBar> itself draws on the same axis.
import { SEVERITY_BANDS, SEVERITY_THRESHOLDS, type SeverityBand } from "@/lib/contracts";

export interface BandLegendEntry {
  band: SeverityBand;
  /** "<" for info (it has no floor of its own); "≥" for every band with a threshold. */
  op: "<" | "≥";
  value: number;
}

const THRESHOLD_BAND = SEVERITY_BANDS[1] as Exclude<SeverityBand, "info">;

/** Five entries, SEVERITY_BANDS order: info first (bounded above, not below), then low..critical. */
export function bandLegend(): BandLegendEntry[] {
  return SEVERITY_BANDS.map((band, i) => {
    if (i === 0) return { band, op: "<" as const, value: SEVERITY_THRESHOLDS[THRESHOLD_BAND] };
    return { band, op: "≥" as const, value: SEVERITY_THRESHOLDS[band as Exclude<SeverityBand, "info">] };
  });
}

/** "info < 0.15  ·  low ≥ 0.15  ·  medium ≥ 0.35  ·  high ≥ 0.55  ·  critical ≥ 0.75". */
export function bandLegendText(separator = "  ·  "): string {
  return bandLegend()
    .map((e) => `${e.band} ${e.op} ${e.value}`)
    .join(separator);
}
