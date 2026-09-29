// /overview's view model: every number on the page, computed from the corpus.
// Pure (no server-only imports), so the server page builds it from the
// fixture loaders and the unit tests build it from hand-made rows.
//
// Definitions (kept here so the copy on screen and the maths never drift):
// - A PR's current state is its latest run, skipping cancelled runs (a
//   cancelled run was superseded by a newer push).
// - "Held" = a PR with at least one blocked run in the window. "Fixed" = a
//   held PR whose current run is no longer blocked.
// - The noise filter nests: raised → kept by the coordinator → published →
//   proven. kept − suppressed − refuted − unresolved = published, exactly.
// - Proven bugs (the headline) count every finding whose repro test failed at
//   head and passed at base, including one a team rule later suppressed.
import type { Finding, ReviewListItem } from '@/lib/api-types';

export type WindowKey = '7d' | '30d' | 'all';
export const WINDOW_KEYS: readonly WindowKey[] = ['7d', '30d', 'all'];

const DAY_MS = 86_400_000;

/** Start of the window in epoch ms; `null` = everything. */
export function windowSince(key: WindowKey, now: number): number | null {
  if (key === '7d') return now - 7 * DAY_MS;
  if (key === '30d') return now - 30 * DAY_MS;
  return null;
}

function inWindow(iso: string, since: number | null): boolean {
  return since == null || Date.parse(iso) >= since;
}

