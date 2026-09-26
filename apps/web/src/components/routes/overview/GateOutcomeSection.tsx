"use client";
// OWNER: d5 (wave 3). /overview band 2 — gate outcomes "over those runs"
// (brief: the same limit=8 recent-runs list RecentRunsPanel renders, tallied
// into <GateOutcomeBar>'s three counts). GET /v1/reviews has no `window`
// filter (plan A11's ext.ts — repository/status/gate_conclusion/limit/cursor
// only), so this reads the same list rather than inventing a "7 days" the API
// cannot serve. Same aggregation /lab/t10 uses over reviews/index.json
// (gateCountsFromReviews): a run with no verdict yet (running, `null`) reads
// as neutral, same as GateChip's undecided state. React Query dedupes this
// against RecentRunsPanel's identical `{ limit: 8 }` query — one fetch, two
// panels, no prop-drilling between two independently composable pieces.
import { GateOutcomeBar } from "@/components/charts";
import { LoadingState } from "@/components/app-shell";
import type { ReviewListItem } from "@/lib/api-types";
import { useReviewList } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const RUN_LIST_LIMIT = 8;

function gateCounts(items: Pick<ReviewListItem, "gate_conclusion">[]) {
  let runsRed = 0;
  let runsGreen = 0;
  let runsNeutral = 0;
  for (const item of items) {
    if (item.gate_conclusion === "failure") runsRed += 1;
    else if (item.gate_conclusion === "success") runsGreen += 1;
    else runsNeutral += 1;
  }
  return { runsRed, runsGreen, runsNeutral };
}

export function GateOutcomeSection({ className }: { className?: string }) {
  const query = useReviewList({ limit: RUN_LIST_LIMIT });

  if (query.isPending) return <LoadingState rows={1} label="Loading gate outcomes." className={className} />;
  // A load failure here is not worth its own error frame — RecentRunsPanel
  // (reading the identical query) already surfaces the endpoint and the retry.
  if (query.isError || !query.data) return null;

  const counts = gateCounts(query.data.items);
  return (
    <GateOutcomeBar
      index="02"
      runsRed={counts.runsRed}
      runsGreen={counts.runsGreen}
      runsNeutral={counts.runsNeutral}
      provenance={`GET /v1/reviews?limit=${RUN_LIST_LIMIT} → items[].gate_conclusion (aggregated)`}
      ext
      className={cn(className)}
    />
  );
}
