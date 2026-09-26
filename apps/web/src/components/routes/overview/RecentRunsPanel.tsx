"use client";
// OWNER: d5 (wave 3). /overview band 1 — recent runs (dashboard blueprint §2.1,
// brief). `useReviewList()` is plan A11's hand-written extension: the endpoint
// does not exist in the backend, so this panel's provenance always marks it
// `ext` regardless of fixture vs. live mode (src/api/ext.ts's own header).
// Ordinary panel, not an evidence frame (plan §2 hard rule 1): Surface +
// IndexStrip + ProvenanceStrip, no registration marks.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GateChip } from "@/components/badges";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { EmptyState, ErrorState, LoadingState, useListKeys } from "@/components/app-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReviewListItem } from "@/lib/api-types";
import { useReviewList } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { countsSummary, formatDurationSeconds, formatUsd, formatWhen, repoPr } from "./format";

const RUN_LIST_LIMIT = 8;

export interface RecentRunsPanelProps {
  compact: boolean;
  className?: string;
}

export function RecentRunsPanel({ compact, className }: RecentRunsPanelProps) {
  const router = useRouter();
  const query = useReviewList({ limit: RUN_LIST_LIMIT });
  const items = query.data?.items ?? [];
  const { gridProps, rowProps } = useListKeys({
    count: items.length,
    onOpen: (i) => router.push(`/runs/${items[i].review_id}`),
  });

  return (
    <Surface elevation={2} variant="panel" className={cn("prg-recent-runs flex flex-col gap-3 p-4", className)}>
      <IndexStrip index="01" category="Recent runs" meta={<span className="type-chip tabular text-text-dim">{`n = ${query.data?.totals.matched ?? items.length}`}</span>} />
      {query.isPending ? (
        <LoadingState rows={RUN_LIST_LIMIT} density={compact ? "compact" : "full"} label="Loading recent runs." />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          message="No reviews yet. PRGuard reviews a pull request when GitHub sends a webhook, or on demand."
          actions={[{ label: "Run a review on a seeded PR", href: "/#run" }]}
        />
      ) : (
        <Table density={compact ? "compact" : "default"} {...gridProps} aria-label="Recent runs">
          <TableHeader>
            <TableRow>
              <TableHead>Repo · PR</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Gate</TableHead>
              <TableHead>Counts</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <RunRow key={item.review_id} item={item} {...rowProps(i)} />
            ))}
          </TableBody>
        </Table>
      )}
      <ProvenanceStrip source={`GET /v1/reviews?limit=${RUN_LIST_LIMIT} → items`} ext />
    </Surface>
  );
}

function RunRow({
  item,
  ...rowProps
}: {
  item: ReviewListItem;
} & ReturnType<ReturnType<typeof useListKeys>["rowProps"]>) {
  const href = `/runs/${item.review_id}`;
  return (
    <TableRow {...rowProps}>
      <TableCell className="tabular">
        <Link href={href} className="link-draw">
          {repoPr(item)}
        </Link>
      </TableCell>
      <TableCell kind="prose" className="max-w-80 truncate">
        {item.pull_request.title ?? NO_TITLE}
      </TableCell>
      <TableCell>
        <GateChip conclusion={item.gate_conclusion} />
      </TableCell>
      <TableCell className="tabular">{countsSummary(item.counts)}</TableCell>
      <TableCell className="tabular">{formatUsd(item.cost_usd_estimate)}</TableCell>
      <TableCell className="tabular">{formatDurationSeconds(item.duration_seconds)}</TableCell>
      <TableCell className="tabular">
        <time dateTime={formatWhen(item.created_at)}>{formatWhen(item.created_at)}</time>
      </TableCell>
    </TableRow>
  );
}

const NO_TITLE = "(untitled pull request)";
