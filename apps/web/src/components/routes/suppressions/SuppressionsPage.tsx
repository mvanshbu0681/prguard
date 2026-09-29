"use client";
// /suppressions — the governance ledger. A suppression is the governed way a person
// tells Witness "don't raise this again": it names a scope, a reason and an author,
// may expire, and revoking it is itself recorded. The page answers two jobs:
//   1. posture (the bento): how much is silenced, why, how widely, by whom, and
//      what is open-ended — so a lead can see whether silencing is healthy;
//   2. the ledger: every row, newest first, with the finding it silenced, its
//      exact target, the reason in full, and a link to its seq on the audit chain.
//
// Filters live in the URL so a view is a shareable link. `repository`, `scope`,
// `active` and `fingerprint` are the API's own (useSuppressionFilters — the
// findings page deep-links here with ?fingerprint=); `state` (expired | revoked)
// and `q` (free-text search) are this page's refinements on top, applied client-side.
import { ChevronDown, FolderGit2, Link2, Search, ShieldCheck, X } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/app-shell";
import { CORPUS_NOW } from "@/components/dash/format";
import { Button, EmptyState, Page, PageHeader, Rise, SectionHeader, Segmented, Skeleton, TextField } from "@/components/dash/kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SuppressionScope } from "@/lib/contracts";
import { FIXTURES } from "@/lib/env";
import { useAudit, useFindings, useReviewList, useSuppressionFilters, useSuppressions } from "@/lib/hooks";
import { SCOPE_LABEL, SCOPE_ORDER, shortHash } from "./format";
import { buildEntries, findingsBySuppression, indexAudit, matchesSearch, summarize, type AuditIndex } from "./ledger-model";
import { LedgerEntryCard } from "./LedgerEntryCard";
import { LedgerSummary } from "./LedgerSummary";
import s from "./suppressions.module.css";

type StateView = "active" | "expired" | "revoked" | "all";
const REFINED_STATES = ["expired", "revoked"] as const;
const ANY_REPO = "__any__";

function repoString(r: { owner: string; name: string }): string {
  return `${r.owner}/${r.name}`;
}

