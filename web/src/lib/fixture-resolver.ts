// OWNER: t2a (wave 1).
//
// The fixture resolver: a fetch-compatible function that answers every route in
// src/api/routes.ts (the 14 OpenAPI paths and the plan-A11 run list) from the
// JSON corpus in web/public/fixtures, so the whole app demos with the backend
// off (plan T2, NEXT_PUBLIC_FIXTURES, default on). The generated client sends
// through it via src/api/transport.ts.
//
// - Files are fetched at runtime from /fixtures/*.json and cached in memory;
//   none is bundled. audit/events.json is parsed losslessly (src/api/lossless.ts)
//   and every response is written with lossless stringify, so Python's float
//   lexemes (`1.0`, `1e-05`) reach the browser's hash verifier intact (plan A8).
// - Writes land in an in-memory overlay for the page's lifetime: a suppression
//   adds its ledger row, flips the finding through the same reducer the
//   optimistic path uses, and appends a hash-chained `suppression.created` audit
//   event; a revoke sets revoked_at (never deletes) and appends
//   `suppression.revoked`. A reload restores the pristine corpus.
// - The audit hash is the backend's (plan A8) and needs the canonical-JSON
//   serialiser t6 writes in wave 2. Until setAuditHasher() registers it, appended
//   events carry the correct prev_hash and event_hash "pending", and the chain
//   verdict does not count them as checked. Registering later re-chains them.
// - Errors use the §6.0 envelope and registry codes. Unknown paths are 404
//   NOT_FOUND; a known path under the wrong method is 405 METHOD_NOT_ALLOWED
//   (the two are Starlette's own defaults, not registry codes).
// - Latency is deterministic per path, 40–160 ms, so loading states are real.
//
// Page-URL flags (read from the page, not the API request):
//   ?latency=0      no delay (tests)          ?latency=<ms>  a fixed delay
//   ?replay=1       replay the demo run live from stage 1 (once per page load;
//                   a reload mid-run continues it)
//   ?stall=1        the heartbeat stops when the run reaches S3 SPECIALISTS, so
//                   the >20s stale state can be seen; ?stall_stage=<n> picks n
// POST /v1/reviews and POST /v1/reviews/{id}/rerun also start a simulated run.
// Start times live in sessionStorage, so a reload continues a run in progress.
import { API_BASE } from "@/lib/env";
import type {
  AuditChain,
  AuditItemWithTenant,
  DemoIds,
  DemoRun,
  Finding,
  ReviewAccepted,
  ReviewListItem,
  ReviewResult,
  ReviewStatus,
  SuppressionCreated,
  SuppressionItem,
} from "@/lib/api-types";
import { encodeCursor, keysetPage } from "@/api/cursor";
import { isAbortError } from "@/api/errors";
import { parseLosslessJson, stringifyLosslessJson } from "@/api/lossless";
import { matchRoute, stripBasePath, type ApiOperation } from "@/api/routes";
import {
  ACTOR_TYPES,
  API_ERROR_CODES,
  AUDIT_LIMIT_DEFAULT,
  AUDIT_LIMIT_MAX,
  FINDING_STATUSES,
  GATE_CONCLUSIONS,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  PROOF_STATUSES,
  REVIEW_RUN_STATUSES,
  SEVERITY_BANDS,
  SUPPRESSION_SCOPES,
  type ActorType,
  type ApiErrorCode,
} from "./contracts";
import { DEMO_IDS } from "./demo-ids";
import {
  QueryError,
  byCreatedDesc,
  isActiveSuppression,
  matchesAudit,
  matchesFinding,
  matchesSuppression,
  parseBool,
  parseCursor,
  parseDateTime,
  parseEnum,
  parseEnumList,
  parseInteger,
  parseLimit,
  parseString,
  runRefs,
  type SuppressionRef,
} from "./fixture-query";
import { simFrame, simPartialResult, simStatus, simTiming, toIsoSeconds, type SimFrame } from "./fixture-sim";
import { FIXTURE_FILES, isFixtureStub } from "./fixture-types";
import { patchFromCreated, suppressFindingReducer } from "./hooks/suppress-reducer";

// ---------------------------------------------------------------------------
// The audit hasher hook (plan A8). t6 registers the canonical serialiser.
// ---------------------------------------------------------------------------

/** Exactly the document the backend hashes (plan A8), in API form: created_at
 *  carries `Z` — converting it to `+00:00` is the canonicaliser's job. */
