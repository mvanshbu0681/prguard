"use client";
// OWNER: d2 (wave 3). /findings — the cross-repo findings list (brief; dashboard
// §2.6). Wires the frozen URL filter state (t2a), the data hooks (t2a),
// wave-2's evidence components (composed, never rebuilt) and the shell's
// states/keys (t9a) into the dense, keyboard-fast table the brief asks for.
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorState, LoadingState, useCompactRowsToggle, useIsMobile } from "@/components/app-shell";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { useFindingFilters, useFindings, useFindingsInfinite } from "@/lib/hooks";
import type { Finding } from "@/lib/api-types";
import { FilterBar } from "./FilterBar";
import { FindingsCards } from "./FindingsCards";
import { FindingsTable } from "./FindingsTable";
import { emptyStateMessage, findingsProvenanceSource } from "./format";
import { useRepoLookup } from "./use-repo-lookup";

export function FindingsListRoute() {
  const router = useRouter();
  const [filters, setFilters] = useFindingFilters();
  const [compact] = useCompactRowsToggle();
  const isMobile = useIsMobile();
  const { lookup: repoLookup } = useRepoLookup();

  const findings = useFindingsInfinite(filters);
  // The corpus total with no filters — the "N" in the filter bar's "n of N"
  // (brief FILTERS: "totals.matched shown as 'n of N'"). limit: 1 keeps the
  // payload to the count, not the rows; totals.matched is independent of it.
  const total = useFindings({ limit: 1 });

  const rows = useMemo<Finding[]>(() => findings.data?.pages.flatMap((page) => page.items ?? []) ?? [], [findings.data]);
  const matched = findings.data?.pages.at(-1)?.totals?.matched;
  const isInitialLoading = findings.isPending;
  const isEmpty = !isInitialLoading && !findings.isError && rows.length === 0;

  function openFinding(finding: Finding) {
    router.push(`/findings/${finding.id}`);
  }

  return (
    <div className="flex min-h-full flex-col" data-route="/findings">
      {/* sticky top-0, not an offset: TopBar/OfflineBanner/MobileBanner are AppShell's own
          siblings of #main (AppShell.tsx), outside this scroll container, so nothing else
          sticks above this within it. */}
      <FilterBar filters={filters} setFilters={setFilters} matched={matched} total={total.data?.totals?.matched} className="sticky top-0 z-20" />

      <div className="flex flex-1 flex-col gap-3 px-4 py-4 md:px-6">
        {findings.isError ? (
          <ErrorState error={findings.error} onRetry={() => findings.refetch()} />
        ) : isEmpty ? (
          <EmptyState message={emptyStateMessage(filters)} actions={[{ label: "Clear filters", onClick: () => setFilters(null) }]} />
        ) : isMobile ? (
          <Surface elevation={0} variant="panel" className="flex flex-col overflow-hidden" data-slot="findings-panel">
            <IndexStrip index="02" category="Findings" identifier={`${rows.length} loaded`} />
            {isInitialLoading ? (
              <LoadingState rows={6} density={compact ? "compact" : "full"} label="Loading findings." className="px-4" />
            ) : (
              <FindingsCards rows={rows} repoLookup={repoLookup} />
            )}
            <FindingsFooter matched={matched} loaded={rows.length} hasNextPage={!!findings.hasNextPage} isFetchingNextPage={findings.isFetchingNextPage} onLoadMore={() => findings.fetchNextPage()} />
            <ProvenanceStrip source={findingsProvenanceSource(filters)} />
          </Surface>
        ) : (
          <Surface elevation={0} variant="panel" className="flex flex-col overflow-hidden" data-slot="findings-panel">
            <IndexStrip index="02" category="Findings" identifier={`${rows.length} loaded`} />
            <FindingsTable
              rows={rows}
              repoLookup={repoLookup}
              density={compact ? "compact" : "default"}
              isInitialLoading={isInitialLoading}
              hasNextPage={!!findings.hasNextPage}
              isFetchingNextPage={findings.isFetchingNextPage}
              onLoadMore={() => findings.fetchNextPage()}
              onOpenRow={openFinding}
            />
            <FindingsFooter matched={matched} loaded={rows.length} hasNextPage={!!findings.hasNextPage} isFetchingNextPage={findings.isFetchingNextPage} onLoadMore={() => findings.fetchNextPage()} />
            <ProvenanceStrip source={findingsProvenanceSource(filters)} />
          </Surface>
        )}
      </div>
    </div>
  );
}

/** "Showing 1–K of N" + [Load more] — shared by the table and the mobile card list (design §5.5: cursor pagination, explicit, never silent infinite scroll). */
function FindingsFooter({
  matched,
  loaded,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  matched: number | undefined;
  loaded: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-rule-1 px-3 py-2">
      <span className="type-data tabular text-text-dim">
        {matched === undefined ? "…" : `Showing 1–${loaded.toLocaleString()} of ${matched.toLocaleString()}`}
      </span>
      {hasNextPage ? (
        <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
        </Button>
      ) : null}
    </div>
  );
}
