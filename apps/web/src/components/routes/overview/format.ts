// OWNER: d5 (wave 3). Pure formatting helpers for /overview's recent-runs
// table — no component in @/components/charts or @/components/badges prints
// a cost or a duration, so this route owns the small amount of formatting
// logic those two columns need. Every value is printed as received (or "—"
// when the field is null, e.g. a still-running run has no duration or cost
// yet) — never an invented placeholder number (plan §13 A7, brand-gaps §D).
import type { ReviewListItem } from "@/lib/api-types";

/** No value yet (a live run, or a field the fixture leaves null). Never a dash-less blank. */
export const NO_VALUE = "—";

/** `cost_usd_estimate` printed to 4 decimals (the precision the fixture corpus stores), tabular. */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_VALUE;
  return `$${value.toFixed(4)}`;
}

/** `duration_seconds` printed to 1 decimal with its unit, tabular. */
export function formatDurationSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_VALUE;
  return `${value.toFixed(1)}s`;
}

/** ISO 8601 UTC, seconds precision, Z suffix — the product's numeric date style (brand-gaps §D), never a fuzzy "2h ago". */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return NO_VALUE;
  return iso.replace(/\.\d+Z$/, "Z");
}

/** `owner/name#123`, the same short form DEMO_SHORT.pullRequest uses. */
export function repoPr(item: Pick<ReviewListItem, "repository" | "pull_request">): string {
  return `${item.repository.owner}/${item.repository.name}#${item.pull_request.number}`;
}

/** `3 published · 1 blocking`, or just `3 published` when nothing is blocking — never a bare number with no label. */
export function countsSummary(counts: ReviewListItem["counts"]): string {
  const published = counts.published ?? 0;
  const blocking = counts.blocking ?? 0;
  return blocking > 0 ? `${published} published · ${blocking} blocking` : `${published} published`;
}
