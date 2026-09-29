"use client";
// /audit — "a record nobody can edit". Every decision Witness (or a person) makes
// lands in a hash-chained, sequence-ordered log. The page's jobs, in order:
//   1. trust: re-compute the whole chain in this browser and say so plainly — and,
//      in fixture mode, show what an edit to one event would look like;
//   2. find: newest-first, filterable by what happened and who did it, searchable
//      by seq or hash, with ?seq= deep links that scroll to and open one event;
//   3. notice: break-glass overrides and the chain's shape, beside the log.
//
// Data: the API pages the chain oldest-first (`seq >` cursors, 500 a page). The
// page walks every page (up to MAX_PAGES) because both the verification and a
// newest-first log need the head of the chain; it then windows the rendered log
// client-side (PAGE blocks at a time, more as you scroll). review_id / finding_id
// (deep links from a run or a finding) stay server-side filters; event type, actor,
// family and search refine what is loaded. Everything is parsed losslessly
// (useAuditInfinite) — never JSON.parse — so Python's float lexemes survive.
import { Download, Search, SearchX, X } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, LoadingState } from "@/components/app-shell";
import { CORPUS_NOW } from "@/components/dash/format";
import { Button, EmptyState, Page, PageHeader, Rise, Segmented, TextField } from "@/components/dash/kit";
import { stringifyLosslessJson } from "@/api/lossless";
import type { ActorType } from "@/lib/contracts";
import { DEMO_IDS } from "@/lib/demo-ids";
import { FIXTURES } from "@/lib/env";
import { useAuditFilters, useAuditInfinite } from "@/lib/hooks";
import type { AuditListWithTenant } from "@/lib/api-types";
import { actorMix, dailyActivity, dayKey, dayLabel, familyCounts, familyOf, FAMILIES, FAMILY_LABEL, matchesSearch, parseSearch, typeLabel, type AuditEvent, type Family } from "./audit-model";
import { AuditSide } from "./AuditSide";
import { ChainBlock, HashLink, type BlockState, type LinkState } from "./ChainBlock";
import { useChainVerification, type ServerVerdict } from "./use-chain-verification";
import { useSeqDeepLink } from "./use-seq-deep-link";
import { VerifyHero } from "./VerifyHero";
import s from "./audit.module.css";

/** Pages of 500 walked automatically: 10,000 events. */
const MAX_PAGES = 20;
/** Blocks rendered per step of the windowed log. */
const PAGE = 60;

type InfiniteAudit = ReturnType<typeof useAuditInfinite>;

/** Keep fetching the next page until the chain's head is loaded (or the cap). */
function useWalkPages(q: InfiniteAudit, enabled: boolean) {
  const pages = q.data?.pages.length ?? 0;
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = q;
  useEffect(() => {
    if (!enabled || isError || !hasNextPage || isFetchingNextPage || pages >= MAX_PAGES) return;
    void fetchNextPage();
  }, [enabled, isError, hasNextPage, isFetchingNextPage, pages, fetchNextPage]);
  return enabled && q.isSuccess && (!hasNextPage || pages >= MAX_PAGES);
}

function flatten(pages: readonly AuditListWithTenant[] | undefined): AuditEvent[] {
  return (pages ?? []).flatMap((p) => (p.items ?? []) as unknown as AuditEvent[]);
}

function aggregate(pages: readonly AuditListWithTenant[] | undefined): ServerVerdict | null {
  if (!pages || pages.length === 0) return null;
  const chains = pages.map((p) => p.chain).filter(Boolean);
  const broken = chains.find((c) => c && c.verified === false) ?? null;
  return {
    verified: !broken,
    checked: chains.reduce((n, c) => n + (c?.checked ?? 0), 0),
    brokenAtSeq: broken?.broken_at_seq ?? null,
    firstSeq: chains[0]?.first_seq ?? null,
    lastSeq: chains.at(-1)?.last_seq ?? null,
  };
}

function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const ACTOR_OPTIONS: { value: ActorType | "any"; label: string }[] = [
  { value: "any", label: "Anyone" },
  { value: "human", label: "People" },
  { value: "ai", label: "Witness" },
  { value: "system", label: "System" },
];

