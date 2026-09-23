// OWNER: t2a (wave 1). A small inline corpus for the data-layer tests, shaped by
// the generated types, so the tests do not depend on whether t2b's generated
// corpus or the stubs are on disk.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type {
  AccuracyReport,
  DemoRun,
  Finding,
  ReviewListItem,
  ReviewResult,
  ReviewStatus,
  SuppressionItem,
} from "@/lib/api-types";
import { DEMO_IDS } from "@/lib/demo-ids";
import { createFixtureResolver, FixtureMissingError, type FixtureResolverOptions } from "@/lib/fixture-resolver";
import { FIXTURE_FILES } from "@/lib/fixture-types";

export const API = "http://localhost:8000";
export const REVIEW_A = DEMO_IDS.demo_review_id; // acme/checkout-service #4821
export const REVIEW_B = "b0000000-0000-4000-8000-000000000002"; // acme/api-gateway #77
export const REVIEW_C = "c0000000-0000-4000-8000-000000000003"; // other/tool #3, failed at stage 3

const FP1 = "f".repeat(63) + "1";
const FP2 = "f".repeat(63) + "2";
const FP3 = "f".repeat(63) + "3";
const FP4 = "f".repeat(63) + "4";
const FP5 = "f".repeat(63) + "5";
export const FP = { FP1, FP2, FP3, FP4, FP5 };

const weights = { path_sensitivity: 0.25, reachability: 0.2, blast_radius: 0.15, coverage_gap: 0.15, proof_confidence: 0.15, churn: 0.1 };
const inputs = { reachability: 1, blast_radius: 0.7, path_sensitivity: 1, coverage_gap: 0.5, churn: 0.3, proof_confidence: 1 };

function finding(over: Partial<Finding> & Pick<Finding, "id" | "review_id" | "created_at" | "status">): Finding {
  return {
    category: "correctness",
    rule_key: "unguarded_none_attribute",
    title: `finding ${over.id}`,
    body_markdown: "body",
    location: { file_path: "app/checkout.py", start_line: 41, end_line: 44, side: "RIGHT", language: "python", symbol_path: "app/checkout.py::create_session" },
    blocking: false,
    delivery: { mode: "inline_exact", delivered_line: 41, github_comment_id: 1 },
    suppression: null,
    ...over,
  };
}

const sev = (band: NonNullable<Finding["severity"]>["band"], score: number): NonNullable<Finding["severity"]> => ({ band, score, inputs, weights, explanation: "", notes: [] });
const proof = (status: NonNullable<Finding["proof"]>["status"]): NonNullable<Finding["proof"]> => ({ status, runner: "docker", isolation: "isolated", baseline_mode: "compared" });

/** Newest first: F1 … F7. */
export const FINDINGS: Finding[] = [
  finding({ id: DEMO_IDS.proven_finding_id, review_id: REVIEW_A, fingerprint: FP1, created_at: "2026-09-19T14:03:06Z", status: "published", blocking: true, severity: sev("critical", 0.81), proof: proof("proven") }),
  finding({ id: DEMO_IDS.disproven_finding_id, review_id: REVIEW_A, fingerprint: FP2, created_at: "2026-09-19T14:03:05Z", status: "disproven", severity: sev("info", 0.21), proof: proof("disproven") }),
  finding({ id: DEMO_IDS.inconclusive_finding_id, review_id: REVIEW_A, fingerprint: FP3, created_at: "2026-09-19T14:03:04Z", status: "published", severity: sev("high", 0.6), proof: proof("inconclusive") }),
  finding({ id: "f4000000-0000-4000-8000-000000000004", review_id: REVIEW_B, fingerprint: FP1, created_at: "2026-09-18T10:00:00Z", status: "published", severity: sev("medium", 0.4), proof: null }),
  finding({
    id: "f5000000-0000-4000-8000-000000000005",
    review_id: REVIEW_B,
    fingerprint: FP4,
    created_at: "2026-09-18T09:59:00Z",
    status: "suppressed",
    severity: sev("low", 0.2),
    proof: proof("proven"),
    suppression: { suppression_id: "s1000000-0000-4000-8000-000000000001", scope: "pattern", reason: "vendored SDK", created_by: "vansh.m", expires_at: null },
  }),
  finding({ id: "f6000000-0000-4000-8000-000000000006", review_id: REVIEW_C, fingerprint: FP5, created_at: "2026-09-17T12:00:00Z", status: "proposed", severity: null, proof: null }),
  finding({ id: "f7000000-0000-4000-8000-000000000007", review_id: REVIEW_C, fingerprint: null, created_at: "2026-09-17T11:00:00Z", status: "published", severity: sev("high", 0.57), proof: proof("skipped_no_env") }),
];

