'use client';
// One review in the timeline: when it ran (a dot on the day's rail, coloured by
// the merge gate), which pull request, who opened it, what Witness did with its
// findings, how long and how much, and the verdict. The whole row is the link.
import Link from 'next/link';
import { ArrowUpRight, CircleSlash, CornerDownRight, RotateCcw, TriangleAlert } from 'lucide-react';
import { Avatar, GateBadge, Tag } from '@/components/dash/kit';
import { dateTime, seconds, sha, usd } from '@/components/dash/format';
import type { ReviewListItem } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { countBits, outcomeOf, timeOfDay, type RunThread } from './model';
import s from './runs-list.module.css';

function Verdict({ run, outcome }: { run: ReviewListItem; outcome: ReturnType<typeof outcomeOf> }) {
  switch (outcome) {
    case 'running':
      return <GateBadge conclusion="running" />;
    case 'failed':
      return (
        <Tag tone="warn" icon={TriangleAlert} title="The run stopped before it reached a verdict">
          Failed
        </Tag>
      );
    case 'superseded':
      return (
        <Tag tone="dashed" icon={CornerDownRight} title="Cancelled: a newer push replaced this run">
          Superseded
        </Tag>
      );
    case 'cancelled':
      return (
        <Tag tone="dashed" icon={CircleSlash}>
          Cancelled
        </Tag>
      );
    default:
      return <GateBadge conclusion={run.gate_conclusion} />;
  }
}

export function RunRow({ run, thread }: { run: ReviewListItem; thread: RunThread | null }) {
  const outcome = outcomeOf(run, thread);
  const bits = countBits(run);
  const title = run.pull_request.title ?? `Pull request #${run.pull_request.number}`;
  const author = run.pull_request.author;
  // A blocked run followed by a clear one on the same PR: the bug was fixed.
  const clearedNext = outcome === 'blocked' && thread?.next?.gate_conclusion === 'success' && thread.next.status === 'succeeded';
  const muted = outcome === 'superseded' || outcome === 'cancelled';

  return (
    <li className={s.item} data-outcome={outcome}>
      <Link href={`/runs/${run.review_id}`} className={cn(s.row, muted && s.rowMuted)} title={`${dateTime(run.created_at)} · run ${sha(run.review_id, 8)}`}>
        <span className={s.time}>{timeOfDay(run.created_at)}</span>
        <span className={s.rail} aria-hidden>
          <i className={s.node} />
        </span>
        <Avatar name={run.repository.name} square size={36} className={s.repoAv} />
        <span className={s.main}>
          <span className={s.titleLine}>
            <span className={s.title}>{title}</span>
            <span className={s.prNum}>#{run.pull_request.number}</span>
          </span>
          <span className={s.metaLine}>
            <span className={s.repoName}>{run.repository.name}</span>
            {author ? (
              <span className={s.author}>
                <Avatar name={author} size={16} />
                {author}
              </span>
            ) : null}
            {run.trigger !== 'webhook' ? (
              <span className={s.trigger}>
                <RotateCcw size={11} strokeWidth={2.2} aria-hidden />
                {run.trigger === 'rerun' ? 'Re-run' : 'API'}
              </span>
            ) : null}
            {bits.length ? (
              <span className={s.counts}>
                {bits.map((b) => (
                  <span key={b.key} className={cn(s.count, b.tone === 'danger' && s.countDanger, b.tone === 'muted' && s.countMuted)}>
                    <b>{b.n}</b> {b.label}
                  </span>
                ))}
              </span>
            ) : outcome === 'failed' ? (
              <span className={s.countMuted}>no findings, the run stopped early</span>
            ) : null}
            {clearedNext ? <span className={s.cleared}>cleared on the next run</span> : null}
            {outcome === 'superseded' && thread?.next ? <span className={s.countMuted}>replaced by {sha(thread.next.review_id, 7)}</span> : null}
          </span>
          <span className={s.mobileStats}>
            {run.duration_seconds != null ? seconds(run.duration_seconds) : '—'} · {usd(run.cost_usd_estimate)}
          </span>
        </span>
        <span className={s.num}>{run.duration_seconds != null ? seconds(run.duration_seconds) : '—'}</span>
        <span className={s.num}>{usd(run.cost_usd_estimate)}</span>
        <span className={s.verdict}>
          <Verdict run={run} outcome={outcome} />
        </span>
        <span className={s.go} aria-hidden>
          <ArrowUpRight size={15} strokeWidth={2} />
        </span>
      </Link>
    </li>
  );
}
