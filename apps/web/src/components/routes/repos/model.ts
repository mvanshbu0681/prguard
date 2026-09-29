// The Repositories flow's shared model: types, a seeded PRNG, the paste-box
// parser and the deterministic synthesis that makes the flow demoable beyond
// the fixture corpus (unreviewed open PRs, imported repositories, a simulated
// analysis). Pure and client-safe: the server view models (data.server.ts)
// and the client views both build on it, and tests drive it directly.
//
// Determinism: every synthetic value is a function of a string seed (repo slug,
// PR number). There is no Math.random anywhere in this flow, so a PR analysed
// twice, on two machines, shows the same findings in the same order.
import { PR_SHORTHAND_PATTERN, PR_URL_PATTERN } from '@/components/sections/close/pr-validation';
import { CORPUS_NOW } from '@/components/dash/format';
import { STAGES, type Stage } from '@/lib/contracts';

/* ==========================================================================
   Core types
   ========================================================================== */

export type Gate = 'failure' | 'success' | 'neutral';
export type RepoKind = 'fixture' | 'synthetic';

export interface RepoRef {
  owner: string;
  name: string;
}

export type LangKey = 'python' | 'typescript' | 'hcl' | 'go' | 'rust' | 'ruby';

export const LANGS: Record<LangKey, { label: string; color: string }> = {
  python: { label: 'Python', color: '#3572A5' },
  typescript: { label: 'TypeScript', color: '#3178C6' },
  hcl: { label: 'HCL', color: '#844FBA' },
  go: { label: 'Go', color: '#00ADD8' },
  rust: { label: 'Rust', color: '#DEA584' },
  ruby: { label: 'Ruby', color: '#CC342D' },
};

export interface RepoSummary extends RepoRef {
  kind: RepoKind;
  /** Null for a repository outside the corpus: Witness has not read it. */
  description: string | null;
  language: LangKey | null;
  visibility: 'private' | 'public' | null;
  defaultBranch: string | null;
  /** Pull requests with at least one finished review. */
  reviewedPulls: number;
  /** Open pull requests, reviewed or not. */
  openPulls: number;
  /** Open pull requests whose latest review holds the merge gate. */
  blockedOpen: number;
  provenBugs: number;
  lastGate: Gate | null;
  lastReviewedAt: string | null;
  /** Finished reviews per week, oldest first (6 weeks to the corpus instant). */
  weekly: number[];
  medianSeconds: number | null;
}

export interface PullMeta {
  number: number;
  title: string;
  author: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  baseSha: string;
  updatedAt: string;
  files: number;
  additions: number;
  deletions: number;
  state: 'open' | 'merged';
  kind: RepoKind;
  /**
   * corpus: a real fixture PR. demo: one of the open PRs the acme demo
   * repositories carry (plausible for that repository, tagged Simulated).
   * placeholder: anything else — a pasted number or an imported repository's
   * PR, which Witness knows nothing about: "Pull request #N", no author, no
   * branches, no diff.
   */
  origin: 'corpus' | 'demo' | 'placeholder';
}

export interface ReviewBrief {
  /** The fixture run id; null for a review simulated in this browser. */
  reviewId: string | null;
  status: 'succeeded' | 'failed' | 'cancelled' | 'running';
  gate: Gate | null;
  /** Findings posted to the PR. */
  published: number;
  proven: number;
  at: string;
  durationS: number | null;
}

export interface PullRow extends PullMeta {
  review: ReviewBrief | null;
}

export type ProofKind = 'proven' | 'disproven' | 'inconclusive' | 'not_attempted' | 'not_applicable' | 'skipped_no_env';
export type FindingKind = 'published' | 'disproven' | 'dropped' | 'suppressed' | 'proposed';

/** A finding as the Repositories flow renders it (a compact projection of the API Finding). */
export interface DisplayFinding {
  id: string;
  /** True when `id` is a real fixture finding (the card links to /findings/<id>). */
  fixture: boolean;
  title: string;
  body: string;
  specialist: string;
  file: string;
  line: number | null;
  language: string;
  band: string | null;
  score: number | null;
  proof: ProofKind;
  status: FindingKind;
  blocking: boolean;
  testFile: string | null;
  /** Last line of the repro's output at base / head, e.g. "1 passed in 0.42s". */
  baseLine: string | null;
  headLine: string | null;
  /** Evidence detail, carried only by the simulation pool (a simulated finding has no page of its own). */
  evidence?: FindingEvidence;
}

