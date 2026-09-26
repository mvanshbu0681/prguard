"use client";
// OWNER: d5 (wave 3). /overview band 5 — the demo run surfaced prominently
// (brief: "latest blocking run", linking to /runs/<demo id>). Reads the same
// `useReviewList({ limit: 8 })` RecentRunsPanel and GateOutcomeSection already
// query (React Query dedupes the identical key) and picks out
// DEMO_IDS.demo_review_id rather than a separate fetch — the demo run is
// plan A10's canonical story and, in the fixture corpus, its own most recent
// entry (reviews/index.json is sorted newest-first), so it is always inside
// the same window this page already has loaded. No number here is
// hard-coded: every value is the matching ReviewListItem's own field.
import Link from "next/link";
import { GateBlock } from "@/components/badges";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { LoadingState } from "@/components/app-shell";
import { DEMO_IDS } from "@/lib/demo-ids";
import { useReviewList } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { countsSummary, formatDurationSeconds, formatUsd, repoPr } from "./format";

const RUN_LIST_LIMIT = 8;

export function DemoRunPanel({ className }: { className?: string }) {
  const query = useReviewList({ limit: RUN_LIST_LIMIT });

  if (query.isPending) return <LoadingState rows={2} label="Loading the demo run." className={className} />;
  if (query.isError || !query.data) return null;

  const item = query.data.items.find((i) => i.review_id === DEMO_IDS.demo_review_id);
  if (!item) return null;

  const href = `/runs/${item.review_id}`;

  return (
    <Surface elevation={3} variant="card" className={cn("prg-demo-run flex flex-col gap-4 md:flex-row md:items-center md:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        <IndexStrip index="05" category="Latest blocking run" />
        <Link href={href} className="type-display-h4 text-text-primary link-draw">
          {repoPr(item)} — {item.pull_request.title ?? "(untitled pull request)"}
        </Link>
        <p className="type-small text-text-body">{countsSummary(item.counts)}</p>
        <p className="type-chip tabular text-text-dim">
          {formatUsd(item.cost_usd_estimate)} · {formatDurationSeconds(item.duration_seconds)}
        </p>
        <ProvenanceStrip source={`GET /v1/reviews?limit=${RUN_LIST_LIMIT} → items[review_id = ${DEMO_IDS.demo_review_id.slice(0, 8)}]`} ext />
      </div>
      <Link href={href} aria-label={`Open the run for ${repoPr(item)}`}>
        <GateBlock conclusion={item.gate_conclusion} blocking={item.counts.blocking} announce={false} />
      </Link>
    </Surface>
  );
}
