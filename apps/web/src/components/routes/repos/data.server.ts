// SERVER-ONLY. The Repositories flow's view models over the fixture corpus:
// the six acme repositories, their pull requests (every reviewed one, plus the
// deterministic open ones model.ts synthesises), a PR's latest real run with
// its findings, the recorded run timing, and the small finding pool a simulated
// review borrows its texts from. Pages call these and pass plain props down.
import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_NOW } from '@/components/dash/format';
import type { Finding, ReviewListItem, ReviewResult } from '@/lib/api-types';
import { getAccuracy, getAuditChain, getDemoRun, getFindings, getManifest, getReviewsIndex } from '@/lib/fixtures';
import {
  branchFor,
  countFindings,
  DEFAULT_TIMING,
  DEMO_TITLES,
  diffStat,
  gateReason,
  syntheticOpenPulls,
  syntheticPullByNumber,
  type AnalysisResult,
  type CorpusFinding,
  type DisplayFinding,
  type FindingEvidence,
  type FixturePullData,
  type Gate,
  type LangKey,
  type ProofKind,
  type PullMeta,
  type PullRow,
  type RepoRef,
  type RepoSummary,
  type ReviewBrief,
  type SimCaps,
  type StageTimingInput,
  type SyntheticContext,
} from './model';

const DAY = 86_400_000;
const WEEKS = 6;

const DESCRIPTION: Record<string, string> = {
  'checkout-service': 'Checkout, charging and settlement for every storefront order.',
  'identity-gateway': 'Sign-in, sessions and the admin break-glass path.',
  'web-storefront': 'The customer storefront: catalogue, cart and consent.',
  ledger: 'Double-entry ledger, payouts and reconciliation.',
  notifications: 'Email, push and webhook fan-out with retries.',
  'infra-terraform': 'Terraform for every acme environment.',
};

const LANG_OF: Record<string, LangKey> = { python: 'python', typescript: 'typescript', yaml: 'hcl', unknown: 'hcl', hcl: 'hcl' };

/* --------------------------------------------------------------------------
   Corpus access (memoised per server process)
   -------------------------------------------------------------------------- */

let memo: {
  runs: ReviewListItem[];
  findingsByRun: Map<string, Finding[]>;
  repos: RepoRef[];
  results: Map<string, ReviewResult | null>;
} | null = null;