export interface FindingEvidence {
  command: string | null;
  /** The repro test, trimmed to its first lines. */
  testExcerpt: string | null;
  baseExcerpt: string | null;
  headExcerpt: string | null;
  runner: string | null;
  inputs: Record<string, number> | null;
  weights: Record<string, number> | null;
  explanation: string | null;
}

export interface AnalysisCounts {
  raised: number;
  dropped: number;
  suppressed: number;
  refuted: number;
  /** Posted, not proven. */
  advisory: number;
  /** Proven by execution (a low-severity proven bug may still not block). */
  proven: number;
  /** Proven and holding the merge gate. */
  blocking: number;
  inconclusive: number;
}

export interface AnalysisResult {
  reviewId: string | null;
  gate: Gate;
  gateReason: string;
  riskTier: string;
  counts: AnalysisCounts;
  findings: DisplayFinding[];
  filesChanged: number;
  filesReviewed: number;
  excluded: [path: string, reason: string][];
  comments: number;
  auditEvents: number;
  durationS: number;
  createdAt: string | null;
}

export interface RunHistoryItem {
  reviewId: string;
  status: string;
  gate: Gate | null;
  at: string;
  durationS: number | null;
}

/** What the server knows about a corpus PR: its meta, its latest succeeded run's result, every run. */
export interface FixturePullData {
  meta: PullMeta;
  result: AnalysisResult | null;
  history: RunHistoryItem[];
}

/* ==========================================================================
   Slugs and hrefs
   ========================================================================== */

export const slugOf = (r: RepoRef) => `${r.owner}/${r.name}`;
export const pullKey = (r: RepoRef, n: number) => `${r.owner}/${r.name}#${n}`.toLowerCase();
export const sameRepo = (a: RepoRef, b: RepoRef) => a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();
export const repoHref = (r: RepoRef) => `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.name)}`;
export const pullHref = (r: RepoRef, n: number) => `${repoHref(r)}/pulls/${n}`;
export const githubRepoUrl = (r: RepoRef) => `https://github.com/${r.owner}/${r.name}`;
export const githubPullUrl = (r: RepoRef, n: number) => `${githubRepoUrl(r)}/pull/${n}`;

/* ==========================================================================
   Seeded randomness
   ========================================================================== */