export interface AuditHashDocument {
  tenant_id: string;
  seq: number;
  event_type: string;
  actor_type: ActorType;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/** sha256(prev_hash ‖ canonical_json(document)) as lowercase hex. `prevHash` is
 *  null for the first event (the backend hashes `prev_hash or ""`). */
export type AuditHasher = (document: AuditHashDocument, prevHash: string | null) => string | Promise<string>;

/** event_hash of an event appended before any hasher was registered. */
export const PENDING_EVENT_HASH = "pending";

let registeredHasher: AuditHasher | null = null;

/** Register (or clear) the audit hasher for every resolver. Pending events are re-chained on the next audit access. */
export function setAuditHasher(hasher: AuditHasher | null): void {
  registeredHasher = hasher;
}

export function getAuditHasher(): AuditHasher | null {
  return registeredHasher;
}

// ---------------------------------------------------------------------------
// Options and public surface
// ---------------------------------------------------------------------------

/** Thrown by a loader when a fixture file does not exist. */
export class FixtureMissingError extends Error {
  constructor(readonly path: string) {
    super(`fixture ${path} does not exist`);
    this.name = "FixtureMissingError";
  }
}

/** Returns the file's JSON text, or an already-parsed value (tests). */
export type FixtureLoader = (path: string) => Promise<string | object>;

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface FixtureResolverOptions {
  /** Default: fetch("/fixtures/<path>") from the page's origin. */
  load?: FixtureLoader;
  /** Default: Date.now. */
  now?: () => number;
  /** The page's URL flags. Default: location.search. */
  pageParams?: () => URLSearchParams;
  /** Where simulated-run start times live. Default: sessionStorage (memory when unavailable). */
  storage?: KeyValueStore | null;
  /** "page": ?latency= or the deterministic jitter (default). A number: fixed delay in ms. */
  latency?: "page" | number;
  /** Default: DEMO_IDS (manifest.json). */
  ids?: DemoIds;
  /** Default: the one registered with setAuditHasher(). */
  hasher?: AuditHasher | null;
  /** The API base whose path prefix is stripped. Default: API_BASE. */
  apiBase?: string;
}

export interface FixtureResolver {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** Start (or restart) the simulated run of a review. */
  startSimulation(reviewId: string, trigger?: SimTrigger): void;
  /** Forget a simulated run; its stored status is served again. */
  stopSimulation(reviewId: string): void;
  /** Drop the overlay, the file cache and every simulated run. */
  reset(): void;
}

type SimTrigger = "api" | "rerun" | "replay";

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

class HttpFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpFailure";
  }
}

function fail(code: ApiErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new HttpFailure(API_ERROR_CODES[code], code, message, details);
}