export const [F1, F2, F3, F4, F5, F6, F7] = FINDINGS as [Finding, Finding, Finding, Finding, Finding, Finding, Finding];

const counts = { proposed: 3, published: 2, suppressed: 0, dropped: 0, disproven: 1, blocking: 1 };

export const REVIEWS: ReviewListItem[] = [
  {
    review_id: REVIEW_A,
    status: "succeeded",
    trigger: "webhook",
    repository: DEMO_IDS.repository,
    pull_request: { number: DEMO_IDS.pr_number, title: "Charge in the account currency", author: "octo" },
    risk_tier: "full",
    gate_conclusion: "failure",
    counts,
    cost_usd_estimate: 0.0412,
    duration_seconds: 191,
    created_at: "2026-09-19T14:00:00Z",
    finished_at: "2026-09-19T14:03:11Z",
  },
  {
    review_id: REVIEW_B,
    status: "succeeded",
    trigger: "api",
    repository: { owner: "acme", name: "api-gateway" },
    pull_request: { number: 77, title: "Rate-limit tokens", author: "dev" },
    risk_tier: "standard",
    gate_conclusion: "success",
    counts,
    cost_usd_estimate: 0.021,
    duration_seconds: 120,
    created_at: "2026-09-18T09:55:00Z",
    finished_at: "2026-09-18T09:57:00Z",
  },
  {
    review_id: REVIEW_C,
    status: "failed",
    trigger: "api",
    repository: { owner: "other", name: "tool" },
    pull_request: { number: 3, title: "Bump deps", author: "bot" },
    risk_tier: "trivial",
    gate_conclusion: null,
    counts,
    cost_usd_estimate: null,
    duration_seconds: null,
    created_at: "2026-09-17T11:59:00Z",
    finished_at: "2026-09-17T12:01:00Z",
  },
];

export function finalStatus(reviewId: string, over: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    review_id: reviewId,
    status: "succeeded",
    stage: "finalise",
    stage_index: 9,
    stage_total: 9,
    stage_label: "Finalising",
    seconds_since_heartbeat: 3,
    risk_tier: "full",
    head_sha: DEMO_IDS.head_sha,
    degradations: [],
    counts: { proposed: 3, published: 2, suppressed: 1, blocking: 1 },
    started_at: "2026-09-19T14:00:01Z",
    finished_at: "2026-09-19T14:03:11Z",
    error: null,
    ...over,
  };
}

export function result(reviewId: string, findings: Finding[]): ReviewResult {
  return {
    review_id: reviewId,
    status: "succeeded",
    repository: { ...DEMO_IDS.repository, default_branch: "main" },
    pull_request: { number: DEMO_IDS.pr_number, title: "Charge in the account currency", author: "octo", head_sha: DEMO_IDS.head_sha, base_sha: DEMO_IDS.base_sha, url: null },
    risk_tier: "full",
    context: { files_changed: 7, files_reviewed: 5, files_excluded: 2, excluded_reasons: {}, truncated: false },
    gate: { conclusion: "failure", reason: "1 blocking finding", delivery: "commit_status", context_name: "prguard/merge-gate", blocking_finding_ids: [DEMO_IDS.proven_finding_id] },
    delivery: { status: "posted", github_review_id: 1, event: "COMMENT", comments_posted: 2, ladder_breakdown: { inline_exact: 1, inline_nearest: 1, file_level: 0, summary_only: 0 } },
    counts,
    cost: { usd_estimate: 0.0412, input_tokens: 41022, output_tokens: 3881, cache_read_tokens: 28440 },
    timing: { queued_at: "2026-09-19T14:00:00Z", started_at: "2026-09-19T14:00:01Z", finished_at: "2026-09-19T14:03:11Z", duration_seconds: 190 },
    degradations: [],
    findings,
    review_payload: { event: "COMMENT", body: "…" },
    audit_url: `/v1/audit?review_id=${reviewId}`,
  };
}

export const SUPPRESSIONS: SuppressionItem[] = [
  { suppression_id: "s1000000-0000-4000-8000-000000000001", scope: "pattern", match_path: "vendor/**", rule_key: "unguarded_none_attribute", category: "correctness", reason: "vendored SDK", created_by: "vansh.m", source: "human_api", active: true, expires_at: null, revoked_at: null, suppressed_count: 1, last_matched_at: "2026-09-18T09:59:00Z", created_at: "2026-09-16T08:00:00Z" },
  { suppression_id: "s2000000-0000-4000-8000-000000000002", scope: "repo", match_path: null, rule_key: "bare_except", category: "maintainability", reason: "CLI entrypoint", created_by: "vansh.m", source: "human_api", active: false, expires_at: "2026-09-12T00:00:00Z", revoked_at: null, suppressed_count: 4, last_matched_at: null, created_at: "2026-09-10T08:00:00Z" },
  { suppression_id: "s3000000-0000-4000-8000-000000000003", scope: "line", match_path: null, rule_key: "magic_number", category: "maintainability", reason: "duplicate of s1", created_by: "agent", source: "auto_convention", active: false, expires_at: null, revoked_at: "2026-09-06T08:00:00Z", suppressed_count: 0, last_matched_at: null, created_at: "2026-09-05T08:00:00Z" },
  { suppression_id: "s4000000-0000-4000-8000-000000000004", scope: "tenant", match_path: null, rule_key: "todo_comment", category: "maintainability", reason: "tracked in the issue tracker", created_by: "vansh.m", source: "human_api", active: true, expires_at: null, revoked_at: null, suppressed_count: 9, last_matched_at: null, created_at: "2026-09-01T08:00:00Z" },
];

