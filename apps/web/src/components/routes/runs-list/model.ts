// The review history's logic, kept free of React so it can be tested directly:
// filtering, the day grouping of the timeline, supersession, the summary band
// and the per-row count line. Everything reads the plan-A11 list item
// (GET /v1/reviews) as served, and prints nothing it cannot back with a field.
import type { ReviewListItem } from '@/lib/api-types';
import { CORPUS_NOW, MONTHS } from '@/components/dash/format';

export const GATE_FILTERS = ['all', 'blocked', 'clear', 'neutral', 'running'] as const;
export type GateFilter = (typeof GATE_FILTERS)[number];

export const TRIGGER_FILTERS = ['any', 'webhook', 'rerun', 'api'] as const;
export type TriggerFilter = (typeof TRIGGER_FILTERS)[number];

export interface RunFilters {
  gate: GateFilter;
  /** `owner/name`, or null for every repository. */
  repo: string | null;
  trigger: TriggerFilter;
  q: string;
}

export const NO_FILTERS: RunFilters = { gate: 'all', repo: null, trigger: 'any', q: '' };

export function repoKey(r: Pick<ReviewListItem, 'repository'>): string {
  return `${r.repository.owner}/${r.repository.name}`;
}

export function isLiveRun(r: Pick<ReviewListItem, 'status'>): boolean {
  return r.status === 'queued' || r.status === 'running';
}

export function matchesGate(r: ReviewListItem, gate: GateFilter): boolean {
  switch (gate) {
    case 'all':
      return true;
    case 'running':
      return isLiveRun(r);
    // A verdict counts only for a run that finished: a cancelled run's recorded gate
    // is not a verdict (the band and the segmented control must agree).
    case 'blocked':
      return r.status === 'succeeded' && r.gate_conclusion === 'failure';
    case 'clear':
      return r.status === 'succeeded' && r.gate_conclusion === 'success';
    case 'neutral':
      return r.status === 'succeeded' && r.gate_conclusion === 'neutral';
  }
}

/**
 * Free-text search over what a person remembers a pull request by: its title, its
 * number (`4821` or `#4821`), the author and the repository name.
 */
export function matchesQuery(r: ReviewListItem, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const num = /^#?(\d+)$/.exec(q);
  if (num) return String(r.pull_request.number).startsWith(num[1]);
  const hay = [r.pull_request.title ?? '', r.pull_request.author ?? '', r.repository.name, `#${r.pull_request.number}`].join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function filterRuns(items: readonly ReviewListItem[], f: RunFilters, opts: { ignoreGate?: boolean } = {}): ReviewListItem[] {
  return items.filter(
    (r) =>
      (opts.ignoreGate || matchesGate(r, f.gate)) &&
      (f.repo == null || repoKey(r) === f.repo) &&
      (f.trigger === 'any' || r.trigger === f.trigger) &&
      matchesQuery(r, f.q),
  );
}

export function isFiltered(f: RunFilters): boolean {
  return f.gate !== 'all' || f.repo != null || f.trigger !== 'any' || f.q.trim() !== '';
}

/* --------------------------------------------------------------------------
   Pull-request threads: supersession and "cleared on the next run"
   -------------------------------------------------------------------------- */

function prKey(r: ReviewListItem): string {
  return `${repoKey(r)}#${r.pull_request.number}`;
}

function byCreatedAsc(a: ReviewListItem, b: ReviewListItem): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.review_id < b.review_id ? -1 : 1;
}

export interface RunThread {
  /** The next run on the same pull request, when there is one. */
  next: ReviewListItem | null;
  /** The previous run on the same pull request, when there is one. */
  prev: ReviewListItem | null;
  /** A cancelled run that a newer run on the same pull request replaced. */
  superseded: boolean;
}

/** For every run: its neighbours on the same pull request, oldest → newest. */
export function threadsOf(items: readonly ReviewListItem[]): Map<string, RunThread> {
  const byPr = new Map<string, ReviewListItem[]>();
  for (const r of items) {
    const k = prKey(r);
    const list = byPr.get(k);
    if (list) list.push(r);
    else byPr.set(k, [r]);
  }
  const out = new Map<string, RunThread>();
  for (const runs of byPr.values()) {
    runs.sort(byCreatedAsc);
    runs.forEach((r, i) => {
      const next = runs[i + 1] ?? null;
      out.set(r.review_id, { next, prev: runs[i - 1] ?? null, superseded: r.status === 'cancelled' && next != null });
    });
  }
  return out;
}