export function AuditPage() {
  const [filters, setFilters] = useAuditFilters();
  const [seq, setSeq] = useQueryState("seq", parseAsInteger);
  const [kind, setKind] = useQueryState("kind", parseAsStringLiteral(FAMILIES));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [nowMs] = useState(() => (FIXTURES ? CORPUS_NOW : Date.now()));
  const [visible, setVisible] = useState(PAGE);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const [nonce, setNonce] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // --- data -----------------------------------------------------------------
  const scoped = Boolean(filters.review_id || filters.finding_id);
  const chainQ = useAuditInfinite({});
  const scopedQ = useAuditInfinite({ review_id: filters.review_id, finding_id: filters.finding_id }, { enabled: scoped });
  const chainLoaded = useWalkPages(chainQ, true);
  const scopedLoaded = useWalkPages(scopedQ, scoped);

  const chain = useMemo(() => flatten(chainQ.data?.pages), [chainQ.data]);
  const server = useMemo(() => aggregate(chainQ.data?.pages), [chainQ.data]);
  const source = useMemo(() => (scoped ? flatten(scopedQ.data?.pages) : chain), [scoped, scopedQ.data, chain]);
  const sourceQ = scoped ? scopedQ : chainQ;
  const sourceLoaded = scoped ? scopedLoaded : chainLoaded;

  // --- verification -----------------------------------------------------------
  const tamperSeq = useMemo(() => {
    if (!FIXTURES || chain.length === 0) return null;
    if (chain.some((e) => e.seq === DEMO_IDS.tamper_demo_seq)) return DEMO_IDS.tamper_demo_seq;
    return [...chain].reverse().find((e) => e.event_type === "finding.proposed")?.seq ?? null;
  }, [chain]);
  const verification = useChainVerification(chainLoaded ? chain : null, { server, tamperSeq });
  const vstate = verification.state;
  const brokenAt = vstate.phase === "broken" ? vstate.brokenAtSeq : null;
  const brokenUnlinked = vstate.phase === "broken" && !vstate.linked;

  // --- the log ------------------------------------------------------------------
  const query = useMemo(() => parseSearch(search), [search]);
  const refined = useMemo(
    () =>
      source.filter(
        (e) =>
          (!filters.event_type || e.event_type === filters.event_type) &&
          (!filters.actor_type || e.actor_type === filters.actor_type) &&
          (!kind || familyOf(e.event_type) === kind),
      ),
    [source, filters.event_type, filters.actor_type, kind],
  );
  const shown = useMemo(() => refined.filter((e) => matchesSearch(e, query)).reverse(), [refined, query]);
  const counts = useMemo(
    () =>
      familyCounts(
        source.filter((e) => (!filters.event_type || e.event_type === filters.event_type) && (!filters.actor_type || e.actor_type === filters.actor_type)),
      ),
    [source, filters.event_type, filters.actor_type],
  );
  const kindTotal = FAMILIES.reduce((n, f) => n + counts[f], 0);

  const seqIndex = seq == null ? -1 : shown.findIndex((e) => e.seq === seq);
  // A ?seq= that names nothing rendered: either no such event on the chain, or one the
  // current filters hide. Only judged once every page has loaded.
  const seqNotice: "missing" | "filtered" | null =
    seq == null || seqIndex >= 0 || !chainLoaded || !sourceLoaded ? null : chain.some((e) => e.seq === seq) ? "filtered" : "missing";
  const windowSize = Math.max(visible, seqIndex >= 0 ? seqIndex + 12 : 0);
  const rendered = shown.slice(0, windowSize);

  // Open the deep-linked event once per seq (adjusting state during render, not in an effect).
  const [openedSeq, setOpenedSeq] = useState<number | null>(null);
  if (seq != null && seq !== openedSeq && seqIndex >= 0) {
    setOpenedSeq(seq);
    setExpanded((prev) => new Set(prev).add(seq));
  }
  useSeqDeepLink({ containerRef, seq, ready: sourceLoaded && seqIndex >= 0, nonce });

  const toggle = useCallback((n: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }, []);

  const showSeq = useCallback(
    (n: number) => {
      void setSearch(null);
      void setKind(null);
      void setFilters({ event_type: null, actor_type: null, review_id: null, finding_id: null });
      void setSeq(n);
      setExpanded((prev) => new Set(prev).add(n));
      setNonce((x) => x + 1);
    },
    [setSearch, setKind, setFilters, setSeq],
  );

  // Infinite: render PAGE more blocks as the sentinel nears the viewport.
  const hasMoreRendered = rendered.length < shown.length;
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !hasMoreRendered || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) setVisible((v) => v + PAGE);
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMoreRendered, rendered.length]);

  // --- side analytics -----------------------------------------------------------
  const daily = useMemo(() => dailyActivity(chain, 28), [chain]);
  const mix = useMemo(() => actorMix(chain), [chain]);
  const breakGlass = useMemo(() => chain.filter((e) => e.event_type === "override.break_glass").reverse(), [chain]);

  function onDownload() {
    const text = stringifyLosslessJson({ items: chain, chain: server });
    downloadJson(`witness-audit-${chain.at(-1)?.seq ?? 0}.json`, text);
  }

  const anyFilter = Boolean(filters.review_id || filters.finding_id || filters.event_type || filters.actor_type || kind || search || seq != null);
  function clearFilters() {
    void setFilters({ review_id: null, finding_id: null, event_type: null, actor_type: null, since: null });
    void setKind(null);
    void setSearch(null);
    void setSeq(null);
  }

  function blockState(e: AuditEvent): BlockState {
    if (brokenAt !== null) return e.seq === brokenAt ? "broken" : e.seq > brokenAt ? "after" : "intact";
    return vstate.phase === "verified" ? "intact" : "pending";
  }

  function linkState(newer: AuditEvent, older: AuditEvent): LinkState {
    if (newer.seq !== older.seq + 1) return "gap";
    if (brokenAt !== null) {
      if (newer.seq === brokenAt + 1 && !brokenUnlinked) return "broken";
      if (newer.seq === brokenAt && brokenUnlinked) return "broken";
      if (newer.seq > brokenAt) return "after";
      return "linked";
    }
    return vstate.phase === "verified" ? "linked" : "pending";
  }

  const total = chain.length;

  return (
    <Page>
      <PageHeader
        eyebrow="Governance"
        title="A record"
        soft="nobody can edit."
        description="Every decision, hash-linked in order and re-checked in your browser."
        actions={
          <Button variant="outline" icon={Download} onClick={onDownload} disabled={!chainLoaded}>
            Download JSON
          </Button>
        }
      />

      {seqNotice && seq != null ? (
        <div className={s.seqNotice} role="status">
          <SearchX size={18} strokeWidth={2} aria-hidden />
          <p className={s.seqNoticeText}>
            {seqNotice === "missing" ? (
              <>
                No event <b>#{seq.toLocaleString("en-US")}</b> on this chain.{" "}
                {chain.length ? (
                  <span>
                    It runs from #{chain[0].seq.toLocaleString("en-US")} to #{chain.at(-1)!.seq.toLocaleString("en-US")}.
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <b>#{seq.toLocaleString("en-US")}</b> is on the chain but hidden by the current filters.
              </>
            )}
          </p>
          <div className={s.seqNoticeActions}>
            {seqNotice === "filtered" ? (
              <Button variant="dark" size="sm" onClick={() => showSeq(seq)}>
                Show it
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void setSeq(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <Rise delay={60}>
        {chainQ.isError ? (
          <ErrorState error={chainQ.error} onRetry={() => chainQ.refetch()} />
        ) : (
          <VerifyHero
            state={vstate}
            server={server}
            chain={chain}
            loading={!chainLoaded}
            canTamper={verification.canTamper}
            onVerify={() => verification.verify({ paced: true })}
            onTamper={verification.tamper}
            onRestore={verification.restore}
            onShowSeq={showSeq}
          />
        )}
      </Rise>

      <Rise delay={120}>
        <section className={s.logSection} aria-labelledby="audit-log-title">
          <div className={s.logHead}>
            <div className={s.logHeadText}>
              <h2 className={s.logTitle} id="audit-log-title">
                The chain
              </h2>
              <p className={s.logSub} role="status">
                {sourceLoaded
                  ? `${shown.length.toLocaleString("en-US")} ${shown.length === 1 ? "event" : "events"}${shown.length !== source.length ? ` of ${source.length.toLocaleString("en-US")}` : ""} · newest first`
                  : sourceQ.isPending
                    ? "Loading events…"
                    : `Loaded ${source.length.toLocaleString("en-US")} events…`}
              </p>
            </div>
            <TextField
              size="sm"
              icon={Search}
              mono
              type="search"
              aria-label="Search by seq, hash or text"
              placeholder="#seq, hash or text"
              value={search}
              onChange={(e) => void setSearch(e.target.value || null)}
              wrapperClassName={s.search}
            />
          </div>

          <div className={s.toolbar}>
            <Segmented<Family | "all">
              label="Event family"
              size="sm"
              value={kind ?? "all"}
              onChange={(v) => void setKind(v === "all" ? null : v)}
              options={[{ value: "all", label: "All", count: kindTotal }, ...FAMILIES.map((f) => ({ value: f, label: FAMILY_LABEL[f], count: counts[f] }))]}
            />
            <Segmented<ActorType | "any">
              label="Actor"
              size="sm"
              value={filters.actor_type ?? "any"}
              onChange={(v) => void setFilters({ actor_type: v === "any" ? null : v })}
              options={ACTOR_OPTIONS}
            />
          </div>

          {filters.review_id || filters.finding_id || filters.event_type || (seq != null && seqNotice !== "missing") ? (
            <div className={s.chips}>
              {filters.review_id ? (
                <FilterChip label="Run" value={filters.review_id.slice(0, 8)} title={filters.review_id} onClear={() => void setFilters({ review_id: null })} />
              ) : null}
              {filters.finding_id ? (
                <FilterChip label="Finding" value={filters.finding_id.slice(0, 8)} title={filters.finding_id} onClear={() => void setFilters({ finding_id: null })} />
              ) : null}
              {filters.event_type ? (
                <FilterChip label="Type" value={typeLabel(filters.event_type)} title={filters.event_type} onClear={() => void setFilters({ event_type: null })} />
              ) : null}
              {seq != null && seqNotice !== "missing" ? <FilterChip label="Linked" value={`#${seq.toLocaleString("en-US")}`} onClear={() => void setSeq(null)} /> : null}
              {anyFilter ? (
                <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className={s.body}>
            <div ref={containerRef} className={s.logCol}>
              {sourceQ.isPending ? (
                <LoadingState rows={8} density="compact" label="Loading the audit chain." />
              ) : sourceQ.isError ? (
                <ErrorState error={sourceQ.error} onRetry={() => sourceQ.refetch()} />
              ) : shown.length === 0 && sourceLoaded ? (
                <div className={s.emptyWrap}>
                  <EmptyState
                    icon={SearchX}
                    title="No events match"
                    body="The chain itself is unaffected — this is a view, not a record."
                    action={
                      anyFilter ? (
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : null
                    }
                  />
                </div>
              ) : (
                <>
                  <ol className={s.log} aria-label="Audit events, newest first">
                    {rendered.map((e, i) => {
                      const older = rendered[i + 1] ?? shown[i + 1] ?? null;
                      const newDay = i === 0 || dayKey(rendered[i - 1].created_at) !== dayKey(e.created_at);
                      const hashed = verification.tampered && verification.tampered.event.seq === e.seq ? verification.tampered.event : null;
                      return (
                        <Fragment key={e.seq}>
                          {newDay ? (
                            <li className={s.dayRule} aria-hidden>
                              <span>{dayLabel(dayKey(e.created_at))}</span>
                            </li>
                          ) : null}
                          <ChainBlock
                            event={e}
                            hashed={hashed}
                            row={verification.rows.get(e.seq) ?? null}
                            state={blockState(e)}
                            expanded={expanded.has(e.seq)}
                            highlight={seq === e.seq}
                            onToggle={toggle}
                            nowMs={nowMs}
                          />
                          {older ? (
                            <HashLink hash={e.prev_hash} state={linkState(e, older)} hidden={e.seq - older.seq - 1} />
                          ) : e.prev_hash === null ? null : sourceLoaded && !hasMoreRendered ? (
                            <HashLink hash={e.prev_hash} state="gap" hidden={e.seq - 1} />
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </ol>
                  {hasMoreRendered ? (
                    <div ref={moreRef} className={s.more}>
                      <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>
                        Show {Math.min(PAGE, shown.length - rendered.length).toLocaleString("en-US")} older
                      </Button>
                      <span className={s.moreNote}>
                        {rendered.length.toLocaleString("en-US")} of {shown.length.toLocaleString("en-US")}
                      </span>
                    </div>
                  ) : !sourceLoaded && sourceQ.hasNextPage ? (
                    <div className={s.more}>
                      <span className={s.moreNote}>Loading older pages…</span>
                    </div>
                  ) : sourceQ.hasNextPage ? (
                    <div className={s.more}>
                      <Button variant="secondary" onClick={() => sourceQ.fetchNextPage()} disabled={sourceQ.isFetchingNextPage}>
                        Load newer events
                      </Button>
                      <span className={s.moreNote}>{(MAX_PAGES * 500).toLocaleString("en-US")} events loaded; the chain continues</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <AuditSide daily={daily} mix={mix} total={total} breakGlass={breakGlass} nowMs={nowMs} onShowSeq={showSeq} />
          </div>
        </section>
      </Rise>
    </Page>
  );
}

function FilterChip({ label, value, title, onClear }: { label: string; value: string; title?: string; onClear: () => void }) {
  return (
    <span className={s.chip} title={title}>
      <span className={s.chipKey}>{label}</span>
      <code>{value}</code>
      <button type="button" className={s.chipX} aria-label={`Remove the ${label.toLowerCase()} filter`} onClick={onClear}>
        <X size={12} strokeWidth={2.2} aria-hidden />
      </button>
    </span>
  );
}