export const HASH = (n: number) => n.toString(16).padStart(64, "0");

/**
 * audit/events.json as TEXT, with Python's float lexemes (1.0, 1e-05) that
 * JSON.parse would destroy. Contiguous seq 1..4.
 */
export const AUDIT_TEXT = `{"items":[
{"seq":1,"event_type":"review.requested","actor_type":"system","actor_id":"api","review_id":"${REVIEW_A}","finding_id":null,"payload":{"trigger":"webhook"},"event_hash":"${HASH(1)}","prev_hash":null,"created_at":"2026-09-19T14:00:00Z","tenant_id":"${DEMO_IDS.tenant_id}"},
{"seq":2,"event_type":"finding.proposed","actor_type":"ai","actor_id":"specialist:bugs","review_id":"${REVIEW_A}","finding_id":"${DEMO_IDS.proven_finding_id}","payload":{"proof_confidence":1.0,"tiny":1e-05,"big":1e16},"event_hash":"${HASH(2)}","prev_hash":"${HASH(1)}","created_at":"2026-09-19T14:02:40Z","tenant_id":"${DEMO_IDS.tenant_id}"},
{"seq":3,"event_type":"proof.executed","actor_type":"system","actor_id":"proof-runner:docker","review_id":"${REVIEW_A}","finding_id":"${DEMO_IDS.proven_finding_id}","payload":{"base_exit_code":0,"head_exit_code":1,"score":0.81},"event_hash":"${HASH(3)}","prev_hash":"${HASH(2)}","created_at":"2026-09-19T14:03:01Z","tenant_id":"${DEMO_IDS.tenant_id}"},
{"seq":4,"event_type":"gate.evaluated","actor_type":"system","actor_id":"gate","review_id":"${REVIEW_B}","finding_id":null,"payload":{"conclusion":"success"},"event_hash":"${HASH(4)}","prev_hash":"${HASH(3)}","created_at":"2026-09-19T14:03:05Z","tenant_id":"${DEMO_IDS.tenant_id}"}
],"chain":{"verified":true,"checked":4,"first_seq":1,"last_seq":4,"broken_at_seq":null}}`;

/** Stage durations × 0.5: 500 1000 1500 500 500 500 2000 1000 500 → 8000 ms. */
export const DEMO_RUN: DemoRun = {
  review_id: REVIEW_A,
  time_scale: 0.5,
  stages: [
    { key: "ingest", duration_ms: 1000, label: "Fetching the diff" },
    { key: "context", duration_ms: 2000, label: "Building context" },
    { key: "specialists", duration_ms: 3000, label: "Running 4 specialist passes" },
    { key: "coordinator", duration_ms: 1000, label: "Merging findings" },
    { key: "severity", duration_ms: 1000, label: "Scoring severity" },
    { key: "identity", duration_ms: 1000, label: "Fingerprinting" },
    { key: "proof", duration_ms: 4000, label: "Running repro tests" },
    { key: "delivery", duration_ms: 2000, label: "Posting the review" },
    { key: "finalise", duration_ms: 1000, label: "Finalising" },
  ],
  heartbeat_interval_ms: 1200,
  final_status_file: FIXTURE_FILES.reviewStatus(REVIEW_A),
  final_result_file: FIXTURE_FILES.reviewResult(REVIEW_A),
};
export const DEMO_TOTAL_MS = 8000;
/** Cumulative stage starts (ms) for DEMO_RUN. */
export const DEMO_STARTS = [0, 500, 1500, 3000, 3500, 4000, 4500, 6500, 7500];