export function SuppressionsPage() {
  const [filters, setFilters] = useSuppressionFilters();
  const [refined, setRefined] = useQueryState("state", parseAsStringLiteral(REFINED_STATES));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  // Relative times read from the corpus's frozen instant in fixture mode (the kit's
  // CORPUS_NOW), so "expires in 22d" never drifts as the wall clock passes. Taken
  // once, at mount: Date.now() during render is impure.
  const [nowMs] = useState(() => (FIXTURES ? CORPUS_NOW : Date.now()));

  const view: StateView = filters.active ? "active" : (refined ?? "all");

  // The ledger in scope. Active-only is the API's own default and stays server-side;
  // any other view reads every row in scope and refines by state here.
  const ledger = useSuppressions({
    scope: filters.scope,
    repository: filters.repository,
    fingerprint: filters.fingerprint,
    active: filters.active,
    limit: 100,
  });
  // The whole ledger, unfiltered, for the posture summary (shares a cache entry with
  // `ledger` whenever no filter is set).
  const overview = useSuppressions({ active: false, limit: 100 });
  const findings = useFindings({ status: "suppressed", limit: 200 });
  const reviews = useReviewList({ limit: 200 });
  const created = useAudit({ event_type: "suppression.created" });
  const revoked = useAudit({ event_type: "suppression.revoked" });
  const breakGlass = useAudit({ event_type: "override.break_glass" });

  const joins = useMemo(() => {
    const repoByReview = new Map((reviews.data?.items ?? []).map((r) => [r.review_id, repoString(r.repository)]));
    const audit: AuditIndex = indexAudit([...(created.data?.items ?? []), ...(revoked.data?.items ?? []), ...(breakGlass.data?.items ?? [])]);
    return { findings: findingsBySuppression(findings.data?.items ?? []), repoByReview, audit };
  }, [reviews.data, created.data, revoked.data, breakGlass.data, findings.data]);

  const allEntries = useMemo(() => buildEntries(overview.data?.items ?? [], nowMs, joins), [overview.data, nowMs, joins]);
  const summary = useMemo(() => summarize(allEntries, nowMs), [allEntries, nowMs]);
  const entries = useMemo(() => buildEntries(ledger.data?.items ?? [], nowMs, joins), [ledger.data, nowMs, joins]);
  const rows = useMemo(
    () => entries.filter((e) => (view === "all" || view === "active" ? true : e.state === view)).filter((e) => matchesSearch(e, search)),
    [entries, view, search],
  );

  const repositories = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEntries) if (e.repository) set.add(e.repository);
    if (filters.repository) set.add(filters.repository);
    return [...set].sort();
  }, [allEntries, filters.repository]);

  const totals = ledger.data?.totals ?? { active: 0, expired: 0, revoked: 0 };
  const counts = { active: totals.active ?? 0, expired: totals.expired ?? 0, revoked: totals.revoked ?? 0 };
  const filtersActive = Boolean(filters.scope || filters.repository || filters.fingerprint || view !== "active" || search);

  function setView(next: StateView) {
    void setFilters({ active: next === "active" });
    void setRefined(next === "expired" || next === "revoked" ? next : null);
  }

  function setScope(scope: SuppressionScope | null) {
    void setFilters({ scope });
  }

  function clearFilters() {
    void setFilters({ scope: null, repository: null, active: true, fingerprint: null });
    void setRefined(null);
    void setSearch(null);
  }

  const silenced = overview.data ? summary.silenced : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Governance"
        title={silenced === null ? "Suppressions," : `${silenced.toLocaleString("en-US")} findings silenced to date,`}
        soft="every one on the record."
        description={
          overview.data
            ? `${summary.active.toLocaleString("en-US")} active ${summary.active === 1 ? "suppression" : "suppressions"} still silence ${summary.silencedNow.toLocaleString("en-US")} of them; the other ${(summary.silenced - summary.silencedNow).toLocaleString("en-US")} fell under rules since expired or revoked.`
            : "Where, why and who, for everything Witness was told to stop raising."
        }
        actions={
          <Button variant="outline" icon={Link2} href="/audit?kind=suppressions">
            Audit trail
          </Button>
        }
      />

      <Rise delay={60}>
        {overview.isPending ? (
          <div className={s.bento} aria-hidden>
            <Skeleton className={s.bentoHero} style={{ minHeight: 360, borderRadius: 20 }} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} style={{ minHeight: 172, borderRadius: 20 }} />
            ))}
          </div>
        ) : overview.isError ? null : (
          <LedgerSummary
            summary={summary}
            nowMs={nowMs}
            scope={filters.scope}
            onScope={setScope}
            onReviewSecurity={() => {
              setView("active");
              void setSearch("security");
            }}
          />
        )}
      </Rise>

      <Rise delay={120} as="section" className={s.ledgerSection}>
        <SectionHeader
          id="ledger-title"
          title="The ledger"
          description="Newest first. Revoking never deletes a row; it adds one to the audit chain."
        />

        <div className={s.toolbar}>
          <Segmented<StateView>
            label="Ledger state"
            value={view}
            onChange={setView}
            options={[
              { value: "active", label: "Active", count: counts.active },
              { value: "expired", label: "Expired", count: counts.expired },
              { value: "revoked", label: "Revoked", count: counts.revoked },
              { value: "all", label: "All", count: counts.active + counts.expired + counts.revoked },
            ]}
          />
          <Segmented<SuppressionScope | "any">
            label="Scope"
            size="sm"
            value={filters.scope ?? "any"}
            onChange={(v) => setScope(v === "any" ? null : v)}
            className={s.scopeSeg}
            options={[{ value: "any", label: "Any scope" }, ...SCOPE_ORDER.map((k) => ({ value: k, label: SCOPE_LABEL[k] }))]}
          />
          <div className={s.toolbarEnd}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" icon={FolderGit2} className={s.repoTrigger} aria-label={`Repository: ${filters.repository ?? "all repositories"}`}>
                  <span className={s.repoTriggerLabel}>{filters.repository ?? "All repos"}</span>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={s.repoMenu}>
                <DropdownMenuLabel>Repository</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={filters.repository ?? ANY_REPO} onValueChange={(v) => void setFilters({ repository: v === ANY_REPO ? null : v })}>
                  <DropdownMenuRadioItem value={ANY_REPO}>All repositories</DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                  {repositories.map((r) => (
                    <DropdownMenuRadioItem key={r} value={r} className={s.mono}>
                      {r}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <TextField
              size="sm"
              icon={Search}
              type="search"
              aria-label="Search the ledger"
              placeholder="Search the ledger"
              value={search}
              onChange={(e) => void setSearch(e.target.value || null)}
              wrapperClassName={s.search}
            />
          </div>
        </div>

        {filtersActive ? (
          <div className={s.chips}>
            {filters.fingerprint ? (
              <span className={s.chip} title={filters.fingerprint}>
                <span className={s.chipKey}>Fingerprint</span>
                <code>{shortHash(filters.fingerprint)}</code>
                <button type="button" className={s.chipX} aria-label="Remove the fingerprint filter" onClick={() => void setFilters({ fingerprint: null })}>
                  <X size={12} strokeWidth={2.2} aria-hidden />
                </button>
              </span>
            ) : null}
            <span className={s.chipsCount} role="status">
              {ledger.isSuccess ? `${rows.length.toLocaleString("en-US")} of ${(counts.active + counts.expired + counts.revoked).toLocaleString("en-US")} in scope` : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={clearFilters} icon={X}>
              Clear filters
            </Button>
          </div>
        ) : null}

        {ledger.isPending ? (
          <LoadingState rows={5} label="Loading the suppression ledger." />
        ) : ledger.isError ? (
          <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} />
        ) : rows.length === 0 ? (
          <div className={s.emptyWrap}>
            <EmptyState
              icon={ShieldCheck}
              title={filtersActive ? "Nothing silenced here" : "Nothing silenced yet"}
              body={
                filtersActive
                  ? "No suppression matches these filters. Every finding outside them is still raised."
                  : "No suppressions. Every finding Witness has raised is still on the record."
              }
              action={
                filtersActive ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <ol className={s.list} aria-labelledby="ledger-title">
            {rows.map((entry) => (
              <LedgerEntryCard key={entry.item.suppression_id} entry={entry} nowMs={nowMs} showState={view === "all"} />
            ))}
          </ol>
        )}
      </Rise>
    </Page>
  );
}
