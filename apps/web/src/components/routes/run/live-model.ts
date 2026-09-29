// The live log: a pure diff between two polls of GET /v1/reviews/{id}. Each poll
// is reduced to a snapshot (stage, counters, status); the difference becomes the
// lines a person watching the run reads — a stage finished, the coordinator kept
// N findings, delivery posted N comments, the verdict landed. Nothing is invented:
// every line is a field that changed between two polls.
import { STAGES, type ReviewRunStatus, type Stage } from '@/lib/contracts';
import type { RunCounts } from '@/lib/api-types';
import { STAGE_META } from './stage-model';

export interface LiveSnapshot {
  status: ReviewRunStatus;
  /** 1-based; 0 before stage 1. */
  stageIndex: number;
  stageLabel: string | null;
  counts: Required<RunCounts>;
  errorCode: string | null;
}

export type LogTone = 'default' | 'muted' | 'danger' | 'ok' | 'live';

export interface LogEvent {
  id: string;
  /** Seconds since the run started, when the change was seen; null when it happened before we joined. */
  at: number | null;
  stage: Stage | null;
  text: string;
  tone: LogTone;
}

export function snapshotOf(s: {
  status: ReviewRunStatus;
  stage_index?: number | null;
  stage_label?: string | null;
  counts?: RunCounts | null;
  error?: { code: string } | null;
}): LiveSnapshot {
  return {
    status: s.status,
    stageIndex: s.stage_index ?? 0,
    stageLabel: s.stage_label ?? null,
    counts: {
      proposed: s.counts?.proposed ?? 0,
      published: s.counts?.published ?? 0,
      suppressed: s.counts?.suppressed ?? 0,
      blocking: s.counts?.blocking ?? 0,
    },
    errorCode: s.error?.code ?? null,
  };
}

export function snapshotKey(s: LiveSnapshot): string {
  const c = s.counts;
  return `${s.status}|${s.stageIndex}|${c.proposed}|${c.suppressed}|${c.published}|${c.blocking}|${s.errorCode ?? ''}`;
}

const isLive = (st: ReviewRunStatus) => st === 'queued' || st === 'running';
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/**
 * The log lines between `prev` (null on the first poll we see) and `next`, stamped
 * `at` seconds into the run. Stages that finished before we joined are listed
 * without a time.
 */
export function logEvents(prev: LiveSnapshot | null, next: LiveSnapshot, at: number | null): LogEvent[] {
  const out: LogEvent[] = [];
  const stamp = (id: string, stage: Stage | null, text: string, tone: LogTone, when: number | null = at) =>
    out.push({ id: `${id}@${snapshotKey(next)}`, at: when, stage, text, tone });

  const from = prev?.stageIndex ?? 0;
  const doneBy = (s: LiveSnapshot) => (s.status === 'succeeded' ? STAGES.length : Math.max(0, s.stageIndex - 1));
  // Stages completed since the last poll — on the first poll, every stage behind the
  // current one, without a time (they finished before we joined).
  for (let i = (prev ? doneBy(prev) : 0) + 1; i <= doneBy(next); i++) {
    const key = STAGES[i - 1];
    if (key) stamp(`done-${key}`, key, `${STAGE_META[key].name} finished`, 'muted', prev ? at : null);
  }
  // What the finished stages produced, before the stage that is starting now.
  const pc = prev?.counts;
  const c = next.counts;
  if (c.proposed > (pc?.proposed ?? 0)) stamp('proposed', 'coordinator', `${n(c.proposed, 'finding')} proposed by the coordinator`, 'default');
  if (c.suppressed > (pc?.suppressed ?? 0)) stamp('suppressed', 'identity', `${n(c.suppressed, 'finding')} matched a suppression rule`, 'muted');
  if (c.published > (pc?.published ?? 0)) stamp('published', 'delivery', `Posted ${n(c.published, 'comment')} to the pull request`, 'default');
  if (c.blocking > (pc?.blocking ?? 0)) stamp('blocking', 'delivery', `${n(c.blocking, 'proven bug')} ${c.blocking === 1 ? 'blocks' : 'block'} the merge`, 'danger');

  // The stage now running, when it changed.
  if (isLive(next.status) && next.stageIndex >= 1 && next.stageIndex !== from) {
    const key = STAGES[next.stageIndex - 1];
    if (key) stamp(`start-${key}`, key, next.stageLabel ?? STAGE_META[key].doing, 'live');
  }
  if (!prev && next.status === 'queued') stamp('queued', null, 'Queued — waiting for a worker', 'muted');

  if (!isLive(next.status) && (!prev || isLive(prev.status))) {
    if (next.status === 'succeeded') stamp('end', 'finalise', c.blocking > 0 ? 'Verdict: blocked' : 'Verdict landed', c.blocking > 0 ? 'danger' : 'ok');
    else if (next.status === 'failed') stamp('end', null, `Run stopped${next.errorCode ? ` · ${next.errorCode}` : ''}`, 'danger');
    else stamp('end', null, next.errorCode === 'SUPERSEDED' ? 'Superseded by a newer push' : 'Run cancelled', 'muted');
  }
  return out;
}

/** `+0:07` / `+1:32`, the log's timestamp column. */
export function logStamp(at: number | null): string {
  if (at == null || !Number.isFinite(at)) return '—';
  const s = Math.max(0, Math.floor(at));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
