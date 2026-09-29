'use client';
// "What needs me right now": PRs the gate is holding (with the finding that
// holds them) and reviews in flight, beside a timeline of the latest runs.
// Reads the live run list (@/lib/hooks), so a review started from the dashboard
// shows up here while it runs; the top finding per run comes from the server
// model (fixture-only), and a run without one simply shows no finding line.
import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Avatar, Button, Card, EmptyState, GATE_COLOR, GateBadge, ProofBadge, Row, SeverityRail, SeverityScore, Skeleton, Tag } from '@/components/dash/kit';
import { relTime } from '@/components/dash/format';
import { useReviewList } from '@/lib/hooks';
import type { ReviewListItem } from '@/lib/api-types';
import { attentionRows, recentRuns, type AttentionRow, type TopFinding } from './model';
import { codeSpans, repoPr, runWord, type RunWord } from './format';

/** Timeline dots: gate verdicts in the product's gate colours; runs with no verdict stay quiet. */
const DOT: Record<RunWord['tone'], string> = {
  danger: GATE_COLOR.failure,
  ok: GATE_COLOR.success,
  neutral: GATE_COLOR.neutral,
  muted: 'var(--w-faint)',
  blue: 'var(--w-blue)',
};
import s from './overview.module.css';

/** Every run: the corpus has 76 and the API caps a page at 200. */
export const RUN_LIST_LIMIT = 200;
/** The timeline keeps pace with the attention list beside it (a row there is ~2.1 timeline items tall). */
const activityItems = (rows: number) => Math.min(14, Math.max(6, Math.round(rows * 2.1)));

export function AttentionSection({ topFindings }: { topFindings: Record<string, TopFinding> }) {
  const query = useReviewList({ limit: RUN_LIST_LIMIT });
  const runs = query.data?.items ?? [];
  const rows = attentionRows(runs, topFindings);
  const blocked = rows.filter((r) => r.kind === 'blocked').length;
  const running = rows.length - blocked;

  return (
    <div className={s.attnGrid}>
      <Card tone="surface" pad="none" className={s.attn}>
        <div className={s.cardTop}>
          <div className="min-w-0">
            <h2 className={s.cardTitle}>Needs attention</h2>
            <p className={s.cardDesc}>Pull requests the merge gate is holding, and reviews still running.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Tag tone="blue" dot>
                {running} running
              </Tag>
            ) : null}
            {query.data ? (
              <Tag tone={blocked ? 'danger' : 'ok'} dot>
                {blocked} blocked by a proven bug
              </Tag>
            ) : null}
          </div>
        </div>

        {query.isPending ? (
          <div className={s.attnList} aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={s.attnSkel}>
                <Skeleton style={{ width: 40, height: 40, borderRadius: 12 }} />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton style={{ width: '46%', height: 14 }} />
                  <Skeleton style={{ width: '28%', height: 11 }} />
                  <Skeleton style={{ width: '72%', height: 30, borderRadius: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <LoadError onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Nothing is waiting on you" body="No pull request is blocked and no review is running." className={s.attnEmpty} />
        ) : (
          <ul className={s.attnList}>
            {rows.map((r) => (
              <li key={r.run.review_id}>
                <AttentionItem row={r} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card tone="panel" pad="none" className={s.activity}>
        <div className={s.cardTop}>
          <h2 className={s.cardTitle}>Latest activity</h2>
          <Button variant="ghost" size="sm" href="/runs" className={s.tightBtn}>
            All reviews
          </Button>
        </div>
        {query.isPending ? (
          <div className={s.timeline} aria-busy>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} style={{ height: 36, marginBottom: 14 }} />
            ))}
          </div>
        ) : query.isError ? (
          <LoadError onRetry={() => query.refetch()} />
        ) : (
          <Timeline runs={recentRuns(runs, activityItems(rows.length))} />
        )}
      </Card>
    </div>
  );
}

function AttentionItem({ row }: { row: AttentionRow }) {
  const { run, finding, kind } = row;
  const title = run.pull_request.title ?? 'Untitled pull request';
  return (
    <Row href={`/runs/${run.review_id}`} className={s.attnRow} aria-label={`${repoPr(run)}: ${title}`}>
      <Avatar name={run.repository.name} square size={40} className={`${s.attnAvatar} ${s.avatarRing}`} />
      <div className={s.attnMain}>
        <div className={s.attnTitleLine}>
          <span className={s.attnTitle}>{title}</span>
          <span className={s.attnSide}>
            {/* Every other row here is blocked (the header says so, the meta line says since when); only a live one is badged. */}
            {kind === 'running' ? <GateBadge conclusion="running" size="sm" /> : null}
            <span className={s.arrowChip} aria-hidden>
              <ArrowUpRight size={15} strokeWidth={2} />
            </span>
          </span>
        </div>
        <div className={s.attnMeta}>
          <span className={s.mono}>{repoPr(run)}</span>
          {run.pull_request.author ? (
            <>
              <span aria-hidden className={s.sep} />
              <span className={s.author}>
                <Avatar name={run.pull_request.author} size={18} />
                {run.pull_request.author}
              </span>
            </>
          ) : null}
          <span aria-hidden className={`${s.sep} ${s.sepTime}`} />
          <span>{kind === 'running' ? `started ${relTime(run.created_at)}` : `blocked ${relTime(run.finished_at ?? run.created_at)}`}</span>
        </div>
        {finding ? <FindingLine f={finding} /> : null}
      </div>
    </Row>
  );
}

function FindingLine({ f }: { f: TopFinding }) {
  return (
    <div className={s.fLine}>
      <SeverityRail band={f.band} className={s.fRail} />
      <span className={s.fTitle}>
        <CodeTitle title={f.title} />
      </span>
      <span className={s.fBadges}>
        <SeverityScore score={f.score} band={f.band} showBand={false} />
        {/* A blocking finding is proven by definition (the header says so); only say it when it isn't. */}
        {f.proof !== 'proven' ? <ProofBadge status={f.proof} size="sm" /> : null}
      </span>
    </div>
  );
}

export function CodeTitle({ title }: { title: string }) {
  return (
    <>
      {codeSpans(title).map((p, i) =>
        p.code ? (
          <code key={i} className={s.code}>
            {p.text}
          </code>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Timeline({ runs }: { runs: ReviewListItem[] }) {
  if (runs.length === 0) return <p className={s.muted}>No reviews yet.</p>;
  return (
    <ol className={s.timeline}>
      {runs.map((run) => {
        const w = runWord(run);
        return (
          <li key={run.review_id} className={s.tlItem} data-tone={w.tone} style={{ ['--tone' as string]: DOT[w.tone] }}>
            <span className={s.tlDot} aria-hidden />
            <Link href={`/runs/${run.review_id}`} className={s.tlLink}>
              <span className={s.tlHead}>
                <span className={s.tlRepo}>{repoPr(run)}</span>
                <span className={s.tlWord}>{w.word}</span>
                <span className={s.tlTime}>{relTime(run.created_at)}</span>
              </span>
              <span className={s.tlTitle}>{run.pull_request.title ?? 'Untitled pull request'}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={s.loadError}>
      <p>Couldn’t load the review list.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
