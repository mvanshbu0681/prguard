// OWNER: t2a (wave 1).
//
// The fixture resolver: a fetch-compatible function that answers every route in
// src/api/routes.ts (the 14 OpenAPI paths and the plan-A11 run list) from the
// JSON corpus in web/public/fixtures, so the whole app demos with the backend
// off (plan T2, NEXT_PUBLIC_FIXTURES, default on). The generated client sends
// through it via src/api/transport.ts.
//
// Fidelity. Behaviour mirrors the backend at eeb1be8 (api/routes_*.py), not
// just the spec's examples: error messages and detail shapes (a validation
// failure lists every bad field as `details.errors[{loc, msg, type}]`, body
// validation runs before the row lookup), list order (created_at DESC, id
// DESC), cursors (urlsafe base64; the audit trail pages by `seq >` without an
// anchor lookup), X-Request-Id (echoed when sent), and the documents the
// backend assembles live from finding rows (counts, gate.blocking_finding_ids,
// delivery.ladder_breakdown).
//
// - Files are fetched at runtime from /fixtures/*.json and cached in memory;
//   none is bundled. audit/events.json is parsed losslessly (src/api/lossless.ts)
//   and every response is written with lossless stringify, so Python's float
//   lexemes (`1.0`, `1e-05`) reach the browser's hash verifier intact (plan A8).
// - Writes land in an in-memory overlay for the page's lifetime: a suppression
//   flips the finding through the same reducer the optimistic path uses, adds
//   its ledger row and appends a hash-chained `suppression.created` event; a
//   revoke sets revoked_at (the row is never deleted) and appends
//   `suppression.revoked`. A reload restores the pristine corpus.
// - The audit hash is the backend's (plan A8) and needs the canonical-JSON
//   serialiser t6 writes in wave 2. Until setAuditHasher() registers it, an
//   appended event carries the correct prev_hash and event_hash "pending", and
//   the chain verdict does not count it as checked. Once a hasher exists,
//   pending events are re-chained and GET /v1/audit recomputes every hash in the
//   window, exactly as the backend verifies on read.
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
import { encodeCursor, keysetPage, seqPage } from "@/api/cursor";
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
  CursorError,
  QueryReader,
  RequestValidationError,
  byCreatedDesc,
  cursorId,
  cursorNotVisible,
  cursorSeq,
  isUnfilteredAudit,
  ledgerState,
  matchesAudit,
  matchesFinding,
  matchesSuppression,
  runRefs,
  type AuditFilter,
  type SuppressionRef,
  type ValidationIssue,
} from "./fixture-query";
import { simFrame, simPartialResult, simStatus, simTiming, toIsoSeconds, type SimFrame } from "./fixture-sim";
import { FIXTURE_FILES, isFixtureStub } from "./fixture-types";
import {
  applySuppressionToResult,
  applyTransitionToResultCounts,
  applyTransitionToRunCounts,
  findingTransition,
  patchFromCreated,
  suppressFindingReducer,
  type FindingTransition,
  type SuppressionPatch,
} from "./hooks/suppress-reducer";

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
// Errors, as the backend writes them (api/errors.py DEFAULT_MESSAGES).
// ---------------------------------------------------------------------------

const MESSAGES = {
  INVALID_PR_URL: "Could not parse a GitHub pull request from the supplied URL.",
  VALIDATION_ERROR: "The request body failed validation.",
  REVIEW_NOT_FOUND: "No review run with that id.",
  FINDING_NOT_FOUND: "No finding with that id.",
  SUPPRESSION_NOT_FOUND: "No suppression with that id.",
  RESULT_NOT_READY: "The run has not finished; retry, or pass ?partial=true.",
  INTERNAL_ERROR: "An unexpected error occurred.",
} as const satisfies Partial<Record<ApiErrorCode, string>>;

class HttpFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | null = null,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpFailure";
  }
}

