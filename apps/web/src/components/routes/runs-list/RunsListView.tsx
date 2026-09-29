'use client';
// /runs — the review history. Every run Witness made, as a day-by-day timeline:
// a slim summary of the window on top, pill filters (kept in the URL so a view
// can be shared), then the days. Data: GET /v1/reviews (plan A11) through
// useReviewList, which polls while a run is live.
import { FolderGit2, Play, Search, X, Zap } from 'lucide-react';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/app-shell';
import { Button, EmptyState, IconButton, Page, PageHeader, Rise, Segmented, Skeleton, TextField } from '@/components/dash/kit';
import { plural } from '@/components/dash/format';
import { useReviewList } from '@/lib/hooks';
import { filterRuns, GATE_FILTERS, NO_FILTERS, groupByDay, isFiltered, matchesGate, repoKey, summarize, takeRuns, threadsOf, TRIGGER_FILTERS, type GateFilter, type RunFilters } from './model';
import { PillSelect } from './PillSelect';
import { RunRow } from './RunRow';
import { RunsSummary } from './RunsSummary';
import s from './runs-list.module.css';

const PAGE = 30;

const GATE_LABEL: Record<GateFilter, string> = { all: 'All', blocked: 'Blocked', clear: 'Clear', neutral: 'Neutral', running: 'Running' };
const TRIGGER_LABEL: Record<(typeof TRIGGER_FILTERS)[number], string> = { any: 'Any trigger', webhook: 'Webhook', rerun: 'Re-run', api: 'API' };