function corpus() {
  if (memo) return memo;
  const runs = [...getReviewsIndex().items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const findingsByRun = new Map<string, Finding[]>();
  for (const f of getFindings()) {
    const list = findingsByRun.get(f.review_id) ?? [];
    list.push(f);
    findingsByRun.set(f.review_id, list);
  }
  const seen = new Map<string, RepoRef>();
  for (const r of runs) seen.set(`${r.repository.owner}/${r.repository.name}`, { owner: r.repository.owner, name: r.repository.name });
  const repos = [...seen.values()];
  memo = { runs, findingsByRun, repos, results: new Map() };
  return memo;
}

function result(reviewId: string): ReviewResult | null {
  const c = corpus();
  if (c.results.has(reviewId)) return c.results.get(reviewId)!;
  const file = join(process.cwd(), 'public', 'fixtures', 'reviews', `${reviewId}.result.json`);
  let value: ReviewResult | null = null;
  try {
    if (existsSync(file)) value = JSON.parse(readFileSync(file, 'utf8')) as ReviewResult;
  } catch {
    value = null;
  }
  c.results.set(reviewId, value);
  return value;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The corpus repository matching `owner/name` (any casing), with its canonical casing. */
export function findFixtureRepo(owner: string, name: string): RepoRef | null {
  return corpus().repos.find((r) => same(r.owner, owner) && same(r.name, name)) ?? null;
}

export function fixtureRepoRefs(): RepoRef[] {
  return corpus().repos;
}

function runsOf(ref: RepoRef): ReviewListItem[] {
  return corpus().runs.filter((r) => same(r.repository.owner, ref.owner) && same(r.repository.name, ref.name));
}

/** The language the corpus records on this repository's findings (python, typescript, unknown…). */
function findingLanguageOf(ref: RepoRef): string {
  const counts = new Map<string, number>();
  for (const run of runsOf(ref)) {
    for (const f of corpus().findingsByRun.get(run.review_id) ?? []) {
      const l = f.location?.language ?? 'unknown';
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
}

function languageOf(ref: RepoRef): LangKey {
  const counts = new Map<string, number>();
  for (const run of runsOf(ref)) {
    for (const f of corpus().findingsByRun.get(run.review_id) ?? []) {
      const l = f.location?.language ?? 'unknown';
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'python';
  return LANG_OF[top] ?? 'python';
}

function authorsOf(ref: RepoRef): string[] {
  return [...new Set(runsOf(ref).map((r) => r.pull_request.author).filter((a): a is string => !!a))];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function asGate(g: string | null | undefined): Gate | null {
  return g === 'failure' || g === 'success' || g === 'neutral' ? g : null;
}

/* --------------------------------------------------------------------------
   Pull requests
   -------------------------------------------------------------------------- */

function byPull(ref: RepoRef): Map<number, ReviewListItem[]> {
  const m = new Map<number, ReviewListItem[]>();
  for (const r of runsOf(ref)) {
    const list = m.get(r.pull_request.number) ?? [];
    list.push(r); // newest first, as corpus().runs is
    m.set(r.pull_request.number, list);
  }
  return m;
}

/** The run that speaks for a PR: its newest succeeded run, else its newest run of any status. */
function latestRun(runs: ReviewListItem[]): ReviewListItem {
  return runs.find((r) => r.status === 'succeeded') ?? runs[0]!;
}

function briefOf(run: ReviewListItem): ReviewBrief {
  const proven = (corpus().findingsByRun.get(run.review_id) ?? []).filter((f) => f.proof?.status === 'proven' && f.status === 'published').length;
  return {
    reviewId: run.review_id,
    status: run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled' ? run.status : 'succeeded',
    gate: asGate(run.gate_conclusion),
    published: run.counts?.published ?? 0,
    proven,
    at: run.finished_at ?? run.created_at,
    durationS: run.duration_seconds,
  };
}

function fixturePullMeta(ref: RepoRef, runs: ReviewListItem[]): PullMeta {
  const run = latestRun(runs);
  const res = result(run.review_id);
  const title = run.pull_request.title ?? `Pull request #${run.pull_request.number}`;
  const author = run.pull_request.author ?? 'unknown';
  const files = res?.context?.files_changed ?? undefined;
  const diff = diffStat(`${ref.owner}/${ref.name}#${run.pull_request.number}`.toLowerCase(), files);
  const updatedAt = runs[0]!.created_at;
  const gate = asGate(run.gate_conclusion);
  const recent = CORPUS_NOW - Date.parse(updatedAt) < 3 * DAY;
  return {
    number: run.pull_request.number,
    title,
    author,
    headBranch: branchFor(author, title),
    baseBranch: res?.repository?.default_branch ?? 'main',
    headSha: res?.pull_request?.head_sha ?? '0000000',
    baseSha: res?.pull_request?.base_sha ?? '0000000',
    updatedAt,
    ...diff,
    state: gate === 'failure' || gate === 'neutral' || run.status !== 'succeeded' || recent ? 'open' : 'merged',
    kind: 'fixture',
    origin: 'corpus',
  };
}

/** What synthesis needs to invent a PR in a corpus repository: its language, its authors, its branch. */
export function fixtureContext(ref: RepoRef): SyntheticContext {
  return contextOf(ref);
}

function contextOf(ref: RepoRef): SyntheticContext {
  const authors = authorsOf(ref);
  return {
    language: languageOf(ref),
    authors: authors.length ? authors : ['octo'],
    defaultBranch: 'main',
    kind: 'fixture',
    titles: DEMO_TITLES[ref.name] ?? [],
    caps: capsOf(simulationPool(ref)),
  };
}

function maxNumber(ref: RepoRef): number {
  return Math.max(0, ...runsOf(ref).map((r) => r.pull_request.number));
}

/** Every PR row a corpus repository shows: the synthesised open ones first, then each reviewed PR, newest first. */
export function fixturePulls(ref: RepoRef): PullRow[] {
  const reviewed: PullRow[] = [...byPull(ref).entries()].map(([, runs]) => ({ ...fixturePullMeta(ref, runs), review: briefOf(latestRun(runs)) }));
  reviewed.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const open: PullRow[] = syntheticOpenPulls(ref, contextOf(ref), maxNumber(ref)).map((p) => ({ ...p, review: null }));
  return [...open, ...reviewed];
}

/* --------------------------------------------------------------------------
   Repository summaries
   -------------------------------------------------------------------------- */

export function fixtureRepoSummary(ref: RepoRef): RepoSummary {
  const runs = runsOf(ref);
  const pulls = fixturePulls(ref);
  const finished = runs.filter((r) => r.status === 'succeeded');
  const weekly = Array.from({ length: WEEKS }, () => 0);
  for (const r of finished) {
    const w = Math.floor((CORPUS_NOW - Date.parse(r.created_at)) / (7 * DAY));
    if (w >= 0 && w < WEEKS) weekly[WEEKS - 1 - w]!++;
  }
  // Every proven claim counts, including one a suppression later covered: it was still a real bug.
  const proven = runs.reduce((n, r) => n + (corpus().findingsByRun.get(r.review_id) ?? []).filter((f) => f.proof?.status === 'proven').length, 0);
  const last = finished[0] ?? runs[0];
  const res = last ? result(last.review_id) : null;
  return {
    ...ref,
    kind: 'fixture',
    description: DESCRIPTION[ref.name] ?? 'A repository Witness reviews.',
    language: languageOf(ref),
    visibility: 'private',
    defaultBranch: res?.repository?.default_branch ?? 'main',
    reviewedPulls: pulls.filter((p) => p.review).length,
    openPulls: pulls.filter((p) => p.state === 'open').length,
    blockedOpen: pulls.filter((p) => p.state === 'open' && p.review?.gate === 'failure').length,
    provenBugs: proven,
    lastGate: last ? asGate(last.gate_conclusion) : null,
    lastReviewedAt: last?.finished_at ?? last?.created_at ?? null,
    weekly,
    medianSeconds: median(finished.map((r) => r.duration_seconds ?? 0).filter((s) => s > 0)),
  };
}

export function fixtureRepoSummaries(): RepoSummary[] {
  return fixtureRepoRefs().map(fixtureRepoSummary);
}

export interface BlockedPull {
  repo: RepoRef;
  number: number;
  title: string;
  proven: number;
  at: string;
}

/** Open corpus PRs held by the merge gate, newest first. */
export function blockedPulls(): BlockedPull[] {
  const out: BlockedPull[] = [];
  for (const ref of fixtureRepoRefs()) {
    for (const p of fixturePulls(ref)) {
      if (p.state === 'open' && p.review?.gate === 'failure') out.push({ repo: ref, number: p.number, title: p.title, proven: p.review.proven, at: p.review.at });
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export interface RepoStats {
  reviewed: number;
  gates: { failure: number; neutral: number; success: number };
  proven: number;
  medianSeconds: number | null;
  /** Finished reviews per week, oldest first. */
  weekly: number[];
}

export function fixtureRepoStats(ref: RepoRef): RepoStats {
  const s = fixtureRepoSummary(ref);
  const gates = { failure: 0, neutral: 0, success: 0 };
  for (const p of fixturePulls(ref)) {
    const g = p.review?.gate;
    if (g) gates[g]++;
  }
  return { reviewed: s.reviewedPulls, gates, proven: s.provenBugs, medianSeconds: s.medianSeconds, weekly: s.weekly };
}

/* --------------------------------------------------------------------------
   One pull request
   -------------------------------------------------------------------------- */

const lastLine = (text: string | null | undefined) =>
  (text ?? '')
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop() ?? null;

const squash = (md: string | null | undefined, max = 260) => {
  const t = (md ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};

const head = (text: string | null | undefined, lines: number) => {
  const all = (text ?? '').replace(/\s+$/, '').split('\n');
  return all.length > lines ? `${all.slice(0, lines).join('\n')}\n…` : all.join('\n') || null;
};

/** The repro test around its first test function (the assertion is what matters), capped at 24 lines. */
function testExcerpt(code: string | null | undefined): string | null {
  if (!code) return null;
  const lines = code.replace(/\s+$/, '').split('\n');
  const at = lines.findIndex((l) => /^\s*(async\s+)?(def|it|test)[\s(]/.test(l) && /test/.test(l));
  const from = at > 24 ? Math.max(0, at - 2) : 0;
  const slice = lines.slice(from, from + 24);
  return `${from > 0 ? '…\n' : ''}${slice.join('\n')}${from + 24 < lines.length ? '\n…' : ''}`;
}

/** The evidence a simulated finding shows in place of its own page: the repro, both runs, the severity inputs. */
function evidenceOf(f: Finding): FindingEvidence {
  return {
    command: f.proof?.command ?? null,
    testExcerpt: testExcerpt(f.proof?.test_code),
    baseExcerpt: head(f.proof?.base?.excerpt, 14),
    headExcerpt: head(f.proof?.head?.excerpt, 14),
    runner: f.proof?.runner ?? null,
    inputs: (f.severity?.inputs as Record<string, number> | undefined) ?? null,
    weights: (f.severity?.weights as Record<string, number> | undefined) ?? null,
    explanation: f.severity?.explanation ?? null,
  };
}

export function toDisplay(f: Finding): DisplayFinding {
  const proof = (f.proof?.status ?? 'not_attempted') as ProofKind;
  return {
    id: f.id,
    fixture: true,
    title: f.title,
    body: squash(f.body_markdown),
    specialist: f.specialist ?? 'quality',
    file: f.location?.file_path ?? '',
    line: f.location?.start_line ?? null,
    language: f.location?.language ?? 'unknown',
    band: f.severity?.band ?? null,
    score: f.severity?.score ?? null,
    proof,
    status: f.status as DisplayFinding['status'],
    blocking: !!f.blocking,
    testFile: f.proof?.test_file_path ?? null,
    baseLine: lastLine(f.proof?.base?.excerpt),
    headLine: lastLine(f.proof?.head?.excerpt),
  };
}

function analysisOf(run: ReviewListItem): AnalysisResult {
  const res = result(run.review_id);
  const findings = (corpus().findingsByRun.get(run.review_id) ?? []).map(toDisplay);
  const counts = countFindings(findings);
  const gate = asGate(res?.gate?.conclusion ?? run.gate_conclusion) ?? 'neutral';
  const audit = getAuditChain().items.filter((e) => e.review_id === run.review_id).length;
  return {
    reviewId: run.review_id,
    gate,
    gateReason: res?.gate?.reason ?? gateReason(gate, counts.proven),
    riskTier: res?.risk_tier ?? run.risk_tier ?? 'standard',
    counts,
    findings,
    filesChanged: res?.context?.files_changed ?? 0,
    filesReviewed: res?.context?.files_reviewed ?? 0,
    excluded: Object.entries(res?.context?.excluded_reasons ?? {}) as [string, string][],
    comments: res?.delivery?.comments_posted ?? run.counts?.published ?? 0,
    auditEvents: audit,
    durationS: res?.timing?.duration_seconds ?? run.duration_seconds ?? 0,
    createdAt: run.created_at,
  };
}

/** A corpus repository's PR: its real latest run when it has one, else a synthesised open PR by that number. */
export function fixturePull(ref: RepoRef, number: number): FixturePullData {
  const runs = byPull(ref).get(number);
  if (!runs || runs.length === 0) {
    return { meta: syntheticPullByNumber(ref, contextOf(ref), number, maxNumber(ref)), result: null, history: [] };
  }
  const latest = latestRun(runs);
  return {
    meta: fixturePullMeta(ref, runs),
    result: latest.status === 'succeeded' ? analysisOf(latest) : null,
    history: runs.map((r) => ({ reviewId: r.review_id, status: r.status, gate: asGate(r.gate_conclusion), at: r.created_at, durationS: r.duration_seconds })),
  };
}

/* --------------------------------------------------------------------------
   Simulation inputs
   -------------------------------------------------------------------------- */

/** The recorded run's stage lengths (live/demo-run.json × time_scale). */
export function stageTiming(): StageTimingInput[] {
  try {
    const run = getDemoRun();
    const scale = run.time_scale > 0 ? run.time_scale : 1;
    return run.stages.map((s) => ({ key: s.key, durationMs: Math.max(40, Math.round(s.duration_ms * scale)), label: s.label }));
  } catch {
    return DEFAULT_TIMING;
  }
}

const poolMemo = new Map<string, CorpusFinding[]>();

type Bucket = (f: DisplayFinding) => boolean;
const BUCKETS: [name: string, pred: Bucket, cap: number][] = [
  ['proven', (f) => f.proof === 'proven', 8],
  ['refuted', (f) => f.proof === 'disproven', 4],
  ['inconclusive', (f) => f.proof === 'inconclusive', 4],
  ['advisory', (f) => f.status === 'published' && (f.proof === 'not_attempted' || f.proof === 'not_applicable'), 10],
  ['suppressed', (f) => f.status === 'suppressed', 4],
  ['dropped', (f) => f.status === 'dropped', 10],
];

/**
 * The findings a simulated review may borrow. For a corpus repository: its
 * own findings, bucket by bucket, falling back to findings in the same
 * language when it has none of a kind (never to another language, so paths
 * stay plausible; a bucket with nothing plausible stays empty and the
 * simulation never produces that outcome). Outside the corpus: a sample of
 * every kind, which the page labels as examples from the demo corpus.
 */
export function simulationPool(ref: RepoRef | null = null): CorpusFinding[] {
  const key = ref ? `${ref.owner}/${ref.name}`.toLowerCase() : '*';
  const hit = poolMemo.get(key);
  if (hit) return hit;
  const all = getFindings();
  const known = ref ? findFixtureRepo(ref.owner, ref.name) : null;
  const own = known ? new Set(runsOf(known).map((r) => r.review_id)) : null;
  const lang = known ? findingLanguageOf(known) : null;
  const mine = own ? all.filter((f) => own.has(f.review_id)).map(toRich) : [];
  const sameLang = lang ? all.filter((f) => !own!.has(f.review_id) && (f.location?.language ?? 'unknown') === lang).map(toRich) : [];
  const everything = all.map(toRich);
  const pool: CorpusFinding[] = [];
  for (const [, pred, cap] of BUCKETS) {
    const source = known ? (mine.some(pred) ? mine : sameLang) : everything;
    pool.push(...source.filter(pred).slice(0, cap));
  }
  const out = pool.map((f) => ({ ...f, body: squash(f.body, 220) }));
  poolMemo.set(key, out);
  return out;
}

function toRich(f: Finding): DisplayFinding {
  return { ...toDisplay(f), evidence: evidenceOf(f) };
}

/** Which outcomes a pool can support. */
export function capsOf(pool: CorpusFinding[]): SimCaps {
  return {
    proven: pool.some((f) => f.proof === 'proven'),
    refuted: pool.some((f) => f.proof === 'disproven'),
    inconclusive: pool.some((f) => f.proof === 'inconclusive'),
    suppressed: pool.some((f) => f.status === 'suppressed'),
  };
}

/** The one run the recorded replay exists for (manifest ids.demo_review_id). */
export function demoReviewId(): string {
  return getManifest().ids.demo_review_id;
}

/** What the "not connected" hero quotes: proven bugs and finished reviews in the corpus. */
export function corpusTotals(): { proven: number; reviews: number; repositories: number; org: string } {
  const m = getManifest();
  const a = getAccuracy();
  // The product's canonical figures: 26 proven bugs across 76 reviews (71 of them completed).
  return { proven: a.proof.proven ?? 0, reviews: m.counts.runs ?? corpus().runs.length, repositories: m.counts.repositories, org: m.ids.repository.owner };
}