/* --------------------------------------------------------------------------
   The run's outcome, as the timeline dot and the badge read it
   -------------------------------------------------------------------------- */

export type RunOutcome = 'running' | 'blocked' | 'clear' | 'neutral' | 'failed' | 'superseded' | 'cancelled';

export function outcomeOf(r: ReviewListItem, thread?: RunThread | null): RunOutcome {
  if (isLiveRun(r)) return 'running';
  if (r.status === 'failed') return 'failed';
  if (r.status === 'cancelled') return thread?.superseded ? 'superseded' : 'cancelled';
  if (r.gate_conclusion === 'failure') return 'blocked';
  if (r.gate_conclusion === 'success') return 'clear';
  return 'neutral';
}

/* --------------------------------------------------------------------------
   Day grouping (UTC, relative to the corpus clock)
   -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayStart(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** `Wed 23 Sep` — the product's one month spelling (@/components/dash/format MONTHS). */
export function dayLabel(key: string): string {
  const d = new Date(dayStart(key));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export interface DayGroup {
  key: string;
  /** "In progress", "Today", "Yesterday", or `Mon 21 Sep`. */
  title: string;
  /** The date beside a relative title, or how long ago a dated one was. */
  sub: string | null;
  runs: ReviewListItem[];
  blocked: number;
}

/**
 * The timeline: live runs first under "In progress", then one group per UTC day,
 * newest first, each group's runs newest first. "Today" is the corpus clock's day,
 * so the frozen demo corpus reads the way it did when it was recorded.
 */
export function groupByDay(items: readonly ReviewListItem[], now: number = CORPUS_NOW): DayGroup[] {
  const today = dayKey(new Date(now).toISOString());
  const live: ReviewListItem[] = [];
  const byDay = new Map<string, ReviewListItem[]>();
  for (const r of items) {
    if (isLiveRun(r)) {
      live.push(r);
      continue;
    }
    const k = dayKey(r.created_at);
    const list = byDay.get(k);
    if (list) list.push(r);
    else byDay.set(k, [r]);
  }
  const desc = (a: ReviewListItem, b: ReviewListItem) => -byCreatedAsc(a, b);
  const groups: DayGroup[] = [];
  if (live.length) groups.push({ key: 'live', title: 'In progress', sub: null, runs: live.sort(desc), blocked: 0 });
  const keys = [...byDay.keys()].sort().reverse();
  for (const k of keys) {
    const runs = byDay.get(k)!.sort(desc);
    const days = Math.round((dayStart(today) - dayStart(k)) / DAY_MS);
    const title = days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : dayLabel(k);
    const sub = days <= 1 ? dayLabel(k) : days < 7 ? `${days} days ago` : days < 14 ? 'Last week' : `${Math.floor(days / 7)} weeks ago`;
    groups.push({ key: k, title, sub, runs, blocked: runs.filter((r) => r.gate_conclusion === 'failure' && r.status === 'succeeded').length });
  }
  return groups;
}

/** Page the groups by run count without splitting a day in two unless it must. */
export function takeRuns(groups: readonly DayGroup[], limit: number): { groups: DayGroup[]; shown: number; total: number } {
  const total = groups.reduce((n, g) => n + g.runs.length, 0);
  const out: DayGroup[] = [];
  let shown = 0;
  for (const g of groups) {
    if (shown >= limit) break;
    const room = limit - shown;
    const runs = g.runs.length <= room ? g.runs : g.runs.slice(0, room);
    out.push(runs === g.runs ? g : { ...g, runs });
    shown += runs.length;
  }
  return { groups: out, shown, total };
}

/** `11:46` (UTC), the run's place on its day. */
export function timeOfDay(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/* --------------------------------------------------------------------------
   The summary band
   -------------------------------------------------------------------------- */

export function median(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * The median wall clock of finished runs — every run that recorded a duration,
 * whatever its outcome. The same population as GET /v1/accuracy's
 * runs.median_duration_seconds (28.7s on the corpus), so /runs, the run page,
 * Overview and Accuracy all print one number.
 */
export function medianDuration(items: readonly ReviewListItem[]): number | null {
  return median(items.filter((r) => !isLiveRun(r) && r.duration_seconds != null).map((r) => r.duration_seconds!));
}

export interface DayBar {
  key: string;
  total: number;
  blocked: number;
}

export interface RunsSummary {
  runs: number;
  pullRequests: number;
  repositories: number;
  gate: { blocked: number; clear: number; neutral: number; noVerdict: number; running: number };
  days: DayBar[];
  medianDuration: number | null;
  medianCost: number | null;
  perDay: number | null;
}

/**
 * The band's numbers for `items`. `since` (a UTC day key) pins the start of the
 * per-day bars, so a filtered view keeps the whole window's time axis.
 */
export function summarize(items: readonly ReviewListItem[], now: number = CORPUS_NOW, since?: string | null): RunsSummary {
  const gate = { blocked: 0, clear: 0, neutral: 0, noVerdict: 0, running: 0 };
  for (const r of items) {
    if (isLiveRun(r)) gate.running++;
    else if (r.status !== 'succeeded') gate.noVerdict++;
    else if (r.gate_conclusion === 'failure') gate.blocked++;
    else if (r.gate_conclusion === 'success') gate.clear++;
    else if (r.gate_conclusion === 'neutral') gate.neutral++;
    else gate.noVerdict++;
  }
  const finished = items.filter((r) => !isLiveRun(r));
  const days: DayBar[] = [];
  if (finished.length) {
    const earliest = finished.map((r) => dayKey(r.created_at)).sort()[0];
    const first = dayStart(since && since < earliest ? since : earliest);
    const last = Math.max(dayStart(dayKey(new Date(now).toISOString())), ...finished.map((r) => dayStart(dayKey(r.created_at))));
    const counts = new Map<string, DayBar>();
    for (let t = first; t <= last; t += DAY_MS) {
      const k = new Date(t).toISOString().slice(0, 10);
      const bar = { key: k, total: 0, blocked: 0 };
      counts.set(k, bar);
      days.push(bar);
    }
    for (const r of finished) {
      const bar = counts.get(dayKey(r.created_at));
      if (!bar) continue;
      bar.total++;
      if (r.status === 'succeeded' && r.gate_conclusion === 'failure') bar.blocked++;
    }
  }
  return {
    runs: items.length,
    pullRequests: new Set(items.map(prKey)).size,
    repositories: new Set(items.map(repoKey)).size,
    gate,
    days,
    medianDuration: medianDuration(items),
    medianCost: median(items.filter((r) => r.cost_usd_estimate != null).map((r) => r.cost_usd_estimate!)),
    perDay: days.length ? finished.length / days.length : null,
  };
}

/* --------------------------------------------------------------------------
   The count line under a row's title
   -------------------------------------------------------------------------- */

export interface CountBit {
  key: 'blocking' | 'published' | 'refuted' | 'suppressed' | 'dropped' | 'raised' | 'proposed';
  n: number;
  label: string;
  tone: 'danger' | 'default' | 'muted';
}

/**
 * What a finished run did with its findings, in the order a reviewer cares about:
 * what blocks, what reached the PR, what Witness refuted itself, what a rule hid,
 * what the coordinator threw away. Zeroes are left out except `published`, which
 * is the run's headline number. A run still in progress reports only what exists.
 */
export function countBits(r: ReviewListItem): CountBit[] {
  const c = r.counts ?? {};
  if (r.status === 'failed') return [];
  const bits: CountBit[] = [];
  if ((c.blocking ?? 0) > 0) bits.push({ key: 'blocking', n: c.blocking!, label: 'blocking', tone: 'danger' });
  if (isLiveRun(r)) {
    // A live row carries the status counters: `proposed` is what is still in flight.
    if ((c.proposed ?? 0) > 0) bits.push({ key: 'proposed', n: c.proposed!, label: 'proposed', tone: 'default' });
  } else if (r.status === 'cancelled') {
    // A stopped run's result counts: `proposed` is everything the specialists raised.
    if ((c.proposed ?? 0) > 0) bits.push({ key: 'raised', n: c.proposed!, label: 'raised', tone: 'default' });
  } else {
    bits.push({ key: 'published', n: c.published ?? 0, label: 'published', tone: 'default' });
  }
  if ((c.disproven ?? 0) > 0) bits.push({ key: 'refuted', n: c.disproven!, label: 'refuted', tone: 'default' });
  if ((c.suppressed ?? 0) > 0) bits.push({ key: 'suppressed', n: c.suppressed!, label: 'suppressed', tone: 'muted' });
  if ((c.dropped ?? 0) > 0) bits.push({ key: 'dropped', n: c.dropped!, label: 'dropped', tone: 'muted' });
  return bits;
}