/** FNV-1a, 32-bit. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  (): number;
  int(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  hex(n: number): string;
}

/** mulberry32 over the FNV hash of `seed`: a stable stream of [0, 1). */
export function rng(seed: string): Rng {
  let a = hashSeed(seed);
  const next = (() => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (xs) => xs[Math.floor(next() * xs.length)]!;
  next.chance = (p) => next() < p;
  next.hex = (n) => {
    let s = '';
    while (s.length < n) s += Math.floor(next() * 16).toString(16);
    return s;
  };
  return next;
}

/* ==========================================================================
   The paste box
   ========================================================================== */

export type ParsedInput =
  | { kind: 'pull'; owner: string; name: string; number: number }
  | { kind: 'repo'; owner: string; name: string }
  | { kind: 'owner'; owner: string }
  | { kind: 'error'; message: string };

const NAME = '[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})';
const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})';
const GH_REPO = new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/(${OWNER})/(${NAME})(?:\\.git)?/?(?:(?:tree|blob|pulls|issues|actions)(?:/.*)?)?(?:[?#].*)?$`, 'i');
const GH_OWNER = new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/(${OWNER})/?(?:[?#].*)?$`, 'i');
const SHORT_REPO = new RegExp(`^(${OWNER})/(${NAME})$`);
const AT_OWNER = new RegExp(`^@(${OWNER})$`);
const SSH_REPO = new RegExp(`^git@github\\.com:(${OWNER})/(${NAME})$`, 'i');
/** GitHub paths that are not accounts. */
const RESERVED_OWNERS = new Set(['orgs', 'settings', 'marketplace', 'explore', 'topics', 'features', 'login', 'about', 'pricing', 'apps', 'notifications', 'new', 'search', 'sponsors']);

export const EMPTY_INPUT_MESSAGE = 'Paste a GitHub link: an organisation, a repository or a pull request.';
export const INVALID_INPUT_MESSAGE = 'That is not a GitHub link Witness can open. Try github.com/owner/repo/pull/42 or owner/repo#42.';

const stripGit = (name: string) => name.replace(/\.git$/i, '');

/**
 * Reads what someone pasted: a pull request (the backend's two shapes, from
 * pr-validation), a repository (URL, SSH remote or owner/name) or an account
 * (github.com/owner or @owner). Anything else is an inline error.
 */
export function parseRepoInput(raw: string): ParsedInput {
  const input = raw.trim();
  if (!input) return { kind: 'error', message: EMPTY_INPUT_MESSAGE };
  const pr = input.match(PR_URL_PATTERN) ?? input.match(PR_SHORTHAND_PATTERN);
  if (pr) {
    const number = Number(pr[3]);
    if (!Number.isSafeInteger(number) || number < 1) return { kind: 'error', message: INVALID_INPUT_MESSAGE };
    return { kind: 'pull', owner: pr[1]!, name: stripGit(pr[2]!), number };
  }
  const repo = input.match(GH_REPO) ?? input.match(SSH_REPO) ?? input.match(SHORT_REPO);
  if (repo && !RESERVED_OWNERS.has(repo[1]!.toLowerCase())) return { kind: 'repo', owner: repo[1]!, name: stripGit(repo[2]!) };
  const owner = input.match(GH_OWNER) ?? input.match(AT_OWNER);
  if (owner && !RESERVED_OWNERS.has(owner[1]!.toLowerCase())) return { kind: 'owner', owner: owner[1]! };
  return { kind: 'error', message: INVALID_INPUT_MESSAGE };
}

export type PasteTarget =
  | { action: 'navigate'; href: string; importRepo: RepoRef | null }
  | { action: 'connect'; owner: string }
  | { action: 'error'; message: string };

/**
 * Where a paste goes. A repository already in the workspace (connected or
 * imported) opens in place, with its canonical casing; an unknown one is
 * imported first. An account link starts the GitHub connection for it.
 */
export function resolvePaste(raw: string, workspace: readonly RepoRef[]): PasteTarget {
  const parsed = parseRepoInput(raw);
  if (parsed.kind === 'error') return { action: 'error', message: parsed.message };
  if (parsed.kind === 'owner') return { action: 'connect', owner: parsed.owner };
  const known = workspace.find((r) => sameRepo(r, parsed));
  const ref: RepoRef = known ?? { owner: parsed.owner, name: parsed.name };
  const href = parsed.kind === 'pull' ? pullHref(ref, parsed.number) : repoHref(ref);
  return { action: 'navigate', href, importRepo: known ? null : ref };
}

/* ==========================================================================
   Accounts and synthetic repositories
   ========================================================================== */

export const DEMO_ORG = 'acme';
export const PERSONAL_ACCOUNT = 'witness-admin';

/**
 * Repository names an account holds, for accounts outside the corpus: none.
 * Witness cannot list a real account's repositories in this demo, so it does
 * not invent any; they are added one by one by pasting a link.
 */
export function syntheticRepoNames(owner: string): string[] {
  void owner;
  return [];
}

/**
 * The open PRs each acme demo repository carries beyond the corpus, written
 * for that repository so titles, paths and authors stay plausible. They are
 * demo data and every view tags them "Simulated".
 */
export const DEMO_TITLES: Record<string, string[]> = {
  'checkout-service': [
    'Retry card authorisation once on a gateway timeout',
    'Round tax per line before summing the invoice',
    'Store the idempotency key with the charge',
    'Show the discount code on the receipt',
  ],
  'identity-gateway': [
    'Rotate refresh tokens on every use',
    'Rate-limit password resets per account',
    'Log the SCIM client on each deprovision',
    'Shorten admin sessions to eight hours',
  ],
  'web-storefront': [
    'Debounce search suggestions',
    'Persist the cart across tabs',
    'Guard the checkout button against a double submit',
    'Lazy-load the product carousel',
  ],
  ledger: [
    'Batch ledger writes inside one transaction',
    'Reject payouts into a closed period',
    'Reconcile refunds against the original entry',
    'Store amounts as integer minor units',
  ],
  notifications: [
    'Retry idempotent webhooks with jittered backoff',
    'Drop push tokens after three bounces',
    'Render the unsubscribe link in every template',
    'Move digest emails onto the queue',
  ],
  'infra-terraform': [
    'Pin provider versions across environments',
    'Add a lifecycle rule for the log archive',
    'Tighten the bucket policy for invoice exports',
    'Split the staging VPC into two subnets',
  ],
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 4)
    .join('-');
}

/** `mhollis` + "Resolve account currency at charge time" → `mhollis/resolve-account-currency-at`. */
export function branchFor(author: string, title: string): string {
  return `${author}/${slugify(title)}`;
}

/** A plausible diff size for a PR, stable per seed. */
export function diffStat(seed: string, files?: number): { files: number; additions: number; deletions: number } {
  const r = rng(`diff:${seed}`);
  const f = files ?? r.int(2, 11);
  return { files: f, additions: r.int(8, 26) * f + r.int(0, 20), deletions: r.int(1, 9) * f + r.int(0, 8) };
}

/** Which proof outcomes a repository's findings can show (a Terraform repository has no executable repro). */
export interface SimCaps {
  proven: boolean;
  refuted: boolean;
  inconclusive: boolean;
  suppressed: boolean;
}

export const ALL_CAPS: SimCaps = { proven: true, refuted: true, inconclusive: true, suppressed: true };

export interface SyntheticContext {
  /** Null when Witness cannot know the language (a repository outside the corpus). */
  language: LangKey | null;
  authors: readonly string[];
  defaultBranch: string | null;
  kind: RepoKind;
  /** The repository's demo PR titles; absent outside the demo org, so no PR is invented. */
  titles?: readonly string[];
  caps?: SimCaps;
}

/** Context for a repository outside the corpus: nothing known, nothing invented. */
export function contextFor(ref: RepoRef, overrides: Partial<SyntheticContext> = {}): SyntheticContext {
  void ref;
  return { language: null, authors: [], defaultBranch: null, kind: 'synthetic', ...overrides };
}

/** A PR Witness knows nothing about: its number, and a visible "Simulated" wherever it shows. */
export function placeholderPull(ref: RepoRef, number: number, ctx: SyntheticContext): PullMeta {
  void ref;
  return {
    number,
    title: `Pull request #${number}`,
    author: '',
    headBranch: '',
    baseBranch: ctx.defaultBranch ?? '',
    headSha: '',
    baseSha: '',
    updatedAt: '',
    files: 0,
    additions: 0,
    deletions: 0,
    state: 'open',
    kind: ctx.kind,
    origin: 'placeholder',
  };
}

/** One of an acme repository's demo PRs: its title, an author from that repository's corpus, a stable diff. */
function demoPull(ref: RepoRef, number: number, title: string, ctx: SyntheticContext, minutesAgo: number): PullMeta {
  const seed = `${slugOf(ref).toLowerCase()}#${number}`;
  const r = rng(`pull:${seed}`);
  const author = ctx.authors.length ? r.pick(ctx.authors) : 'octo';
  return {
    number,
    title,
    author,
    headBranch: branchFor(author, title),
    baseBranch: ctx.defaultBranch ?? 'main',
    headSha: r.hex(40),
    baseSha: r.hex(40),
    updatedAt: new Date(CORPUS_NOW - minutesAgo * 60_000).toISOString(),
    ...diffStat(seed),
    state: 'open',
    kind: ctx.kind,
    origin: 'demo',
  };
}

/**
 * The open, not-yet-reviewed PRs an acme demo repository carries so the flow
 * is demoable: 2–3, numbered above its newest reviewed PR, titles from its own
 * bank. Any other repository carries none.
 */
export function syntheticOpenPulls(ref: RepoRef, ctx: SyntheticContext, afterNumber?: number): PullMeta[] {
  const titles = ctx.titles ?? [];
  if (!titles.length || afterNumber == null) return [];
  const r = rng(`open:${slugOf(ref).toLowerCase()}`);
  const count = Math.min(titles.length, r.int(2, 3));
  const order = [...titles];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const numbers: number[] = [];
  for (let n = afterNumber + 1; numbers.length < count; n += r.int(1, 3)) numbers.push(n);
  let minutes = r.int(9, 40);
  // Newest (highest number) was updated most recently.
  return numbers
    .sort((a, b) => b - a)
    .map((n, i) => {
      const p = demoPull(ref, n, order[i]!, ctx, minutes);
      minutes += r.int(35, 60 * 9);
      return p;
    });
}

/** A PR by number: the demo list's entry when it is one, else a placeholder. */
export function syntheticPullByNumber(ref: RepoRef, ctx: SyntheticContext, number: number, afterNumber?: number): PullMeta {
  return syntheticOpenPulls(ref, ctx, afterNumber).find((p) => p.number === number) ?? placeholderPull(ref, number, ctx);
}

/** A repository outside the corpus: its name and nothing Witness would have to make up. */
export function syntheticRepoSummary(ref: RepoRef): RepoSummary {
  return {
    ...ref,
    kind: 'synthetic',
    description: null,
    language: null,
    visibility: null,
    defaultBranch: null,
    reviewedPulls: 0,
    openPulls: 0,
    blockedOpen: 0,
    provenBugs: 0,
    lastGate: null,
    lastReviewedAt: null,
    weekly: [],
    medianSeconds: null,
  };
}

/* ==========================================================================
   The simulated analysis
   ========================================================================== */

/**
 * What a simulated review concludes, from the seed and the repository's
 * capabilities alone (no corpus needed), so rows, cards and the result page
 * agree. A repository whose corpus never proved or refuted anything
 * (Terraform) never simulates one.
 */
export function syntheticOutcome(ref: RepoRef, number: number, caps: SimCaps = ALL_CAPS): AnalysisCounts & { gate: Gate } {
  const r = rng(`outcome:${slugOf(ref).toLowerCase()}#${number}`);
  const roll = r();
  const proven = caps.proven ? (roll < 0.42 ? 0 : roll < 0.84 ? 1 : 2) : 0;
  const refuted = r.chance(0.45) && caps.refuted ? 1 : 0;
  const inconclusive = r.chance(0.25) && caps.inconclusive ? 1 : 0;
  const advisory = r.int(1, 3) + inconclusive;
  const suppressed = r.chance(0.3) && caps.suppressed ? 1 : 0;
  const dropped = r.int(1, 5);
  const raised = proven + refuted + advisory + suppressed + dropped;
  const gate: Gate = proven > 0 ? 'failure' : inconclusive > 0 ? 'neutral' : 'success';
  return { raised, dropped, suppressed, refuted, advisory, proven, blocking: proven, inconclusive, gate };
}

export function briefFromOutcome(o: AnalysisCounts & { gate: Gate }, at: string, durationS: number): ReviewBrief {
  return { reviewId: null, status: 'succeeded', gate: o.gate, published: o.proven + o.advisory, proven: o.proven, at, durationS };
}

/** The finding texts a simulated review borrows from the demo corpus. */
export type CorpusFinding = DisplayFinding;

function takeFrom(pool: CorpusFinding[], r: Rng, lang: string | null, used: Set<string>): CorpusFinding | null {
  const fresh = pool.filter((f) => !used.has(f.id));
  if (fresh.length === 0) return null;
  const sameLang = lang ? fresh.filter((f) => f.language === lang) : [];
  const f = r.pick(sameLang.length ? sameLang : fresh);
  used.add(f.id);
  return f;
}

const GATE_REASON: Record<Gate, (proven: number) => string> = {
  failure: (n) => `${n === 1 ? '1 finding carries' : `${n} findings carry`} a repro test that passes at base and fails at head.`,
  neutral: () => 'Nothing is proven, but a repro did not settle its claim.',
  success: () => 'No finding is proven. Nothing blocks the merge.',
};

export function gateReason(gate: Gate, proven: number): string {
  return GATE_REASON[gate](proven);
}

/**
 * A full simulated review for a PR outside the corpus: the outcome's counts,
 * filled with findings borrowed from the demo corpus (same language first),
 * re-identified so they never pose as the corpus's own findings.
 */
export function synthesizeResult(ref: RepoRef, pull: PullMeta, pool: CorpusFinding[], language: string | null, caps: SimCaps = ALL_CAPS): AnalysisResult {
  const o = syntheticOutcome(ref, pull.number, caps);
  const r = rng(`findings:${slugOf(ref).toLowerCase()}#${pull.number}`);
  const used = new Set<string>();
  const findings: DisplayFinding[] = [];
  const add = (source: CorpusFinding[], n: number, patch: Partial<DisplayFinding>) => {
    for (let i = 0; i < n; i++) {
      const f = takeFrom(source, r, language, used);
      if (!f) return;
      findings.push({ ...f, ...patch, id: `sim-${pull.number}-${findings.length}`, fixture: false });
    }
  };
  const by = (pred: (f: CorpusFinding) => boolean) => pool.filter(pred);
  add(by((f) => f.proof === 'proven'), o.proven, { status: 'published', blocking: true });
  add(by((f) => f.proof === 'inconclusive'), o.inconclusive, { status: 'published', blocking: false });
  add(by((f) => f.status === 'published' && (f.proof === 'not_attempted' || f.proof === 'not_applicable')), o.advisory - o.inconclusive, { status: 'published', blocking: false });
  add(by((f) => f.proof === 'disproven'), o.refuted, { status: 'disproven', blocking: false });
  add(by((f) => f.status === 'suppressed'), o.suppressed, { status: 'suppressed', blocking: false });
  add(by((f) => f.status === 'dropped'), o.dropped, { status: 'dropped', blocking: false });
  const executable = o.proven + o.refuted + o.inconclusive;
  return {
    reviewId: null,
    gate: o.gate,
    gateReason: gateReason(o.gate, o.proven),
    riskTier: pull.files > 6 ? 'full' : 'standard',
    counts: {
      raised: o.raised,
      dropped: o.dropped,
      suppressed: o.suppressed,
      refuted: o.refuted,
      advisory: o.advisory,
      proven: o.proven,
      blocking: o.blocking,
      inconclusive: o.inconclusive,
    },
    findings,
    filesChanged: pull.files,
    filesReviewed: pull.files,
    excluded: [],
    comments: o.proven + o.advisory,
    auditEvents: 6 + o.raised + executable * 2,
    durationS: 0,
    createdAt: null,
  };
}

/** Counts for a real run's findings, in the flow's four buckets. */
export function countFindings(findings: DisplayFinding[]): AnalysisCounts {
  const c: AnalysisCounts = { raised: findings.length, dropped: 0, suppressed: 0, refuted: 0, advisory: 0, proven: 0, blocking: 0, inconclusive: 0 };
  for (const f of findings) {
    if (f.status === 'dropped' || f.status === 'proposed') c.dropped++;
    else if (f.status === 'suppressed') c.suppressed++;
    else if (f.status === 'disproven' || f.proof === 'disproven') c.refuted++;
    else if (f.proof === 'proven') {
      c.proven++;
      if (f.blocking) c.blocking++;
    } else {
      c.advisory++;
      if (f.proof === 'inconclusive') c.inconclusive++;
    }
  }
  return c;
}

export type FindingGroup = 'proven' | 'advisory' | 'refuted' | 'suppressed' | 'dropped';

export function groupOf(f: DisplayFinding): FindingGroup {
  if (f.status === 'dropped' || f.status === 'proposed') return 'dropped';
  if (f.status === 'suppressed') return 'suppressed';
  if (f.status === 'disproven' || f.proof === 'disproven') return 'refuted';
  // A proven bug under the blocking threshold is still posted, as a comment.
  if (f.proof === 'proven' && f.blocking) return 'proven';
  return 'advisory';
}

/** Highest computed severity first; unscored last. */
export function bySeverity(a: DisplayFinding, b: DisplayFinding): number {
  return (b.score ?? -1) - (a.score ?? -1);
}

/* ==========================================================================
   The run timeline (modelled on live/demo-run.json)
   ========================================================================== */

export interface TimelineStage {
  key: Stage;
  label: string;
  startMs: number;
  durationMs: number;
}

export interface StageTimingInput {
  key: Stage;
  durationMs: number;
  label: string;
}

/** The recorded demo run's shape, used when the corpus timing is unavailable (tests). */
export const DEFAULT_TIMING: StageTimingInput[] = [
  { key: 'ingest', durationMs: 920, label: 'Resolving the pull request and fetching the diff' },
  { key: 'context', durationMs: 1560, label: 'Building review context from the changed files' },
  { key: 'specialists', durationMs: 7130, label: 'Running 4 specialist passes' },
  { key: 'coordinator', durationMs: 3240, label: 'Merging and filtering specialist findings' },
  { key: 'severity', durationMs: 45, label: 'Scoring severity from the stored inputs' },
  { key: 'identity', durationMs: 155, label: 'Fingerprinting findings and applying the suppression ledger' },
  { key: 'proof', durationMs: 6435, label: 'Generating and executing repro tests' },
  { key: 'delivery', durationMs: 980, label: 'Posting the review and setting the gate' },
  { key: 'finalise', durationMs: 135, label: 'Recomputing counters and writing audit events' },
];

/**
 * The nine stages laid end to end. The two model-bound stages (specialists and
 * proof) stretch with the size of the diff, so a 2-file PR finishes sooner than
 * an 11-file one; everything else keeps the recorded length.
 */
export function buildTimeline(timing: readonly StageTimingInput[], files: number): TimelineStage[] {
  const stretch = Math.min(1.2, Math.max(0.8, 0.72 + files / 26));
  const byKey = new Map(timing.map((t) => [t.key, t]));
  let at = 0;
  return STAGES.map((key) => {
    const t = byKey.get(key) ?? DEFAULT_TIMING.find((d) => d.key === key)!;
    const durationMs = Math.round(key === 'specialists' || key === 'proof' ? t.durationMs * stretch : t.durationMs);
    const stage = { key, label: t.label, startMs: at, durationMs };
    at += durationMs;
    return stage;
  });
}

export const timelineTotal = (tl: TimelineStage[]) => (tl.length ? tl[tl.length - 1]!.startMs + tl[tl.length - 1]!.durationMs : 0);

export interface LogLine {
  atMs: number;
  stage: Stage;
  text: string;
  tone?: 'ok' | 'bad' | 'warn' | 'muted';
}

export interface ClaimCue {
  id: string;
  claimedAt: number;
  /** When the coordinator rules on it (dropped claims vanish here). */
  settledAt: number;
  /** When its verdict (proof, advisory, suppression) lands. */
  verdictAt: number;
}

export interface RunScript {
  stages: TimelineStage[];
  totalMs: number;
  lines: LogLine[];
  claims: ClaimCue[];
}

const short = (sha: string) => sha.slice(0, 7);
const SPECIALIST_ORDER = ['bugs', 'security', 'tests', 'quality'];

/** Everything the live view reveals, each cue pinned to a time on the timeline. */
export function buildScript(result: AnalysisResult, pull: PullMeta, ref: RepoRef, timing: readonly StageTimingInput[]): RunScript {
  const stages = buildTimeline(timing, pull.files);
  const at = (key: Stage, frac: number) => {
    const s = stages.find((x) => x.key === key)!;
    return Math.round(s.startMs + s.durationMs * frac);
  };
  const lines: LogLine[] = [];
  const log = (key: Stage, frac: number, text: string, tone?: LogLine['tone']) => lines.push({ atMs: at(key, frac), stage: key, text, tone });
  const c = result.counts;
  const kept = c.raised - c.dropped;
  const executable = result.findings.filter((f) => f.status !== 'dropped' && f.status !== 'proposed' && ['proven', 'disproven', 'inconclusive'].includes(f.proof));

  const known = pull.origin !== 'placeholder';
  const at7 = (label: string, sha: string) => (sha ? `${label} ${short(sha)}` : label);
  log('ingest', 0.12, `Resolving ${slugOf(ref)}#${pull.number}`);
  log('ingest', 0.55, `${at7('base', pull.baseSha)} → ${at7('head', pull.headSha)}`, 'muted');
  log('ingest', 0.92, known ? `Fetched the diff · ${pull.files} files · +${pull.additions} −${pull.deletions}` : 'Fetched the diff (simulated)');
  log('context', 0.3, known ? `Reading ${result.filesReviewed} changed ${result.filesReviewed === 1 ? 'file' : 'files'}` : 'Reading the changed files');
  if (result.excluded.length) for (const [p, why] of result.excluded) log('context', 0.65, `Left out ${p} (${why})`, 'muted');
  log('context', 0.94, `Risk tier: ${result.riskTier}`, 'muted');
  log('specialists', 0.06, 'Four specialists read the diff in parallel');
  const per = new Map<string, number>();
  for (const f of result.findings) per.set(f.specialist, (per.get(f.specialist) ?? 0) + 1);
  const lanes = [...new Set([...SPECIALIST_ORDER, ...per.keys()])];
  lanes.forEach((sp, i) => {
    const n = per.get(sp) ?? 0;
    log('specialists', 0.34 + (0.6 * i) / Math.max(1, lanes.length - 1), `${sp}: ${n === 0 ? 'nothing to raise' : n === 1 ? 'raised 1 claim' : `raised ${n} claims`}`, n === 0 ? 'muted' : undefined);
  });
  log('coordinator', 0.25, `Merging ${c.raised} ${c.raised === 1 ? 'claim' : 'claims'} from four passes`);
  log('coordinator', 0.82, `Dropped ${c.dropped} as noise or duplicates · ${kept} kept`, c.dropped ? 'muted' : undefined);
  const top = [...result.findings].filter((f) => f.status !== 'dropped').sort(bySeverity)[0];
  log('severity', 0.5, top?.score != null ? `Scored ${kept} · highest ${top.score.toFixed(3)} ${top.band ?? ''}`.trim() : `Scored ${kept} findings`);
  log('identity', 0.6, c.suppressed ? `${c.suppressed} ${c.suppressed === 1 ? 'matches' : 'match'} an existing suppression rule` : 'Fingerprinted every finding · no suppression matched', 'muted');
  log('proof', 0.05, executable.length ? `Writing ${executable.length} repro ${executable.length === 1 ? 'test' : 'tests'} · sandbox at base and head` : 'No claim is executable · nothing to prove');
  executable.forEach((f, j) => {
    const frac = 0.25 + (0.68 * (j + 1)) / (executable.length + 1);
    const test = f.testFile ? f.testFile.split('/').pop() : 'repro test';
    if (f.proof === 'proven') log('proof', frac, `${test} · passes at ${pull.baseSha ? short(pull.baseSha) : 'base'}, fails at ${pull.headSha ? short(pull.headSha) : 'head'} → proven`, 'bad');
    else if (f.proof === 'disproven') log('proof', frac, `${test} · passes at head too → refuted, withdrawn`, 'ok');
    else log('proof', frac, `${test} · did not settle the claim → inconclusive`, 'warn');
  });
  log('delivery', 0.4, `Posted ${result.comments} ${result.comments === 1 ? 'comment' : 'comments'} on #${pull.number}`);
  log(
    'delivery',
    0.88,
    `witness/merge-gate → ${result.gate === 'failure' ? 'failing: blocks the merge' : result.gate === 'success' ? 'passing' : 'neutral'}`,
    result.gate === 'failure' ? 'bad' : result.gate === 'success' ? 'ok' : 'warn',
  );
  log('finalise', 0.6, `Sealed ${result.auditEvents} audit events into the chain`, 'muted');
  lines.sort((a, b) => a.atMs - b.atMs);

  const spec = stages.find((s) => s.key === 'specialists')!;
  const coordEnd = at('coordinator', 0.82);
  const severityEnd = at('severity', 1);
  const identityEnd = at('identity', 1);
  const claims: ClaimCue[] = result.findings.map((f, i) => {
    const claimedAt = Math.round(spec.startMs + spec.durationMs * (0.12 + (0.82 * (i + 1)) / (result.findings.length + 1)));
    const e = executable.indexOf(f);
    const verdictAt =
      f.status === 'dropped' || f.status === 'proposed'
        ? coordEnd
        : f.status === 'suppressed'
          ? identityEnd
          : e >= 0
            ? at('proof', 0.25 + (0.68 * (e + 1)) / (executable.length + 1))
            : severityEnd;
    return { id: f.id, claimedAt, settledAt: coordEnd, verdictAt };
  });
  return { stages, totalMs: timelineTotal(stages), lines, claims };
}

/** The stage running at `elapsed` (the last one once the run is over). */
export function stageAt(stages: TimelineStage[], elapsed: number): { index: number; stage: TimelineStage; done: boolean } {
  const total = timelineTotal(stages);
  if (elapsed >= total) return { index: stages.length - 1, stage: stages[stages.length - 1]!, done: true };
  let i = 0;
  while (i < stages.length - 1 && elapsed >= stages[i]!.startMs + stages[i]!.durationMs) i++;
  return { index: i, stage: stages[i]!, done: false };
}