function fail(code: keyof typeof MESSAGES, details: Record<string, unknown> | null = null, message: string = MESSAGES[code]): never {
  throw new HttpFailure(API_ERROR_CODES[code], code, message, details);
}

function invalid(...errors: ValidationIssue[]): never {
  throw new RequestValidationError(errors);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const MISSING: unique symbol = Symbol("missing");
const STUB: unique symbol = Symbol("stub");
type Loaded<T> = T | typeof MISSING | typeof STUB;

/** Ids that can safely name a fixture file. Anything else cannot exist in the corpus. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TRUTHY_FLAG = /^(1|true|yes|on)$/i;
/** ?stall=1 freezes the run here: S3 SPECIALISTS, the stage the dashboard's stalled-run copy names. */
const STALL_DEFAULT_STAGE = 3;
const SIM_STORAGE_KEY = "witness:fixture-sim:v1";
/** routes_reviews.py _PR_URL / _PR_SHORTHAND, verbatim. */
const PR_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pulls?\/(\d+)(?:[/?#].*)?$/i;
const PR_SHORTHAND = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
/** routes_suppressions.py: X-Actor-Id names the human; absent, the row records `api`. */
const DEFAULT_ACTOR = "api";
const ACTOR_ID_MAX = 255;

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
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repoString(ref: { owner: string; name: string }): string {
  return `${ref.owner}/${ref.name}`;
}

/** Python's datetime.isoformat() of a UTC instant: `2027-03-01T00:00:00+00:00`, microseconds only when non-zero. */
function pythonIsoformat(ms: number): string {
  const d = new Date(ms);
  const base = d.toISOString().slice(0, 19);
  const micros = d.getUTCMilliseconds() * 1000;
  return `${base}${micros ? `.${String(micros).padStart(6, "0")}` : ""}+00:00`;
}

/** The API's rendering of the same instant (schemas._iso_z): `Z` instead of `+00:00`. */
function isoZ(ms: number): string {
  return pythonIsoformat(ms).replace("+00:00", "Z");
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

interface SimRecord {
  startedAt: number;
  trigger: SimTrigger;
}

interface Overlay {
  /** finding id → the suppression applied to it in this page. */
  suppressed: Map<string, SuppressionPatch>;
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
  return { suppressed: new Map(), suppressions: [], suppressionRefs: new Map(), revocations: new Map(), audit: [] };
}

interface Ctx {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  flags: PageFlags;
  requestId: string;
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
  const baseFindings = () => items<Finding>(FIXTURE_FILES.findingsIndex);

  /** Every finding with the overlay applied, in list order. */
  async function findings(): Promise<Finding[]> {
    return (await baseFindings())
      .map((f) => {
        const patch = overlay.suppressed.get(f.id);
        return patch ? suppressFindingReducer(f, patch) : f;
      })
      .sort(byCreatedDesc((f) => f.id));
  }

  /** How the overlay moved each of a run's findings (for the counts the backend derives live). */
  async function transitionsOf(reviewId: string): Promise<FindingTransition[]> {
    if (!overlay.suppressed.size) return [];
    const out: FindingTransition[] = [];
    for (const f of await baseFindings()) {
      const patch = f.review_id === reviewId ? overlay.suppressed.get(f.id) : undefined;
      const t = patch ? findingTransition(f, suppressFindingReducer(f, patch)) : null;
      if (t) out.push(t);
    }
    return out;
  }

  async function demoRun(): Promise<DemoRun | null> {
    const run = await file<DemoRun>(FIXTURE_FILES.demoRun);
    return run === MISSING || run === STUB ? null : run;
  }

  const storedStatus = (id: string) => file<ReviewStatus>(FIXTURE_FILES.reviewStatus(id));
  const storedResult = (id: string) => file<ReviewResult>(FIXTURE_FILES.reviewResult(id));

  function notFoundRun(id: string, loaded?: typeof MISSING | typeof STUB): never {
    fail("REVIEW_NOT_FOUND", loaded === STUB ? { review_id: id, fixture_stub: true } : { review_id: id });
  }

  function checkRunId(id: string): void {
    if (!SAFE_ID.test(id)) notFoundRun(id);
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

  /**
   * The verdict for the returned window, the way core/audit.verify_chain reads
   * it: every row's hash (recomputed when a hasher is registered; otherwise the
   * corpus's own verdict stands for its rows and a pending row is not counted
   * as checked), the linkage of rows that are neighbours in the chain, and — on
   * an unfiltered page — no missing seq.
   */
  async function chainVerdict(page: AuditItemWithTenant[], stored: AuditChain | null, unfiltered: boolean): Promise<AuditChain> {
    const h = hasher();
    const storedBreak = stored && stored.verified === false ? (stored.broken_at_seq ?? null) : null;
    let brokenAt: number | null = null;
    let previous: AuditItemWithTenant | null = null;
    for (const e of page) {
      let intact = true;
      if (e.event_hash !== PENDING_EVENT_HASH) {
        intact = h ? (await h(hashDocument(e), e.prev_hash ?? null)) === e.event_hash : e.seq !== storedBreak;
      }
      if (intact && previous) {
        if (e.seq === previous.seq + 1) intact = (e.prev_hash ?? null) === previous.event_hash;
        else if (unfiltered) intact = false;
      }
      if (!intact) {
        brokenAt = e.seq;
        break;
      }
      previous = e;
    }
    const seqs = page.map((e) => e.seq);
    return {
      verified: brokenAt === null,
      // Every row in the window, as the backend counts — except one still waiting for its hash.
      checked: page.filter((e) => e.event_hash !== PENDING_EVENT_HASH).length,
      first_seq: seqs.length ? Math.min(...seqs) : null,
      last_seq: seqs.length ? Math.max(...seqs) : null,
      broken_at_seq: brokenAt,
    };
  }

  // --- responses -----------------------------------------------------------

  function nextRequestId(request: Request): string {
    requestCount += 1;
    return request.headers.get("x-request-id") || `fx_${requestCount.toString(36).padStart(6, "0")}`;
  }

  function json(status: number, body: unknown, rid: string, headers: Record<string, string> = {}): Response {
    return new Response(stringifyLosslessJson(body), {
      status,
      headers: { "content-type": "application/json", "x-request-id": rid, "x-witness-source": "fixture", ...headers },
    });
  }

  function envelope(status: number, code: string, message: string, details: Record<string, unknown> | null, rid: string, headers: Record<string, string> = {}): Response {
    return json(status, { error: { code, message, details, request_id: rid } }, rid, headers);
  }

  /** The request body as FastAPI sees it: a JSON object, or a 422 naming the problem. */
  async function readBody(request: Request): Promise<Record<string, unknown>> {
    const text = await request.text();
    if (!text.trim()) invalid({ loc: ["body"], msg: "Field required", type: "missing" });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      invalid({ loc: ["body", "0"], msg: "JSON decode error", type: "json_invalid" });
    }
    if (!isRecord(body)) invalid({ loc: ["body"], msg: "Input should be a valid dictionary or object to extract fields from", type: "model_attributes_type" });
    return body;
  }

  function actorOf(request: Request): string {
    return (request.headers.get("x-actor-id") || DEFAULT_ACTOR).slice(0, ACTOR_ID_MAX);
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

  function page<T>(p: { items: T[]; hasMore: boolean; nextKey: string | number | null }, limit: number, key: "id" | "seq") {
    return { limit, next_cursor: p.nextKey === null ? null : encodeCursor({ [key]: p.nextKey }), has_more: p.hasMore };
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
      if (prUrl === undefined) invalid({ loc: ["body", "pr_url"], msg: "Field required", type: "missing" });
      if (typeof prUrl !== "string") invalid({ loc: ["body", "pr_url"], msg: "Input should be a valid string", type: "string_type" });
      if (body.options !== undefined && body.options !== null && !isRecord(body.options)) {
        invalid({ loc: ["body", "options"], msg: "Input should be a valid dictionary or object to extract fields from", type: "model_attributes_type" });
      }
      const candidate = prUrl.trim();
      if (!PR_URL.test(candidate) && !PR_SHORTHAND.test(candidate)) fail("INVALID_PR_URL", { pr_url: prUrl });
      const force = isRecord(body.options) && body.options.force === true;
      // Plan A5: in fixture mode every submission replays the demo run.
      const id = ids.demo_review_id;
      const repository = { owner: ids.repository.owner, name: ids.repository.name };
      const current = await live(id, { ...flags, replay: false });
      if (current && current.frame.phase === "running" && !force) {
        // E21: an in-flight run for the same pull request is returned, not duplicated.
        return [
          202,
          accepted(id, {
            status: "running",
            trigger: current.trigger === "rerun" ? "rerun" : "api",
            repository,
            pull_request: { number: ids.pr_number, head_sha: current.frame.stageIndex > 1 ? (current.final?.head_sha ?? null) : null },
            created_at: toIsoSeconds(current.startedAt),
            deduplicated: true,
          }),
        ];
      }
      startSimulation(id, "api");
      return [202, accepted(id, { trigger: "api", repository, pull_request: { number: ids.pr_number, head_sha: null } })];
    },

    async rerunReview({ params }) {
      const id = params.review_id!;
      checkRunId(id);
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
      checkRunId(id);
      const l = await live(id, flags);
      if (l && (l.frame.phase === "running" || !l.final)) return [200, simStatus(id, l.frame, l.startedAt, l.final)];
      const status = await storedStatus(id);
      if (status === MISSING || status === STUB) notFoundRun(id, status);
      // The backend counts finding rows on every read: suppressions made in this page move them.
      const moved = await transitionsOf(id);
      return [200, moved.length ? { ...status, counts: moved.reduce(applyTransitionToRunCounts, status.counts) } : status];
    },

    async getReviewResult({ params, query, flags }) {
      const id = params.review_id!;
      checkRunId(id);
      const q = new QueryReader(query);
      const partial = q.bool("partial") ?? false;
      q.done();
      const l = await live(id, flags);
      const result = await storedResult(id);
      if (l && l.frame.phase === "running") {
        if (!partial) fail("RESULT_NOT_READY", { status: "running" });
        if (result === MISSING || result === STUB) notFoundRun(id, result);
        return [200, simPartialResult(result, l.frame, l.startedAt)];
      }
      if (result === MISSING || result === STUB) notFoundRun(id, result);
      const status = await storedStatus(id);
      if (status !== MISSING && status !== STUB && (status.status === "queued" || status.status === "running") && !partial) {
        fail("RESULT_NOT_READY", { status: status.status });
      }
      let assembled = result;
      for (const [findingId, patch] of overlay.suppressed) assembled = applySuppressionToResult(assembled, findingId, patch);
      return [200, assembled];
    },

    async listFindings({ query }) {
      const q = new QueryReader(query);
      const filter = {
        review_id: q.string("review_id"),
        repository: q.string("repository"),
        pr_number: q.integer("pr_number"),
        fingerprint: q.string("fingerprint"),
        status: q.enumOf("status", FINDING_STATUSES),
        severity_min: q.enumOf("severity_min", SEVERITY_BANDS),
        blocking: q.bool("blocking"),
        proof_status: q.enumList("proof_status", PROOF_STATUSES),
      };
      const limit = q.limit(LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
      q.done();
      const cursor = q.string("cursor");
      const after = cursorId(cursor);
      const all = await findings();
      const runs = runRefs(await reviewsIndex());
      const matching = all.filter((f) => matchesFinding(f, filter, runs));
      const p = keysetPage(all, matching, (f) => f.id, after, limit);
      if (!p) throw new CursorError(cursorNotVisible("finding"), cursor!);
      return [200, { items: p.items, page: page(p, limit, "id"), totals: { matched: matching.length } }];
    },

    async getFinding({ params }) {
      const id = params.finding_id!;
      const finding = SAFE_ID.test(id) ? (await findings()).find((f) => f.id === id) : undefined;
      if (!finding) fail("FINDING_NOT_FOUND", { finding_id: id });
      return [200, finding];
    },

    async suppressFinding({ params, request, requestId }) {
      // FastAPI validates the body before the handler looks the finding up.
      const body = await readBody(request);
      const issues: ValidationIssue[] = [];
      const scope = body.scope;
      if (scope === undefined) issues.push({ loc: ["body", "scope"], msg: "Field required", type: "missing" });
      else if (typeof scope !== "string" || !(SUPPRESSION_SCOPES as readonly string[]).includes(scope)) {
        issues.push({ loc: ["body", "scope"], msg: "Input should be 'line', 'file', 'pattern', 'repo' or 'tenant'", type: "literal_error" });
      }
      const reason = body.reason;
      if (reason === undefined) issues.push({ loc: ["body", "reason"], msg: "Field required", type: "missing" });
      else if (typeof reason !== "string") issues.push({ loc: ["body", "reason"], msg: "Input should be a valid string", type: "string_type" });
      const expiresRaw = body.expires_at ?? null;
      if (expiresRaw !== null && (typeof expiresRaw !== "string" || !ISO_DATETIME.test(expiresRaw) || Number.isNaN(Date.parse(expiresRaw)))) {
        issues.push({ loc: ["body", "expires_at"], msg: "Input should be a valid datetime", type: "datetime_parsing" });
      }
      const matchRaw = body.match_path ?? null;
      if (matchRaw !== null && typeof matchRaw !== "string") issues.push({ loc: ["body", "match_path"], msg: "Input should be a valid string", type: "string_type" });
      if (issues.length) invalid(...issues);
      // SuppressRequest._spec_6_6_rules, in its order.
      if (!(reason as string).trim()) invalid({ loc: ["body"], msg: "Value error, reason is required and must be non-empty", type: "value_error" });
      if (scope === "pattern" && !((matchRaw as string | null) ?? "").trim()) {
        invalid({ loc: ["body"], msg: "Value error, match_path is required when scope is 'pattern'", type: "value_error" });
      }

      const id = params.finding_id!;
      const all = await findings();
      const finding = SAFE_ID.test(id) ? all.find((f) => f.id === id) : undefined;
      if (!finding) fail("FINDING_NOT_FOUND", { finding_id: id });

      const typedScope = scope as SuppressionCreated["scope"];
      const actor = actorOf(request);
      // utcnow(), rendered like schemas._iso_z: microseconds when non-zero, then Z.
      const createdAt = isoZ(now());
      const expiresMs = expiresRaw === null ? null : Date.parse(expiresRaw as string);
      // _match_path_for: pattern keeps the supplied glob, file records the finding's own path.
      const matchPath = typedScope === "pattern" ? (matchRaw as string) : typedScope === "file" ? finding.location.file_path : null;
      // _affected_findings: the same fingerprint, else the same rule in the same file.
      const sameIdentity = all.filter((f) =>
        finding.fingerprint ? f.fingerprint === finding.fingerprint : f.rule_key === finding.rule_key && f.location.file_path === finding.location.file_path,
      );
      const thisRun = sameIdentity.filter((f) => f.review_id === finding.review_id).length;
      const created: SuppressionCreated = {
        suppression_id: newId(),
        fingerprint: finding.fingerprint ?? null,
        scope: typedScope,
        match_path: matchPath,
        reason: (reason as string).trim(),
        created_by: actor,
        source: "human_api",
        expires_at: expiresMs === null ? null : isoZ(expiresMs),
        revoked_at: null,
        affected_findings: { this_run: thisRun, historical: sameIdentity.length - thisRun },
        created_at: createdAt,
      };
      const run = (await reviewsIndex()).find((r) => r.review_id === finding.review_id);
      overlay.suppressed.set(finding.id, patchFromCreated(created));
      overlay.suppressions.push({
        suppression_id: created.suppression_id,
        scope: created.scope,
        match_path: created.match_path,
        rule_key: finding.rule_key,
        category: finding.fingerprint ? finding.category : null,
        reason: created.reason,
        created_by: actor,
        source: "human_api",
        active: true,
        expires_at: created.expires_at,
        revoked_at: null,
        // _usage(): the findings that point at this row — the one just suppressed.
        suppressed_count: 1,
        last_matched_at: finding.created_at,
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
          scope: created.scope,
          match_path: created.match_path,
          reason: created.reason,
          expires_at: expiresMs === null ? null : pythonIsoformat(expiresMs),
          request_id: requestId,
        },
        created_at: createdAt,
      });
      return [201, created];
    },

    async listSuppressions({ query }) {
      const q = new QueryReader(query);
      const filter = {
        repository: q.string("repository"),
        scope: q.enumOf("scope", SUPPRESSION_SCOPES),
        fingerprint: q.string("fingerprint"),
      };
      const active = q.bool("active") ?? true;
      const limit = q.limit(LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
      q.done();
      const cursor = q.string("cursor");
      const after = cursorId(cursor);
      const nowMs = now();
      const rows = await ledger();
      const refs = await ledgerRefs(rows);
      const inScope = rows.filter((r) => matchesSuppression(r, filter, refs.get(r.suppression_id)));
      // `active=false` is the whole slice, like the backend (it filters only when active is true).
      const matching = active ? inScope.filter((r) => ledgerState(r, nowMs) === "active") : inScope;
      const p = keysetPage(rows, matching, (r) => r.suppression_id, after, limit);
      if (!p) throw new CursorError(cursorNotVisible("suppression"), cursor!);
      // Totals describe the slice before the `active` filter (routes_suppressions._totals).
      const states = inScope.map((r) => ledgerState(r, nowMs));
      const totals = {
        active: states.filter((s) => s === "active").length,
        expired: states.filter((s) => s === "expired").length,
        revoked: states.filter((s) => s === "revoked").length,
      };
      return [200, { items: p.items, page: page(p, limit, "id"), totals }];
    },

    async revokeSuppression({ params, request, requestId }) {
      const id = params.suppression_id!;
      const row = SAFE_ID.test(id) ? (await ledger()).find((r) => r.suppression_id === id) : undefined;
      if (!row) fail("SUPPRESSION_NOT_FOUND", { suppression_id: id });
      // Idempotent: a revoked row is returned as it is, and no second event is written.
      if (row.revoked_at) return [200, row];
      const revokedAt = isoZ(now());
      const own = overlay.suppressions.findIndex((r) => r.suppression_id === id);
      if (own >= 0) overlay.suppressions[own] = { ...overlay.suppressions[own]!, active: false, revoked_at: revokedAt };
      else overlay.revocations.set(id, revokedAt);
      await appendAudit({
        event_type: "suppression.revoked",
        actor_type: "human",
        actor_id: actorOf(request),
        review_id: null,
        finding_id: null,
        payload: { suppression_id: id, scope: row.scope, request_id: requestId },
        created_at: revokedAt,
      });
      return [200, { ...row, active: false, revoked_at: revokedAt }];
    },

    async listAuditEvents({ query }) {
      const q = new QueryReader(query);
      const filter: AuditFilter = {
        review_id: q.string("review_id"),
        finding_id: q.string("finding_id"),
        event_type: q.string("event_type"),
        actor_type: q.enumOf("actor_type", ACTOR_TYPES),
        sinceMs: q.dateTime("since"),
      };
      const limit = q.limit(AUDIT_LIMIT_DEFAULT, AUDIT_LIMIT_MAX);
      q.done();
      const after = cursorSeq(q.string("cursor"));
      const { items: events, chain } = await allAudit();
      const ordered = [...events].sort((a, b) => a.seq - b.seq);
      const p = seqPage(
        ordered.filter((e) => matchesAudit(e, filter)),
        after,
        limit,
      );
      return [200, { items: p.items, chain: await chainVerdict(p.items, chain, isUnfilteredAudit(filter)), page: page(p, limit, "seq") }];
    },

    async getAccuracyReport({ query }) {
      // repository / since / until cannot be recomputed from one stored report;
      // the report's own `window` states what it covers.
      const q = new QueryReader(query);
      q.string("repository");
      q.dateTime("since");
      q.dateTime("until");
      q.done();
      const report = await file<Record<string, unknown>>(FIXTURE_FILES.accuracyReport);
      if (report === MISSING || report === STUB) {
        fail("INTERNAL_ERROR", { fixture: FIXTURE_FILES.accuracyReport, fixture_stub: report === STUB }, `The fixture ${FIXTURE_FILES.accuracyReport} has not been generated.`);
      }
      return [200, report];
    },

    async receiveGithubWebhook() {
      return [200, { status: "ignored", reason: "fixture_mode" }];
    },

    async listReviews({ query, flags }) {
      const q = new QueryReader(query);
      const repository = q.string("repository");
      const status = q.enumOf("status", REVIEW_RUN_STATUSES);
      const gate = q.enumOf("gate_conclusion", GATE_CONCLUSIONS);
      const limit = q.limit(LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
      q.done();
      const cursor = q.string("cursor");
      const after = cursorId(cursor);
      const running = await liveRuns(flags);
      const rows: ReviewListItem[] = [];
      for (const r of await reviewsIndex()) {
        const l = running.get(r.review_id);
        if (!l) {
          const moved = await transitionsOf(r.review_id);
          rows.push(moved.length ? { ...r, counts: moved.reduce(applyTransitionToResultCounts, r.counts) ?? r.counts } : r);
          continue;
        }
        const s = simStatus(r.review_id, l.frame, l.startedAt, l.final);
        rows.push({
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
        });
      }
      rows.sort(byCreatedDesc((r) => r.review_id));
      const matching = rows.filter(
        (r) => (repository === null || repoString(r.repository) === repository) && (status === null || r.status === status) && (gate === null || r.gate_conclusion === gate),
      );
      const p = keysetPage(rows, matching, (r) => r.review_id, after, limit);
      if (!p) throw new CursorError(cursorNotVisible("review run"), cursor!);
      return [200, { items: p.items, page: page(p, limit, "id"), totals: { matched: matching.length } }];
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
    const rid = nextRequestId(request);
    try {
      const match = matchRoute(method, path);
      // Starlette's own 404 / 405, wrapped in the envelope by the backend's http_exception_handler.
      if (match.kind === "none") return envelope(404, "NOT_FOUND", "Not Found", null, rid);
      if (match.kind === "method") return envelope(405, "METHOD_NOT_ALLOWED", "Method Not Allowed", null, rid, { allow: match.allowed.join(", ") });
      const [status, body] = await handlers[match.route.operation as ApiOperation]({ request, params: match.params, query: url.searchParams, flags, requestId: rid });
      if (request.signal?.aborted) throw abortError();
      return json(status, body, rid);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof HttpFailure) return envelope(error.status, error.code, error.message, error.details, rid, error.headers);
      if (error instanceof RequestValidationError) return envelope(422, "VALIDATION_ERROR", MESSAGES.VALIDATION_ERROR, { errors: error.errors }, rid);
      if (error instanceof CursorError) return envelope(422, "VALIDATION_ERROR", error.message, { cursor: error.cursor }, rid);
      // A resolver defect answers like the backend's unhandled_error_handler: a visible 500, never a hang.
      const name = error instanceof Error ? error.name : typeof error;
      const message = error instanceof Error ? error.message : String(error);
      return envelope(500, "INTERNAL_ERROR", MESSAGES.INTERNAL_ERROR, { type: name, fixture_error: message }, rid);
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