export function RunsListView({ replayHref }: { replayHref?: string }) {
  const list = useReviewList({ limit: 200 });
  const [params, setParams] = useQueryStates({
    gate: parseAsStringLiteral(GATE_FILTERS).withDefault('all'),
    repo: parseAsString,
    trigger: parseAsStringLiteral(TRIGGER_FILTERS).withDefault('any'),
    q: parseAsString.withDefault(''),
  });
  const filters: RunFilters = { gate: params.gate, repo: params.repo, trigger: params.trigger, q: params.q };
  const [limit, setLimit] = useState(PAGE);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const threads = useMemo(() => threadsOf(items), [items]);
  const repos = useMemo(() => [...new Set(items.map(repoKey))].sort(), [items]);
  const overall = useMemo(() => summarize(items), [items]);

  // The summary and the gate counts follow every filter except the gate itself,
  // so the segmented control reads as a legend for the band above it.
  const { repo, trigger, q } = params;
  const scoped = useMemo(() => filterRuns(items, { ...NO_FILTERS, repo, trigger, q }, { ignoreGate: true }), [items, repo, trigger, q]);
  const since = overall.days[0]?.key ?? null;
  const scopedSummary = useMemo(() => summarize(scoped, undefined, since), [scoped, since]);
  const visible = useMemo(() => scoped.filter((r) => matchesGate(r, filters.gate)), [scoped, filters.gate]);
  const groups = useMemo(() => groupByDay(visible), [visible]);
  const page = takeRuns(groups, limit);

  const gateCounts = useMemo(() => {
    const out = {} as Record<GateFilter, number>;
    for (const g of GATE_FILTERS) out[g] = scoped.filter((r) => matchesGate(r, g)).length;
    return out;
  }, [scoped]);

  const update = (next: Partial<RunFilters>) => {
    setLimit(PAGE);
    void setParams({
      ...(next.gate !== undefined ? { gate: next.gate === 'all' ? null : next.gate } : {}),
      ...(next.repo !== undefined ? { repo: next.repo } : {}),
      ...(next.trigger !== undefined ? { trigger: next.trigger === 'any' ? null : next.trigger } : {}),
      ...(next.q !== undefined ? { q: next.q || null } : {}),
    });
  };

  const clearAll = () => {
    setLimit(PAGE);
    void setParams({ gate: null, repo: null, trigger: null, q: null });
  };

  const loading = list.isPending;
  const filtered = isFiltered(filters);

  return (
    <Page>
      <PageHeader
        eyebrow="Reviews"
        title={loading ? 'Reviews.' : plural(overall.runs, 'review')}
        soft={loading ? null : `across ${plural(overall.pullRequests, 'pull request')}.`}
        description={loading ? null : `Every run on ${plural(overall.repositories, 'repository', 'repositories')}, newest first. Only a proven bug can block a merge.`}
        actions={
          replayHref ? (
            <Button variant="outline" icon={Play} onClick={() => window.location.assign(replayHref)}>
              Watch a live review
            </Button>
          ) : null
        }
      />

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          {loading || scoped.length > 0 ? (
            <Rise delay={60}>
              <RunsSummary summary={loading ? null : scopedSummary} loading={loading} filtered={repo != null || trigger !== 'any' || q.trim() !== ''} />
            </Rise>
          ) : null}

          <Rise delay={120} className={s.toolbar}>
            <div className={s.segWrap}>
              <Segmented
                label="Merge gate"
                value={filters.gate}
                onChange={(v) => update({ gate: v })}
                options={GATE_FILTERS.map((g) => ({ value: g, label: GATE_LABEL[g], count: loading ? undefined : gateCounts[g] }))}
              />
            </div>
            <div className={s.toolRight}>
              <PillSelect
                label="Repository"
                icon={FolderGit2}
                value={filters.repo ?? ''}
                onChange={(v) => update({ repo: v || null })}
                options={[{ value: '', label: 'All repositories' }, ...repos.map((r) => ({ value: r, label: r.split('/')[1] ?? r }))]}
              />
              <PillSelect
                label="Trigger"
                icon={Zap}
                value={filters.trigger}
                onChange={(v) => update({ trigger: v as RunFilters['trigger'] })}
                options={TRIGGER_FILTERS.map((t) => ({ value: t, label: TRIGGER_LABEL[t] }))}
              />
              <TextField
                size="sm"
                icon={Search}
                placeholder="Title or #number"
                aria-label="Search reviews by pull request title or number"
                value={filters.q}
                onChange={(e) => update({ q: e.target.value })}
                wrapperClassName={s.search}
                trailing={
                  filters.q ? <IconButton icon={X} label="Clear search" size="sm" onClick={() => update({ q: '' })} /> : null
                }
              />
            </div>
          </Rise>

          <Rise delay={180}>
            {loading ? (
              <ListSkeleton />
            ) : page.total === 0 ? (
              <EmptyState
                icon={Search}
                title={filtered ? 'No reviews match' : 'No reviews yet'}
                body={filtered ? 'Nothing in this window fits every filter. Loosen one, or clear them all.' : 'Reviews appear here as Witness runs on your pull requests.'}
                action={
                  filtered ? (
                    <Button variant="dark" size="sm" onClick={clearAll}>
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            ) : (
              <div className={s.timeline}>
                {filtered ? (
                  <p className={s.resultLine}>
                    <b>{page.total}</b> of {items.length} reviews
                    <button type="button" className={s.clearLink} onClick={clearAll}>
                      Clear filters
                    </button>
                  </p>
                ) : null}
                {page.groups.map((g) => (
                  <section key={g.key} className={s.day} aria-labelledby={`day-${g.key}`}>
                    <header className={s.dayHead}>
                      <h2 id={`day-${g.key}`} className={s.dayTitle}>
                        {g.title}
                      </h2>
                      {g.sub ? <span className={s.daySub}>{g.sub}</span> : null}
                      <span className={s.dayMeta}>
                        {plural(g.runs.length, 'review')}
                        {g.blocked ? <span className={s.dayBlocked}> · {g.blocked} blocked</span> : null}
                      </span>
                    </header>
                    <ol className={s.rows}>
                      {g.runs.map((r) => (
                        <RunRow key={r.review_id} run={r} thread={threads.get(r.review_id) ?? null} />
                      ))}
                    </ol>
                  </section>
                ))}
                {page.shown < page.total ? (
                  <div className={s.more}>
                    <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
                      Show {Math.min(PAGE, page.total - page.shown)} older
                    </Button>
                    <span className={s.moreHint}>
                      {page.shown} of {page.total} shown
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </Rise>
        </>
      )}
    </Page>
  );
}

function ListSkeleton() {
  return (
    <div className={s.timeline} aria-hidden>
      {[5, 3].map((n, gi) => (
        <div key={gi} className={s.day}>
          <div className={s.dayHead}>
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: n }, (_, i) => (
              <Skeleton key={i} className="h-[64px] w-full" style={{ borderRadius: 16 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