/** Linear-interpolated quantile (numpy's default), or null for no values. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function prKey(run: Pick<ReviewListItem, 'repository' | 'pull_request'>): string {
  return `${run.repository.owner}/${run.repository.name}#${run.pull_request.number}`;
}

const byNewest = (a: { created_at: string }, b: { created_at: string }) => Date.parse(b.created_at) - Date.parse(a.created_at);

/** Each PR's current run: its newest run that was not cancelled (or its newest, if all were). */
export function currentRunByPr<T extends ReviewListItem>(runs: readonly T[]): Map<string, T> {
  const groups = new Map<string, T[]>();
  for (const r of runs) {
    const k = prKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out = new Map<string, T>();
  for (const [k, g] of groups) {
    const sorted = [...g].sort(byNewest);
    out.set(k, sorted.find((r) => r.status !== 'cancelled') ?? sorted[0]);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Findings                                                                  */
/* ------------------------------------------------------------------------ */

const ATTEMPTED = new Set(['proven', 'disproven', 'inconclusive', 'skipped_no_env']);

export interface ProofStats {
  /** Repro failed at head, passed at base (any finding status). */
  proven: number;
  /** Witness refuted its own claim by execution. */
  refuted: number;
  /** Findings it tried to prove. */
  attempted: number;
}

export function proofStats(findings: readonly Finding[]): ProofStats {
  let proven = 0;
  let refuted = 0;
  let attempted = 0;
  for (const f of findings) {
    const p = f.proof?.status;
    if (p === 'proven') proven++;
    if (p === 'disproven') refuted++;
    if (p && ATTEMPTED.has(p)) attempted++;
  }
  return { proven, refuted, attempted };
}

export interface FunnelStats {
  raised: number;
  /** Dropped by the coordinator: speculation, nitpicks, duplicates. */
  dropped: number;
  kept: number;
  /** Refuted by their own repro test, so never posted. */
  refuted: number;
  /** Matched a team suppression rule. */
  suppressed: number;
  /** Still proposed (the run ended before a verdict). */
  unresolved: number;
  published: number;
  /** Published and proven. */
  proven: number;
  /** Proven, then suppressed by a team rule. */
  provenSuppressed: number;
  /** Published, proven and blocking the merge. */
  blocking: number;
  /** Published without a proof: advice that cannot block. */
  advisory: number;
}

export function funnelStats(findings: readonly Finding[]): FunnelStats {
  const n = (pred: (f: Finding) => boolean) => findings.reduce((a, f) => a + (pred(f) ? 1 : 0), 0);
  const raised = findings.length;
  const dropped = n((f) => f.status === 'dropped');
  const published = n((f) => f.status === 'published');
  const proven = n((f) => f.status === 'published' && f.proof?.status === 'proven');
  return {
    raised,
    dropped,
    kept: raised - dropped,
    refuted: n((f) => f.status === 'disproven'),
    suppressed: n((f) => f.status === 'suppressed'),
    unresolved: n((f) => f.status === 'proposed'),
    published,
    proven,
    provenSuppressed: n((f) => f.status === 'suppressed' && f.proof?.status === 'proven'),
    blocking: n((f) => f.status === 'published' && !!f.blocking),
    advisory: published - proven,
  };
}

export interface TopFinding {
  id: string;
  title: string;
  score: number | null;
  band: string | null;
  proof: string | null;
  blocking: boolean;
  file: string | null;
  line: number | null;
}

/** Per run, the finding a reviewer should read first: blocking, then proven, then by severity. */
export function topFindingByReview(findings: readonly Finding[]): Record<string, TopFinding> {
  const rank = (f: Finding) => (f.blocking ? 4 : 0) + (f.proof?.status === 'proven' ? 2 : 0) + (f.severity?.score ?? 0);
  const best = new Map<string, Finding>();
  for (const f of findings) {
    if (f.status !== 'published') continue;
    const cur = best.get(f.review_id);
    if (!cur || rank(f) > rank(cur)) best.set(f.review_id, f);
  }
  const out: Record<string, TopFinding> = {};
  for (const [rid, f] of best) {
    out[rid] = {
      id: f.id,
      title: f.title,
      score: f.severity?.score ?? null,
      band: f.severity?.band ?? null,
      proof: f.proof?.status ?? null,
      blocking: !!f.blocking,
      file: f.location?.file_path ?? null,
      line: f.location?.start_line ?? null,
    };
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Runs                                                                      */
/* ------------------------------------------------------------------------ */

export interface GateStats {
  runs: number;
  blockedRuns: number;
  /** PRs the gate held at least once in the window. */
  held: number;
  /** Held PRs whose current run is no longer blocked. */
  fixed: number;
  /** Held PRs still blocked right now. */
  stillBlocked: number;
  /** Blocking findings raised in the window, and how many of them were proven. */
  blockingFindings: number;
  blockingProven: number;
  /** Break-glass overrides of the gate in the window. */
  overrides: number;
  /** One entry per held PR, oldest block first: `true` once fixed. */
  heldFixed: boolean[];
}

export function gateStats(
  windowRuns: readonly ReviewListItem[],
  current: ReadonlyMap<string, ReviewListItem>,
  windowFindings: readonly Finding[],
  overrides: number,
): GateStats {
  const blocked = windowRuns.filter((r) => r.gate_conclusion === 'failure');
  const firstBlock = new Map<string, number>();
  for (const r of blocked) {
    const k = prKey(r);
    const t = Date.parse(r.created_at);
    firstBlock.set(k, Math.min(firstBlock.get(k) ?? Infinity, t));
  }
  const heldKeys = [...firstBlock.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const heldFixed = heldKeys.map((k) => current.get(k)?.gate_conclusion !== 'failure');
  const blockingFindings = windowFindings.filter((f) => f.blocking);
  return {
    runs: windowRuns.length,
    blockedRuns: blocked.length,
    held: heldKeys.length,
    fixed: heldFixed.filter(Boolean).length,
    stillBlocked: heldFixed.filter((x) => !x).length,
    blockingFindings: blockingFindings.length,
    blockingProven: blockingFindings.filter((f) => f.proof?.status === 'proven').length,
    overrides,
    heldFixed,
  };
}

export interface HistBin {
  start: number;
  end: number;
  runs: number;
}

export interface SpeedStats {
  /** Runs with a duration (every finished run, failed ones included). */
  durationN: number;
  medianS: number | null;
  p95S: number | null;
  /** Completed reviews with a cost estimate. */
  costN: number;
  costP50: number | null;
  costP95: number | null;
  /** Total spend over every review in the window (cancelled and failed ones cost too). */
  spend: number;
  /** Reviews in the window. */
  reviews: number;
  costHist: HistBin[];
}

export const COST_BIN_USD = 0.2;
const COST_BINS = 8;

export function speedStats(runs: readonly ReviewListItem[]): SpeedStats {
  const durations = runs.flatMap((r) => (r.duration_seconds == null ? [] : [r.duration_seconds]));
  const costs = runs.flatMap((r) => (r.status === 'succeeded' && r.cost_usd_estimate != null ? [r.cost_usd_estimate] : []));
  const spent = runs.flatMap((r) => (r.cost_usd_estimate == null ? [] : [r.cost_usd_estimate]));
  const costHist: HistBin[] = Array.from({ length: COST_BINS }, (_, i) => ({
    start: +(i * COST_BIN_USD).toFixed(2),
    end: +((i + 1) * COST_BIN_USD).toFixed(2),
    runs: 0,
  }));
  for (const c of costs) costHist[Math.min(COST_BINS - 1, Math.floor(c / COST_BIN_USD))].runs++;
  return {
    durationN: durations.length,
    medianS: quantile(durations, 0.5),
    p95S: quantile(durations, 0.95),
    costN: costs.length,
    costP50: quantile(costs, 0.5),
    costP95: quantile(costs, 0.95),
    spend: spent.reduce((a, b) => a + b, 0),
    reviews: runs.length,
    costHist,
  };
}

export interface PerReviewStats {
  /** Published findings per run. */
  mean: number | null;
  n: number;
  /** Runs that published 0, 1, 2, 3 and 4+ findings. */
  hist: [number, number, number, number, number];
}

export function perReviewStats(runs: readonly ReviewListItem[]): PerReviewStats {
  const hist: PerReviewStats['hist'] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of runs) {
    const p = r.counts.published ?? 0;
    total += p;
    hist[Math.min(4, p)]++;
  }
  return { mean: runs.length ? total / runs.length : null, n: runs.length, hist };
}

/* ------------------------------------------------------------------------ */
/* Weeks, cache                                                */
/* ------------------------------------------------------------------------ */

export interface WeekRow {
  /** ISO date of the Monday that starts the week. */
  week: string;
  proven: number;
  refuted: number;
  inconclusive: number;
  noEnv: number;
  notAttempted: number;
  notApplicable: number;
  total: number;
  /** The week has not ended at the corpus's "now". */
  partial: boolean;
}

export interface SeriesWeek {
  week_start: string;
  proven: number;
  disproven: number;
  inconclusive: number;
  skipped_no_env: number;
  not_attempted: number;
  not_applicable: number;
}

export function weekRows(weekly: readonly SeriesWeek[], now: number): WeekRow[] {
  return weekly.map((w) => {
    const total = w.proven + w.disproven + w.inconclusive + w.skipped_no_env + w.not_attempted + w.not_applicable;
    return {
      week: w.week_start,
      proven: w.proven,
      refuted: w.disproven,
      inconclusive: w.inconclusive,
      noEnv: w.skipped_no_env,
      notAttempted: w.not_attempted,
      notApplicable: w.not_applicable,
      total,
      partial: Date.parse(`${w.week_start}T00:00:00Z`) + 7 * DAY_MS > now,
    };
  });
}

/** Weeks (by their Monday) that overlap the window. */
export function weeksInWindow(weeks: readonly string[], since: number | null): string[] {
  if (since == null) return [...weeks];
  return weeks.filter((w) => Date.parse(`${w}T00:00:00Z`) + 7 * DAY_MS > since);
}

export interface CacheDay {
  day: string;
  read: number;
  input: number;
}

export interface CacheStats {
  /** Cached input tokens / all input tokens over the window. */
  ratio: number | null;
  daily: number[];
  days: number;
  tokens: number;
}

export function cacheStats(days: readonly CacheDay[], since: number | null): CacheStats {
  const inW = days.filter((d) => since == null || Date.parse(`${d.day}T23:59:59Z`) >= since);
  const read = inW.reduce((a, d) => a + d.read, 0);
  const input = inW.reduce((a, d) => a + d.input, 0);
  return {
    ratio: read + input > 0 ? read / (read + input) : null,
    daily: inW.map((d) => (d.read + d.input > 0 ? d.read / (d.read + d.input) : 0)),
    days: inW.length,
    tokens: read + input,
  };
}

/* ------------------------------------------------------------------------ */
/* The model                                                                 */
/* ------------------------------------------------------------------------ */

export interface WindowModel {
  key: WindowKey;
  /** ISO start of the window, or null for everything. */
  since: string | null;
  proof: ProofStats;
  funnel: FunnelStats;
  gate: GateStats;
  speed: SpeedStats;
  perReview: PerReviewStats;
  /** Mondays of the weeks the window overlaps. */
  weeks: string[];
  cache: CacheStats;
}

export interface StageLatency {
  stage: string;
  p50: number;
  p95: number;
}

export interface OverviewModel {
  /** The corpus's frozen "now". */
  now: string;
  firstRunAt: string | null;
  windows: Record<WindowKey, WindowModel>;
  weekly: WeekRow[];
  stages: StageLatency[];
  topFindings: Record<string, TopFinding>;
  provenFindingId: string;
}

export interface OverviewInput {
  now: number;
  runs: readonly ReviewListItem[];
  findings: readonly Finding[];
  weekly: readonly SeriesWeek[];
  stages: readonly { stage: string; p50_s: number; p95_s: number }[];
  cache: readonly { day: string; cache_read_tokens: number; input_tokens: number }[];
  /** created_at of every break-glass override. */
  overrides: readonly string[];
  provenFindingId: string;
}

export function buildOverviewModel(input: OverviewInput): OverviewModel {
  const { now, runs, findings } = input;
  const current = currentRunByPr(runs);
  const weekly = weekRows(input.weekly, now);
  const weekKeys = weekly.map((w) => w.week);
  const cacheDays: CacheDay[] = input.cache.map((d) => ({ day: d.day, read: d.cache_read_tokens, input: d.input_tokens }));
  const firstRunAt = runs.length ? [...runs].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0].created_at : null;

  const windows = {} as Record<WindowKey, WindowModel>;
  for (const key of WINDOW_KEYS) {
    const since = windowSince(key, now);
    const wRuns = runs.filter((r) => inWindow(r.created_at, since));
    const wFindings = findings.filter((f) => inWindow(f.created_at, since));
    const overrides = input.overrides.filter((t) => inWindow(t, since)).length;
    windows[key] = {
      key,
      since: since == null ? null : new Date(since).toISOString(),
      proof: proofStats(wFindings),
      funnel: funnelStats(wFindings),
      gate: gateStats(wRuns, current, wFindings, overrides),
      speed: speedStats(wRuns),
      perReview: perReviewStats(wRuns),
      weeks: weeksInWindow(weekKeys, since),
      cache: cacheStats(cacheDays, since),
    };
  }

  return {
    now: new Date(now).toISOString(),
    firstRunAt,
    windows,
    weekly,
    stages: input.stages.map((s) => ({ stage: s.stage, p50: s.p50_s, p95: s.p95_s })),
    topFindings: topFindingByReview(findings),
    provenFindingId: input.provenFindingId,
  };
}

/* ------------------------------------------------------------------------ */
/* Client-side: the live run list                                            */
/* ------------------------------------------------------------------------ */

export type AttentionKind = 'running' | 'blocked';

export interface AttentionRow {
  kind: AttentionKind;
  run: ReviewListItem;
  finding: TopFinding | null;
}

const LIVE = new Set(['queued', 'running']);

/** PRs that need a human now: reviews in flight, then PRs the gate is holding (newest first). */
export function attentionRows(runs: readonly ReviewListItem[], top: Readonly<Record<string, TopFinding>>): AttentionRow[] {
  const rows: AttentionRow[] = [];
  for (const run of currentRunByPr(runs).values()) {
    if (LIVE.has(run.status)) rows.push({ kind: 'running', run, finding: null });
    else if (run.gate_conclusion === 'failure') rows.push({ kind: 'blocked', run, finding: top[run.review_id] ?? null });
  }
  return rows.sort((a, b) => (a.kind === b.kind ? byNewest(a.run, b.run) : a.kind === 'running' ? -1 : 1));
}

/** The newest runs, for the activity timeline. */
export function recentRuns(runs: readonly ReviewListItem[], n: number): ReviewListItem[] {
  return [...runs].sort(byNewest).slice(0, n);
}
