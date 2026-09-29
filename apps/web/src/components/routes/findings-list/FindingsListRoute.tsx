"use client";
// /findings — a triage inbox, not a spreadsheet. The headline carries the live
// count, a three-part summary says what the view is made of, the pill bar
// narrows it, and the list is one composed row per finding. Every control writes
// the URL (use-findings-view.ts), so the view is a link.
//
// Data: server filters go to GET /v1/findings as a cursor-paged infinite query
// (the next page loads as the end of the list nears the viewport, and from the
// footer's button). Search, specialist, sort and grouping are lenses the API
// has no parameter for, so while one is on the route pulls every matching page
// first and applies it in the browser — the numbers on screen always describe
// the whole set, never a prefix of it.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, SearchX } from "lucide-react";
import { ErrorState, useIsMobile } from "@/components/app-shell";
import { Button, EmptyState, Kbd, Page, PageHeader, Rise, Skeleton } from "@/components/dash/kit";
import { useFindingsInfinite } from "@/lib/hooks";
import type { Finding } from "@/lib/api-types";
import { FilterBar } from "./FilterBar";
import { FindingRowSkeleton, FindingsList, findingHref } from "./FindingsList";
import { activeFilterChips, clearFiltersPatch, emptyStateMessage, foldRepeats, groupFindings, headline, narrow, repositoriesOf, sortFindings, summarize } from "./format";
import { SummaryStrip } from "./SummaryStrip";
import { useStatusCounts, useSummaryFacets } from "./use-facets";
import { PAGE_LIMIT, lensActive, serverFilters, useFindingsView } from "./use-findings-view";
import { useRepoLookup } from "./use-repo-lookup";
import s from "./findings.module.css";

const PHONE_PAGE = 20;

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** The list's own count line: what is shown, of how many, and what was folded. */
function footerText(p: {
  isPhone: boolean;
  listed: number;
  rows: number;
  loaded: number;
  matched: number | undefined;
  hasNextPage: boolean;
  folded: number;
  groups: number | undefined;
  group: string;
}): string {
  const repeats = p.folded > 0 ? ` · ${plural(p.folded, "repeat", "repeats")} folded into the latest occurrence` : "";
  if (p.isPhone && (p.listed < p.rows || p.hasNextPage)) {
    return `Showing ${p.listed.toLocaleString("en-US")} of ${(p.hasNextPage ? (p.matched ?? p.rows) : p.rows).toLocaleString("en-US")}${p.hasNextPage ? "" : repeats}`;
  }
  if (p.hasNextPage && p.matched !== undefined) return `Loaded ${p.loaded.toLocaleString("en-US")} of ${p.matched.toLocaleString("en-US")}${repeats}`;
  const where = p.groups ? ` in ${plural(p.groups, p.group === "pr" ? "pull request" : "file", p.group === "pr" ? "pull requests" : "files")}` : "";
  return `${plural(p.rows, "finding", "findings")} shown${where}${repeats}`;
}

