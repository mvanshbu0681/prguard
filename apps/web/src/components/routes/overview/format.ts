// Copy helpers for /overview: the words the page puts next to its numbers.
// Numbers themselves go through @/components/dash/format (relTime, usd, pct…)
// so they read the same on every route.
import { shortDate } from '@/components/dash/format';
import type { ReviewListItem } from '@/lib/api-types';
import type { WindowKey } from './model';

/** The headline's soft clause: "26 bugs proven" + "since 19 Aug". */
export function windowPhrase(key: WindowKey, firstRunAt: string | null): string {
  if (key === '7d') return 'in the last 7 days';
  if (key === '30d') return 'in the last 30 days';
  return firstRunAt ? `since ${shortDate(firstRunAt)}` : 'so far';
}

/** A short caption for a section that follows the window. */
export function windowCaption(key: WindowKey, firstRunAt: string | null): string {
  if (key === '7d') return 'Last 7 days';
  if (key === '30d') return 'Last 30 days';
  return firstRunAt ? `Since ${shortDate(firstRunAt)}` : 'All time';
}

const STAGE_LABEL: Record<string, string> = {
  ingest: 'Ingest',
  context: 'Context',
  specialists: 'Specialists',
  coordinator: 'Coordinator',
  severity: 'Severity',
  identity: 'Identity',
  proof: 'Proof',
  delivery: 'Delivery',
  finalise: 'Finalise',
};

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export type RunWord = { word: string; tone: 'danger' | 'ok' | 'neutral' | 'muted' | 'blue' };

/** How a run ended, in one word, for the activity timeline. */
export function runWord(run: Pick<ReviewListItem, 'status' | 'gate_conclusion'>): RunWord {
  if (run.status === 'queued' || run.status === 'running') return { word: 'Reviewing', tone: 'blue' };
  if (run.status === 'failed') return { word: 'Failed', tone: 'muted' };
  if (run.status === 'cancelled') return { word: 'Superseded', tone: 'muted' };
  if (run.gate_conclusion === 'failure') return { word: 'Blocked', tone: 'danger' };
  if (run.gate_conclusion === 'success') return { word: 'Clear', tone: 'ok' };
  return { word: 'Neutral', tone: 'neutral' };
}

/** `checkout-service #4821` — the repo name without the org, which the shell already shows. */
export function repoPr(run: Pick<ReviewListItem, 'repository' | 'pull_request'>): string {
  return `${run.repository.name} #${run.pull_request.number}`;
}

/** Splits a finding title on backticks so identifiers render as code. */
export function codeSpans(title: string): { text: string; code: boolean }[] {
  return title
    .split('`')
    .map((text, i) => ({ text, code: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}

/** "1 override" / "3 overrides". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