export const ACCURACY: AccuracyReport = {
  window: { since: "2026-08-15T00:00:00Z", until: "2026-09-14T23:59:59Z", repository: null },
  runs: { total: 38, succeeded: 36, failed: 1, cancelled: 1, median_duration_seconds: 191 },
  findings: { proposed: 214, published: 91, suppressed: 96, dropped_by_coordinator: 27, per_review_published_mean: 2.4 },
  proof: { attempted: 54, proven: 31, disproven: 9, inconclusive: 11, skipped_no_env: 3, proven_rate: 0.574, disproven_rate: 0.167 },
  precision_proxies: {
    execution_verified_precision: { value: 0.775, n: 40, definition: "proven / (proven + disproven)" },
    self_caught_false_positive_rate: { value: 0.167, n: 54, definition: "disproven / attempted" },
    human_dismissal_rate: { value: 0.209, n: 91, definition: "dismissed / published" },
    addressed_rate: { value: 0.451, n: 91, definition: "addressed / published" },
  },
  gate: { runs_red: 9, runs_green: 24, runs_neutral: 3, break_glass_overrides: 0 },
  caveats: ["Not an external benchmark."],
};

export type CorpusFiles = Record<string, string | object>;

export function sampleFiles(): CorpusFiles {
  return {
    [FIXTURE_FILES.manifest]: { generator: { script: "x", backend_commit: "eeb1be8", version: 1 }, ids: DEMO_IDS, counts: {} },
    [FIXTURE_FILES.reviewsIndex]: { items: REVIEWS },
    [FIXTURE_FILES.findingsIndex]: { items: FINDINGS },
    [FIXTURE_FILES.suppressionsIndex]: { items: SUPPRESSIONS, totals: { active: 2, expired: 1, revoked: 1 } },
    [FIXTURE_FILES.auditEvents]: AUDIT_TEXT,
    [FIXTURE_FILES.accuracyReport]: ACCURACY,
    [FIXTURE_FILES.demoRun]: DEMO_RUN,
    [FIXTURE_FILES.reviewStatus(REVIEW_A)]: finalStatus(REVIEW_A),
    [FIXTURE_FILES.reviewResult(REVIEW_A)]: result(REVIEW_A, [F1, F2, F3]),
    [FIXTURE_FILES.reviewStatus(REVIEW_B)]: finalStatus(REVIEW_B),
    [FIXTURE_FILES.reviewResult(REVIEW_B)]: result(REVIEW_B, [F4, F5]),
    [FIXTURE_FILES.reviewStatus(REVIEW_C)]: finalStatus(REVIEW_C, { status: "failed", stage: "specialists", stage_index: 3, error: { code: "LLM_UNAVAILABLE", message: "all specialists failed" } }),
    [FIXTURE_FILES.reviewResult(REVIEW_C)]: result(REVIEW_C, [F6, F7]),
  };
}

/** Every file a stub, the way the corpus looks before t2b's generator runs. */
export function stubFiles(): CorpusFiles {
  const stub = { _stub: true };
  return {
    [FIXTURE_FILES.manifest]: { _stub: true, generator: { script: "x", backend_commit: "eeb1be8", version: 0 }, ids: DEMO_IDS, counts: {} },
    [FIXTURE_FILES.reviewsIndex]: { _stub: true, items: [] },
    [FIXTURE_FILES.findingsIndex]: { _stub: true, items: [] },
    [FIXTURE_FILES.suppressionsIndex]: { _stub: true, items: [] },
    [FIXTURE_FILES.auditEvents]: '{"_stub": true, "items": []}',
    [FIXTURE_FILES.accuracyReport]: stub,
    [FIXTURE_FILES.demoRun]: stub,
    [FIXTURE_FILES.reviewStatus(REVIEW_A)]: stub,
    [FIXTURE_FILES.reviewResult(REVIEW_A)]: stub,
  };
}

export function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

export interface TestResolverOptions extends Omit<FixtureResolverOptions, "load"> {
  files?: CorpusFiles;
  search?: string;
}

/** A resolver over the sample corpus: no latency, memory storage, a settable page URL. */
export function testResolver(options: TestResolverOptions = {}) {
  const files = options.files ?? sampleFiles();
  const loads: string[] = [];
  const page = { search: options.search ?? "" };
  const resolver = createFixtureResolver({
    latency: 0,
    storage: memoryStorage(),
    hasher: null,
    ...options,
    pageParams: options.pageParams ?? (() => new URLSearchParams(page.search)),
    load: async (path) => {
      loads.push(path);
      if (!(path in files)) throw new FixtureMissingError(path);
      return files[path]!;
    },
  });
  return { resolver, loads, page, files };
}

/** fetch a route through a resolver: `call(r, "GET", "/v1/findings?limit=2")`. */
export async function call(
  resolver: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  // Tests read arbitrary paths off the body; the resolver's shapes are asserted, not assumed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res = await resolver(new Request(`${API}${path}`, init));
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

export function queryWrapper(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
  // TanStack re-renders a hook only for the result properties read during
  // render. renderHook tests read them afterwards, in assertions, so opt out of
  // tracking here — otherwise result.current can be a stale render.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, notifyOnChangeProps: "all" } });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { queryClient, Wrapper };
}
