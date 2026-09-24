// OWNER: m4 (wave 3). Pure logic behind section 06's delivery ladder (landing
// blueprint §06: the four-rung comment ladder plus "0 silently dropped").
// Every count is read from ReviewResult.delivery.ladder_breakdown and
// ReviewResult.counts (plan A7: no number on any surface is hardcoded) — and
// "silently dropped" is COMPUTED as the gap between counts.published and the
// ladder's own total, never asserted as a literal 0.
import type { Finding, LadderBreakdown, ResultCounts } from "@/lib/api-types";
import { DELIVERY_MODES, type DeliveryMode } from "@/lib/contracts";

export type DeliveryRungMode = Exclude<DeliveryMode, "not_delivered">;

export interface DeliveryRung {
  mode: DeliveryRungMode;
  count: number;
  /** A reason to print beside a rung below the top one — e.g. how far a diff line drifted. */
  note?: string;
}

/** The four rungs, top first — "not_delivered" is not a rung (contracts.ts's own comment). */
export const DELIVERY_RUNG_MODES = DELIVERY_MODES.filter((m): m is DeliveryRungMode => m !== "not_delivered");

/**
 * How far a delivered comment drifted from the finding's own location — only meaningful
 * for inline_nearest, where the diff moved between capture and delivery. Undefined when
 * no delivered finding used that rung, or the location fields it needs are missing.
 */
function driftNote(findings: readonly Finding[]): string | undefined {
  const drifted = findings.find((f) => f.delivery?.mode === "inline_nearest" && f.delivery.delivered_line != null && f.location.end_line != null);
  const delivery = drifted?.delivery;
  const endLine = drifted?.location.end_line;
  if (!delivery?.delivered_line || endLine == null) return undefined;
  const drift = Math.abs(delivery.delivered_line - endLine);
  if (drift <= 0) return undefined;
  return `line drifted ${drift} line${drift === 1 ? "" : "s"} since the diff was captured`;
}

/** Four rows, DELIVERY_RUNG_MODES order, each with the fixture's own count and (inline_nearest only) drift note. */
export function deliveryLadder(ladder: LadderBreakdown | null | undefined, findings: readonly Finding[]): DeliveryRung[] {
  const note = driftNote(findings);
  return DELIVERY_RUNG_MODES.map((mode) => ({ mode, count: ladder?.[mode] ?? 0, note: mode === "inline_nearest" ? note : undefined }));
}

/** counts.published minus every rung's own count — findings that reached no rung at all. Floored at 0. */
export function silentlyDropped(counts: ResultCounts | null | undefined, ladder: LadderBreakdown | null | undefined): number {
  const delivered = DELIVERY_RUNG_MODES.reduce((sum, mode) => sum + (ladder?.[mode] ?? 0), 0);
  return Math.max(0, (counts?.published ?? 0) - delivered);
}