export function FindingsListRoute() {
  const router = useRouter();
  const [view, setView] = useFindingsView();
  const { lookup, isLoading: lookupLoading } = useRepoLookup();
  const isPhone = useIsMobile();

  const filters = useMemo(() => serverFilters(view), [view]);
  const findings = useFindingsInfinite({ ...filters, limit: PAGE_LIMIT });
  const loaded = useMemo<Finding[]>(() => findings.data?.pages.flatMap((page) => page.items ?? []) ?? [], [findings.data]);
  const matched = findings.data?.pages.at(-1)?.totals?.matched;
  const lens = lensActive(view);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = findings;
  const allLoaded = !findings.isPending && !hasNextPage;

  // A lens needs the whole set in the browser: pull the remaining pages.
  useEffect(() => {
    if (lens && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [lens, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  // Occurrences (what the API counts) → one row per fingerprint per repository
  // (what the inbox shows) → the chosen order. Folding runs on the API's
  // newest-first order, so the row kept is always the latest occurrence.
  const { q, specialist, sort, group } = view;
  const narrowed = useMemo(() => narrow(loaded, { q, specialist }), [loaded, q, specialist]);
  const rows = useMemo(() => sortFindings(foldRepeats(narrowed, lookup), sort), [narrowed, lookup, sort]);
  const folded = narrowed.length - rows.length;

  // Phones page through the inbox 20 at a time instead of one endless scroll.
  const viewKey = JSON.stringify(view);
  const [phonePage, setPhonePage] = useState({ key: viewKey, shown: PHONE_PAGE });
  if (phonePage.key !== viewKey) setPhonePage({ key: viewKey, shown: PHONE_PAGE });
  const listed = isPhone ? rows.slice(0, phonePage.shown) : rows;
  const groups = useMemo(() => (group === "none" ? null : groupFindings(listed, group, lookup)), [listed, group, lookup]);

  const statusCounts = useStatusCounts(filters);
  const facets = useSummaryFacets(filters, matched, !lens);
  const summary = lens ? (allLoaded ? summarize(narrowed) : undefined) : facets;
  const count = lens ? (allLoaded ? narrowed.length : undefined) : matched;
  const hasFilters = activeFilterChips(view).length > 0;
  const head = count === undefined ? null : headline(view.status, count, summary?.proof.proven, hasFilters);

  function showMoreOnPhone() {
    const next = phonePage.shown + PHONE_PAGE;
    setPhonePage({ key: viewKey, shown: next });
    if (next > rows.length && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }

  const onReachEnd = useCallback(() => {
    if (!lens && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [lens, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const repositories = useMemo(() => repositoriesOf(lookup), [lookup]);
  const waiting = findings.isPending || lookupLoading || (lens && !allLoaded);

  let body;
  if (isError) {
    body = <ErrorState error={findings.error} onRetry={() => findings.refetch()} />;
  } else if (waiting) {
    body = (
      <div className={s.list} aria-busy="true" aria-label="Loading findings">
        {Array.from({ length: 7 }, (_, i) => (
          <FindingRowSkeleton key={i} />
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className={s.list}>
        <EmptyState
          icon={SearchX}
          title={hasFilters ? "Nothing matches these filters" : "Nothing here yet"}
          body={emptyStateMessage(view)}
          action={
            hasFilters ? (
              <Button variant="dark" size="sm" onClick={() => setView(clearFiltersPatch())}>
                Clear filters
              </Button>
            ) : view.status !== "all" ? (
              <Button variant="outline" size="sm" onClick={() => setView({ status: "all" })}>
                Show every status
              </Button>
            ) : null
          }
        />
      </div>
    );
  } else {
    body = (
      <FindingsList
        rows={listed}
        groups={groups}
        lookup={lookup}
        showState={view.status === "all"}
        onOpen={(f) => router.push(findingHref(f))}
        onReachEnd={isPhone ? undefined : onReachEnd}
        footer={
          <div className={s.foot}>
            <span>{footerText({ isPhone, listed: listed.length, rows: rows.length, loaded: loaded.length, matched, hasNextPage: !!hasNextPage, folded, groups: groups?.length, group })}</span>
            {isPhone && (listed.length < rows.length || hasNextPage) ? (
              <Button variant="secondary" size="sm" icon={ChevronDown} onClick={showMoreOnPhone} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading" : "Show more"}
              </Button>
            ) : !isPhone && hasNextPage && !lens ? (
              <Button variant="secondary" size="sm" icon={ChevronDown} onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading" : "Load more"}
              </Button>
            ) : (
              <span className={s.keys}>
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> to move <Kbd>↵</Kbd> to open <Kbd>/</Kbd> to search
              </span>
            )}
          </div>
        }
      />
    );
  }

  return (
    <Page className="gap-7">
      <PageHeader eyebrow="Findings" title={head ? head.title : <Skeleton className="inline-block h-9 w-[420px] max-w-full align-middle" />} soft={head?.soft ?? undefined} />
      <Rise delay={60}>
        <SummaryStrip summary={summary} status={view.status} blockingOnly={view.blocking === true} onToggleBlocking={() => setView({ blocking: view.blocking === true ? null : true })} />
      </Rise>
      <Rise delay={120} className="flex flex-col gap-4">
        <FilterBar view={view} setView={setView} statusCounts={statusCounts} repositories={repositories} lookup={lookup} />
        {body}
      </Rise>
    </Page>
  );
}