const MISSING: unique symbol = Symbol("missing");
const STUB: unique symbol = Symbol("stub");
type Loaded<T> = T | typeof MISSING | typeof STUB;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TRUTHY_FLAG = /^(1|true|yes|on)$/i;
/** ?stall=1 freezes the run here: S3 SPECIALISTS, the stage the dashboard's stalled-run copy names. */
const STALL_DEFAULT_STAGE = 3;
const SIM_STORAGE_KEY = "prguard:fixture-sim:v1";
const PR_URL = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)\/pull\/([1-9]\d*)(?:[/?#].*)?$/;
const PR_SHORTHAND = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)#([1-9]\d*)$/;

interface PageFlags {
  replay: boolean;
  stallAtStage: number | null;
  /** null = deterministic jitter. */
  latencyMs: number | null;
}

function readFlags(params: URLSearchParams): PageFlags {
  const stall = params.get("stall");
  const stallStage = Number(params.get("stall_stage"));
  const latency = params.get("latency");
  const latencyMs = latency === null || latency === "" || !Number.isFinite(Number(latency)) ? null : Math.min(Math.max(Math.round(Number(latency)), 0), 10_000);
  return {
    replay: TRUTHY_FLAG.test(params.get("replay") ?? ""),
    stallAtStage:
      Number.isInteger(stallStage) && stallStage >= 1 && stallStage <= 9 ? stallStage : stall !== null && TRUTHY_FLAG.test(stall) ? STALL_DEFAULT_STAGE : null,
    latencyMs,
  };
}

/** FNV-1a → 40..160 ms, stable for a method + path. */
export function jitterMs(method: string, path: string): number {
  let h = 0x811c9dc5;
  const s = `${method.toUpperCase()} ${path}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 40 + (h % 121);
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function sleep(ms: number, signal: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const defaultLoad: FixtureLoader = async (path) => {
  const response = await globalThis.fetch(`/fixtures/${path}`, { headers: { accept: "application/json" } });
  if (response.status === 404) throw new FixtureMissingError(path);
  if (!response.ok) throw new Error(`fixture ${path}: HTTP ${response.status}`);
  return response.text();
};

function defaultPageParams(): URLSearchParams {
  return new URLSearchParams(typeof location === "undefined" ? "" : location.search);
}

function defaultStorage(): KeyValueStore | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function newId(): string {
  // crypto.randomUUID needs a secure context; a LAN-IP demo has none.
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  const hex = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16)
        .toString(16)
        .toLowerCase(),
    ).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repoString(ref: { owner: string; name: string }): string {
  return `${ref.owner}/${ref.name}`;
}

interface SimRecord {
  startedAt: number;
  trigger: SimTrigger;
}

interface Overlay {
  /** finding id → the finding after the reducer ran. */
  findings: Map<string, Finding>;
  /** Ledger rows created in this page. */
  suppressions: SuppressionItem[];
  /** What the new rows touch (the row shape cannot say). */
  suppressionRefs: Map<string, { fingerprint: string | null; repository: string | null }>;
  /** suppression id → revoked_at, for rows from the corpus. */
  revocations: Map<string, string>;
  /** Audit events appended in this page. */
  audit: AuditItemWithTenant[];
}

function emptyOverlay(): Overlay {
  return { findings: new Map(), suppressions: [], suppressionRefs: new Map(), revocations: new Map(), audit: [] };
}

interface Ctx {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  flags: PageFlags;
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

export function createFixtureResolver(options: FixtureResolverOptions = {}): FixtureResolver {
  const load = options.load ?? defaultLoad;
  const now = options.now ?? (() => Date.now());
  const pageParams = options.pageParams ?? defaultPageParams;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const ids = options.ids ?? DEMO_IDS;
  const basePath = (() => {
    try {
      return new URL(options.apiBase ?? API_BASE).pathname;
    } catch {
      return "";
    }
  })();
  const hasher = (): AuditHasher | null => (options.hasher === undefined ? registeredHasher : options.hasher);

  let cache = new Map<string, Promise<unknown>>();
  let overlay = emptyOverlay();
  let memorySims: Record<string, SimRecord> = {};
  let replayClaimed = false;
  let requestCount = 0;
  let auditLock: Promise<unknown> = Promise.resolve();

  // --- files ---------------------------------------------------------------

  function file<T>(path: string, lossless = false): Promise<Loaded<T>> {
    let entry = cache.get(path);
    if (!entry) {
      entry = (async () => {
        try {
          const raw = await load(path);
          const value: unknown = typeof raw === "string" ? (lossless ? parseLosslessJson(raw) : JSON.parse(raw)) : JSON.parse(JSON.stringify(raw));
          return isFixtureStub(value) ? STUB : value;
        } catch (error) {
          if (error instanceof FixtureMissingError) return MISSING;
          throw error;
        }
      })();
      cache.set(path, entry);
      const settled = entry;
      settled.catch(() => {
        if (cache.get(path) === settled) cache.delete(path);
      });
    }
    return entry as Promise<Loaded<T>>;
  }

  async function items<T>(path: string, lossless = false): Promise<T[]> {
    const data = await file<{ items?: T[] }>(path, lossless);
    return data === MISSING || data === STUB || !Array.isArray(data.items) ? [] : data.items;
  }

  const reviewsIndex = () => items<ReviewListItem>(FIXTURE_FILES.reviewsIndex);

  async function findings(): Promise<Finding[]> {
    const base = await items<Finding>(FIXTURE_FILES.findingsIndex);
    return base.map((f) => overlay.findings.get(f.id) ?? f).sort(byCreatedDesc((f) => f.id));
  }

  async function demoRun(): Promise<DemoRun | null> {
    const run = await file<DemoRun>(FIXTURE_FILES.demoRun);
    return run === MISSING || run === STUB ? null : run;
  }

  function checkId(id: string, code: "REVIEW_NOT_FOUND" | "FINDING_NOT_FOUND" | "SUPPRESSION_NOT_FOUND", field: string): void {
    if (!SAFE_ID.test(id)) fail(code, `No ${field.replace(/_id$/, "")} with ${field} ${id}.`, { [field]: id });
  }

  const storedStatus = (id: string) => file<ReviewStatus>(FIXTURE_FILES.reviewStatus(id));
  const storedResult = (id: string) => file<ReviewResult>(FIXTURE_FILES.reviewResult(id));

  function notFoundRun(id: string, loaded: typeof MISSING | typeof STUB): never {
    fail("REVIEW_NOT_FOUND", `No review with review_id ${id}.`, loaded === STUB ? { review_id: id, stub: true } : { review_id: id });
  }

  // --- simulated runs ------------------------------------------------------

  function readSims(): Record<string, SimRecord> {
    if (!storage) return memorySims;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(SIM_STORAGE_KEY) ?? "{}");
      return isRecord(parsed) ? (parsed as Record<string, SimRecord>) : {};
    } catch {
      return memorySims;
    }
  }

  function writeSims(sims: Record<string, SimRecord>): void {
    memorySims = sims;
    if (!storage) return;
    try {
      storage.setItem(SIM_STORAGE_KEY, JSON.stringify(sims));
    } catch {
      // storage blocked: the in-memory copy still drives this page
    }
  }

  function startSimulation(reviewId: string, trigger: SimTrigger = "api"): void {
    writeSims({ ...readSims(), [reviewId]: { startedAt: now(), trigger } });
  }

  function stopSimulation(reviewId: string): void {
    const sims = { ...readSims() };
    delete sims[reviewId];
    writeSims(sims);
  }

  interface Live {
    frame: SimFrame;
    startedAt: number;
    trigger: SimTrigger;
    final: ReviewStatus | null;
  }

  /** A run that failed or was cancelled stops at its recorded stage. */
  function lastStageOf(final: ReviewStatus | null): number {
    return final && final.status !== "succeeded" && final.stage_index ? final.stage_index : 9;
  }

  async function frameFor(reviewId: string, record: SimRecord, flags: PageFlags): Promise<Live> {
    const timing = simTiming(await demoRun());
    const loaded = await storedStatus(reviewId);
    const final = loaded === MISSING || loaded === STUB ? null : loaded;
    const frame = simFrame(timing, now() - record.startedAt, { lastStage: lastStageOf(final), stallAtStage: flags.stallAtStage });
    return { frame, startedAt: record.startedAt, trigger: record.trigger, final };
  }

  /** The simulated state of a run, or null when it is not being simulated. */
  async function live(reviewId: string, flags: PageFlags): Promise<Live | null> {
    if (flags.replay && reviewId === ids.demo_review_id && !replayClaimed) {
      replayClaimed = true;
      const existing = readSims()[reviewId];
      // A reload mid-run continues it; a finished (or absent) run starts again.
      const running = existing ? (await frameFor(reviewId, existing, flags)).frame.phase === "running" : false;
      if (!running) startSimulation(reviewId, "replay");
    }
    const record = readSims()[reviewId];
    return record ? frameFor(reviewId, record, flags) : null;
  }

  async function liveRuns(flags: PageFlags): Promise<Map<string, Live>> {
    // /overview?replay=1 replays the demo run even before anything polls it.
    if (flags.replay) await live(ids.demo_review_id, flags);
    const out = new Map<string, Live>();
    for (const [id, record] of Object.entries(readSims())) {
      const l = await frameFor(id, record, flags);
      if (l.frame.phase === "running") out.set(id, l);
    }
    return out;
  }

  // --- suppressions and audit ---------------------------------------------

  async function ledger(): Promise<SuppressionItem[]> {
    const base = (await items<SuppressionItem>(FIXTURE_FILES.suppressionsIndex)).map((row) => {
      const revokedAt = overlay.revocations.get(row.suppression_id);
      return revokedAt ? { ...row, active: false, revoked_at: revokedAt } : row;
    });
    return [...overlay.suppressions, ...base].sort(byCreatedDesc((r) => r.suppression_id));
  }

  async function ledgerRefs(rows: SuppressionItem[]): Promise<Map<string, SuppressionRef>> {
    const refs = new Map<string, SuppressionRef>();
    const add = (id: string, fingerprint: string | null | undefined, repository: string | null | undefined) => {
      let ref = refs.get(id);
      if (!ref) refs.set(id, (ref = { fingerprints: new Set(), repositories: new Set() }));
      if (fingerprint) ref.fingerprints.add(fingerprint);
      if (repository) ref.repositories.add(repository);
    };
    const runs = runRefs(await reviewsIndex());
    for (const f of await findings()) {
      if (f.suppression) add(f.suppression.suppression_id, f.fingerprint, runs.get(f.review_id)?.repository);
    }
    for (const [id, ref] of overlay.suppressionRefs) add(id, ref.fingerprint, ref.repository);
    // A generator may put fingerprint / repository on the row itself.
    for (const row of rows as (SuppressionItem & { fingerprint?: unknown; repository?: unknown })[]) {
      const repo = typeof row.repository === "string" ? row.repository : isRecord(row.repository) ? repoString(row.repository as { owner: string; name: string }) : null;
      add(row.suppression_id, typeof row.fingerprint === "string" ? row.fingerprint : null, repo);
    }
    return refs;
  }

  async function auditBase(): Promise<{ items: AuditItemWithTenant[]; chain: AuditChain | null }> {
    const data = await file<{ items?: AuditItemWithTenant[]; chain?: AuditChain }>(FIXTURE_FILES.auditEvents, true);
    if (data === MISSING || data === STUB) return { items: [], chain: null };
    return { items: Array.isArray(data.items) ? data.items : [], chain: data.chain ?? null };
  }

  function hashDocument(e: AuditItemWithTenant): AuditHashDocument {
    return {
      tenant_id: e.tenant_id ?? ids.tenant_id,
      seq: e.seq,
      event_type: e.event_type,
      actor_type: e.actor_type,
      actor_id: e.actor_id ?? null,
      payload: e.payload ?? {},
      created_at: e.created_at,
    };
  }

  function withAuditLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = auditLock.then(fn, fn);
    auditLock = run.catch(() => undefined);
    return run;
  }

  /** Re-chain appended events once a hasher exists (or after one changed). */
  async function rehashAppended(): Promise<void> {
    const h = hasher();
    if (!h || !overlay.audit.some((e) => e.event_hash === PENDING_EVENT_HASH)) return;
    const base = await auditBase();
    let prev = base.items.length ? base.items[base.items.length - 1]!.event_hash : null;
    for (const e of overlay.audit) {
      if (e.event_hash === PENDING_EVENT_HASH || e.prev_hash !== prev) {
        e.prev_hash = prev;
        e.event_hash = await h(hashDocument(e), prev);
      }
      prev = e.event_hash;
    }
  }

  async function allAudit(): Promise<{ items: AuditItemWithTenant[]; chain: AuditChain | null }> {
    await withAuditLock(rehashAppended);
    const base = await auditBase();
    return { items: [...base.items, ...overlay.audit], chain: base.chain };
  }

  function appendAudit(event: Omit<AuditItemWithTenant, "seq" | "prev_hash" | "event_hash" | "tenant_id">): Promise<AuditItemWithTenant> {
    return withAuditLock(async () => {
      await rehashAppended();
      const base = await auditBase();
      const last = overlay.audit[overlay.audit.length - 1] ?? base.items[base.items.length - 1];
      const appended: AuditItemWithTenant = {
        seq: (last?.seq ?? 0) + 1,
        event_type: event.event_type,
        actor_type: event.actor_type,
        actor_id: event.actor_id ?? null,
        review_id: event.review_id ?? null,
        finding_id: event.finding_id ?? null,
        payload: event.payload ?? {},
        event_hash: PENDING_EVENT_HASH,
        prev_hash: last?.event_hash ?? null,
        created_at: event.created_at,
        tenant_id: ids.tenant_id,
      };
      const h = hasher();
      if (h) appended.event_hash = await h(hashDocument(appended), appended.prev_hash ?? null);
      overlay.audit.push(appended);
      return appended;
    });
  }

  /** The verdict for the returned window: pending events are not counted as checked. */
  function chainVerdict(page: AuditItemWithTenant[], base: AuditChain | null): AuditChain {
    const brokenAt = base && base.verified === false && base.broken_at_seq != null && page.some((e) => e.seq === base.broken_at_seq) ? base.broken_at_seq : null;
    return {
      verified: brokenAt === null,
      checked: page.filter((e) => e.event_hash !== PENDING_EVENT_HASH).length,
      first_seq: page.length ? page[0]!.seq : null,
      last_seq: page.length ? page[page.length - 1]!.seq : null,
      broken_at_seq: brokenAt,
    };
  }

  // --- responses -----------------------------------------------------------

  function requestId(): string {
    requestCount += 1;
    return `fx_${requestCount.toString(36).padStart(6, "0")}`;
  }

  function json(status: number, body: unknown, rid: string): Response {
    return new Response(stringifyLosslessJson(body), {
      status,
      headers: { "content-type": "application/json", "x-request-id": rid, "x-prguard-source": "fixture" },
    });
  }

  function envelope(status: number, code: string, message: string, details: Record<string, unknown>, rid: string): Response {
    return json(status, { error: { code, message, details, request_id: rid } }, rid);
  }

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      fail("VALIDATION_ERROR", "The request body is not valid JSON.", { field: "body" });
    }
    if (!isRecord(body)) fail("VALIDATION_ERROR", "The request body must be a JSON object.", { field: "body" });
    return body;
  }

  function accepted(reviewId: string, init: Partial<ReviewAccepted> & Pick<ReviewAccepted, "repository" | "pull_request" | "trigger">): ReviewAccepted {
    return {
      review_id: reviewId,
      status: "queued",
      poll_url: `/v1/reviews/${reviewId}`,
      result_url: `/v1/reviews/${reviewId}/result`,
      created_at: toIsoSeconds(now()),
      deduplicated: false,
      ...init,
    };
  }

  // --- handlers ------------------------------------------------------------

  type Handler = (ctx: Ctx) => Promise<[status: number, body: unknown]>;

  const handlers: Record<ApiOperation, Handler> = {
    async healthz() {
      const manifest = await file<{ generator?: { backend_commit?: string } }>(FIXTURE_FILES.manifest);
      const commit = manifest !== MISSING && manifest !== STUB ? manifest.generator?.backend_commit : undefined;
      return [200, { status: "ok", version: commit ? `fixtures@${commit}` : "fixtures" }];
    },

    async readyz({ flags }) {
      const running = (await liveRuns(flags)).size;
      return [
        200,
        { status: "ready", database: "fixture", anthropic: "fixture", github: "fixture", docker: "fixture", proof_runner: "fixture", workers: { running, queue_depth: 0 } },
      ];
    },

    async createReview({ request, flags }) {
      const body = await readBody(request);
      const prUrl = body.pr_url;
      if (typeof prUrl !== "string" || !prUrl.trim()) fail("VALIDATION_ERROR", "pr_url is required.", { field: "pr_url" });
      if (!PR_URL.test(prUrl.trim()) && !PR_SHORTHAND.test(prUrl.trim())) {
        fail("INVALID_PR_URL", "Could not parse a GitHub pull request from the supplied URL.", { pr_url: prUrl });
      }
      const force = isRecord(body.options) && body.options.force === true;
      // Plan A5: in fixture mode every submission replays the demo run.
      const id = ids.demo_review_id;
      const repository = { owner: ids.repository.owner, name: ids.repository.name };
      const current = await live(id, { ...flags, replay: false });
      if (current && current.frame.phase === "running" && !force) {
        // E21: an in-flight run for the same head is returned, not duplicated.
        return [202, accepted(id, { status: "running", trigger: current.trigger === "rerun" ? "rerun" : "api", repository, pull_request: { number: ids.pr_number, head_sha: current.final?.head_sha ?? null }, created_at: toIsoSeconds(current.startedAt), deduplicated: true })];
      }
      startSimulation(id, "api");
      return [202, accepted(id, { trigger: "api", repository, pull_request: { number: ids.pr_number, head_sha: null } })];
    },

    async rerunReview({ params }) {
      const id = params.review_id!;
      checkId(id, "REVIEW_NOT_FOUND", "review_id");
      const status = await storedStatus(id);
      const listed = (await reviewsIndex()).find((r) => r.review_id === id);
      if ((status === MISSING || status === STUB) && !listed && id !== ids.demo_review_id) notFoundRun(id, status === STUB ? STUB : MISSING);
      const result = await storedResult(id);
      const repository = listed?.repository ?? (result !== MISSING && result !== STUB ? { owner: result.repository.owner, name: result.repository.name } : ids.repository);
      const number = listed?.pull_request.number ?? (result !== MISSING && result !== STUB ? result.pull_request.number : ids.pr_number);
      startSimulation(id, "rerun");
      // Fixture simplification: the run keeps its id (the backend mints a new one).
      return [202, accepted(id, { trigger: "rerun", repository: { owner: repository.owner, name: repository.name }, pull_request: { number, head_sha: null } })];
    },

    async getReviewStatus({ params, flags }) {
      const id = params.review_id!;
      checkId(id, "REVIEW_NOT_FOUND", "review_id");
      const l = await live(id, flags);
      if (l && (l.frame.phase === "running" || !l.final)) return [200, simStatus(id, l.frame, l.startedAt, l.final)];
      const status = await storedStatus(id);
      if (status === MISSING || status === STUB) notFoundRun(id, status);
      return [200, status];
    },

    async getReviewResult({ params, query, flags }) {
      const id = params.review_id!;
      checkId(id, "REVIEW_NOT_FOUND", "review_id");
      const partial = parseBool(query, "partial") ?? false;
      const l = await live(id, flags);
      const result = await storedResult(id);
      if (l && l.frame.phase === "running") {
        if (!partial) {
          fail("RESULT_NOT_READY", "The run has not finished. Request it with partial=true for what exists so far.", {
            review_id: id,
            status: "running",
            stage_index: l.frame.stageIndex,
          });
        }
        if (result === MISSING || result === STUB) notFoundRun(id, result);
        return [200, simPartialResult(result, l.frame, l.startedAt)];
      }
      if (result === MISSING || result === STUB) notFoundRun(id, result);
      const status = await storedStatus(id);
      if (status !== MISSING && status !== STUB && (status.status === "queued" || status.status === "running") && !partial) {
        fail("RESULT_NOT_READY", "The run has not finished. Request it with partial=true for what exists so far.", { review_id: id, status: status.status });
      }
      const findingsList = result.findings?.map((f) => overlay.findings.get(f.id) ?? f);
      return [200, findingsList ? { ...result, findings: findingsList } : result];
    },

    async listFindings({ query }) {
      const filter = {
        review_id: parseString(query, "review_id"),
        repository: parseString(query, "repository"),
        pr_number: parseInteger(query, "pr_number"),
        fingerprint: parseString(query, "fingerprint"),
        status: parseEnum(query, "status", FINDING_STATUSES),
        severity_min: parseEnum(query, "severity_min", SEVERITY_BANDS),
        blocking: parseBool(query, "blocking"),
        proof_status: parseEnumList(query, "proof_status", PROOF_STATUSES),
      };
      const limit = parseLimit(query, LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
      const after = parseCursor(query, "id");
      const all = await findings();
      const runs = runRefs(await reviewsIndex());
      const matching = all.filter((f) => matchesFinding(f, filter, runs));
      const page = keysetPage(all, matching, (f) => f.id, after, limit);
      if (!page) throw new QueryError("cursor", "cursor names a finding that does not exist.", query.get("cursor"));
      return [
        200,
        {
          items: page.items,
          page: { limit, next_cursor: page.nextKey === null ? null : encodeCursor({ id: page.nextKey }), has_more: page.hasMore },
          totals: { matched: matching.length },
        },
      ];
    },

    async getFinding({ params }) {
      const id = params.finding_id!;
      checkId(id, "FINDING_NOT_FOUND", "finding_id");
      const finding = (await findings()).find((f) => f.id === id);
      if (!finding) fail("FINDING_NOT_FOUND", `No finding with finding_id ${id}.`, { finding_id: id });
      return [200, finding];
    },

    async suppressFinding({ params, request }) {
      const id = params.finding_id!;
      checkId(id, "FINDING_NOT_FOUND", "finding_id");
      const all = await findings();
      const finding = all.find((f) => f.id === id);
      if (!finding) fail("FINDING_NOT_FOUND", `No finding with finding_id ${id}.`, { finding_id: id });
      const body = await readBody(request);
      const scope = body.scope;
      if (typeof scope !== "string" || !(SUPPRESSION_SCOPES as readonly string[]).includes(scope)) {
        fail("VALIDATION_ERROR", `scope must be one of ${SUPPRESSION_SCOPES.join(", ")}.`, { field: "scope" });
      }
      const reason = body.reason;
      if (typeof reason !== "string" || !reason.trim()) fail("VALIDATION_ERROR", "reason is required and must not be empty.", { field: "reason" });
      const expiresAt = body.expires_at ?? null;
      if (expiresAt !== null && (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt)))) {
        fail("VALIDATION_ERROR", "expires_at must be an ISO 8601 date-time.", { field: "expires_at" });
      }
      const matchPath = body.match_path ?? null;
      if (scope === "pattern" && (typeof matchPath !== "string" || !matchPath.trim())) {
        fail("VALIDATION_ERROR", "match_path is required when scope is pattern.", { field: "match_path" });
      }
      const actor = request.headers.get("x-actor-id");
      const createdAt = toIsoSeconds(now());
      const sameIdentity = finding.fingerprint ? all.filter((f) => f.fingerprint === finding.fingerprint) : [finding];
      const thisRun = sameIdentity.filter((f) => f.review_id === finding.review_id).length || 1;
      const historical = sameIdentity.filter((f) => f.review_id !== finding.review_id).length;
      const created: SuppressionCreated = {
        suppression_id: newId(),
        fingerprint: finding.fingerprint ?? null,
        scope: scope as SuppressionCreated["scope"],
        match_path: scope === "pattern" ? (matchPath as string) : null,
        reason,
        created_by: actor,
        source: "human_api",
        expires_at: expiresAt as string | null,
        revoked_at: null,
        affected_findings: { this_run: thisRun, historical },
        created_at: createdAt,
      };
      const run = (await reviewsIndex()).find((r) => r.review_id === finding.review_id);
      overlay.findings.set(finding.id, suppressFindingReducer(finding, patchFromCreated(created)));
      overlay.suppressions.push({
        suppression_id: created.suppression_id,
        scope: created.scope,
        match_path: created.match_path,
        rule_key: finding.rule_key,
        category: finding.category,
        reason,
        created_by: actor,
        source: "human_api",
        active: true,
        expires_at: created.expires_at,
        revoked_at: null,
        suppressed_count: thisRun,
        last_matched_at: createdAt,
        created_at: createdAt,
      });
      overlay.suppressionRefs.set(created.suppression_id, { fingerprint: finding.fingerprint ?? null, repository: run ? repoString(run.repository) : null });
      await appendAudit({
        event_type: "suppression.created",
        actor_type: "human",
        actor_id: actor,
        review_id: finding.review_id,
        finding_id: finding.id,
        payload: {
          suppression_id: created.suppression_id,
          fingerprint: created.fingerprint,
          scope: created.scope,
          match_path: created.match_path,
          reason,
          expires_at: created.expires_at,
        },
        created_at: createdAt,
      });
      return [201, created];
    },

    async listSuppressions({ query }) {
      const filter = {
        repository: parseString(query, "repository"),
        scope: parseEnum(query, "scope", SUPPRESSION_SCOPES),
        fingerprint: parseString(query, "fingerprint"),
      };
      const active = parseBool(query, "active") ?? true;
      const limit = parseLimit(query, LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
      const after = parseCursor(query, "id");
      const rows = await ledger();
      const refs = await ledgerRefs(rows);
      const inScope = rows.filter((r) => matchesSuppression(r, filter, refs.get(r.suppression_id)));
      const matching = inScope.filter((r) => isActiveSuppression(r) === active);
      const page = keysetPage(rows, matching, (r) => r.suppression_id, after, limit);
      if (!page) throw new QueryError("cursor", "cursor names a suppression that does not exist.", query.get("cursor"));
      // Totals cover every state in scope, whatever `active` selected (spec §6.7 example).
      const totals = {
        active: inScope.filter(isActiveSuppression).length,
        expired: inScope.filter((r) => !isActiveSuppression(r) && !r.revoked_at).length,
        revoked: inScope.filter((r) => !!r.revoked_at).length,
      };
      return [
        200,
        { items: page.items, page: { limit, next_cursor: page.nextKey === null ? null : encodeCursor({ id: page.nextKey }), has_more: page.hasMore }, totals },
      ];
    },

    async revokeSuppression({ params, request }) {
      const id = params.suppression_id!;
      checkId(id, "SUPPRESSION_NOT_FOUND", "suppression_id");
      const row = (await ledger()).find((r) => r.suppression_id === id);
      if (!row) fail("SUPPRESSION_NOT_FOUND", `No suppression with suppression_id ${id}.`, { suppression_id: id });
      // Idempotent: a revoked row is returned as it is, and no second event is written.
      if (row.revoked_at) return [200, row];
      const actor = request.headers.get("x-actor-id");
      const revokedAt = toIsoSeconds(now());
      const own = overlay.suppressions.findIndex((r) => r.suppression_id === id);
      if (own >= 0) overlay.suppressions[own] = { ...overlay.suppressions[own]!, active: false, revoked_at: revokedAt };
      else overlay.revocations.set(id, revokedAt);
      await appendAudit({
        event_type: "suppression.revoked",
        actor_type: "human",
        actor_id: actor,
        review_id: null,
        finding_id: null,
        payload: { suppression_id: id, scope: row.scope },
        created_at: revokedAt,
      });
      return [200, { ...row, active: false, revoked_at: revokedAt }];
    },

    async listAuditEvents({ query }) {
      const filter = {
        review_id: parseString(query, "review_id"),
        finding_id: parseString(query, "finding_id"),
        event_type: parseString(query, "event_type"),
        actor_type: parseEnum(query, "actor_type", ACTOR_TYPES),
        sinceMs: parseDateTime(query, "since"),
      };
      const limit = parseLimit(query, AUDIT_LIMIT_DEFAULT, AUDIT_LIMIT_MAX);
      const after = parseCursor(query, "seq");
      const { items: events, chain } = await allAudit();
      const ordered = [...events].sort((a, b) => a.seq - b.seq);
      const matching = ordered.filter((e) => matchesAudit(e, filter));
      const page = keysetPage(ordered, matching, (e) => e.seq, after, limit);
      if (!page) throw new QueryError("cursor", "cursor names an audit event that does not exist.", query.get("cursor"));
      return [
        200,
        {
          items: page.items,
          chain: chainVerdict(page.items, chain),
          page: { limit, next_cursor: page.nextKey === null ? null : encodeCursor({ seq: page.nextKey }), has_more: page.hasMore },
        },
      ];
    },

    async getAccuracyReport() {
      // repository / since / until cannot be recomputed from one stored report;
      // the report's own `window` states what it covers.
      const report = await file<Record<string, unknown>>(FIXTURE_FILES.accuracyReport);
      if (report === MISSING || report === STUB) {
        fail("INTERNAL_ERROR", `The fixture ${FIXTURE_FILES.accuracyReport} has not been generated.`, {
          fixture: FIXTURE_FILES.accuracyReport,
          stub: report === STUB,
        });
      }
      return [200, report];
    },

    async receiveGithubWebhook() {
      return [200, { status: "ignored", reason: "fixture_mode" }];
    },

    async listReviews({ query, flags }) {
      const repository = parseString(query, "repository");
      const status = parseEnum(query, "status", REVIEW_RUN_STATUSES);
      const gate = parseEnum(query, "gate_conclusion", GATE_CONCLUSIONS);
      const limit = parseLimit(query, LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
      const after = parseCursor(query, "id");
      const running = await liveRuns(flags);
      const rows = (await reviewsIndex())
        .map((r): ReviewListItem => {
          const l = running.get(r.review_id);
          if (!l) return r;
          const s = simStatus(r.review_id, l.frame, l.startedAt, l.final);
          return {
            ...r,
            status: "running",
            trigger: l.trigger === "rerun" ? "rerun" : r.trigger,
            risk_tier: s.risk_tier ?? null,
            gate_conclusion: null,
            counts: { ...s.counts, dropped: 0, disproven: 0 },
            cost_usd_estimate: null,
            duration_seconds: null,
            created_at: toIsoSeconds(l.startedAt),
            finished_at: null,
          };
        })
        .sort(byCreatedDesc((r) => r.review_id));
      const matching = rows.filter(
        (r) => (repository === null || repoString(r.repository) === repository) && (status === null || r.status === status) && (gate === null || r.gate_conclusion === gate),
      );
      const page = keysetPage(rows, matching, (r) => r.review_id, after, limit);
      if (!page) throw new QueryError("cursor", "cursor names a run that does not exist.", query.get("cursor"));
      return [
        200,
        { items: page.items, page: { limit, next_cursor: page.nextKey === null ? null : encodeCursor({ id: page.nextKey }), has_more: page.hasMore }, totals: { matched: matching.length } },
      ];
    },
  };

  // --- entry point ---------------------------------------------------------

  const resolver = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request && init === undefined ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = stripBasePath(url.pathname, basePath);
    const method = request.method.toUpperCase();
    const flags = readFlags(pageParams());
    const delay = typeof options.latency === "number" ? options.latency : (flags.latencyMs ?? jitterMs(method, path));
    await sleep(delay, request.signal);
    const rid = requestId();
    try {
      const match = matchRoute(method, path);
      if (match.kind === "none") return envelope(404, "NOT_FOUND", `No route matches ${method} ${path}.`, { method, path }, rid);
      if (match.kind === "method") return envelope(405, "METHOD_NOT_ALLOWED", `${method} is not allowed on ${path}.`, { method, path, allowed: match.allowed }, rid);
      const [status, body] = await handlers[match.route.operation as ApiOperation]({ request, params: match.params, query: url.searchParams, flags });
      if (request.signal?.aborted) throw abortError();
      return json(status, body, rid);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof HttpFailure) return envelope(error.status, error.code, error.message, error.details, rid);
      if (error instanceof QueryError) return envelope(422, "VALIDATION_ERROR", error.message, { field: error.field, value: error.value ?? null }, rid);
      // A resolver defect answers like the backend would: a visible 500, never a hang.
      const message = error instanceof Error ? error.message : String(error);
      return envelope(500, "INTERNAL_ERROR", `The fixture resolver failed: ${message}`, {}, rid);
    }
  }) as FixtureResolver;

  resolver.startSimulation = startSimulation;
  resolver.stopSimulation = stopSimulation;
  resolver.reset = () => {
    cache = new Map();
    overlay = emptyOverlay();
    replayClaimed = false;
    auditLock = Promise.resolve();
    writeSims({});
  };
  return resolver;
}

/** The app's resolver (src/api/transport.ts sends through it in fixture mode). */
export const fixtureFetch: FixtureResolver = createFixtureResolver();
