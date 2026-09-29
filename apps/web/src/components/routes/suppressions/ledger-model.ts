// The ledger's derived model — pure, no React. A SuppressionItem on its own cannot
// say what it silenced, where, or where it sits on the audit chain; three other
// reads can, and this module joins them:
//   - GET /v1/findings?status=suppressed  → the finding each suppression silenced
//     (its title, fingerprint, file) via finding.suppression.suppression_id
//   - GET /v1/reviews                     → which repository that finding's run was in
//   - GET /v1/audit?event_type=…          → the seq of suppression.created /
//     suppression.revoked / override.break_glass for each suppression id
// Every join is optional: a row with no match simply shows less, never a guess.
import type { Finding, SuppressionItem } from "@/lib/api-types";
import type { SuppressionScope } from "@/lib/contracts";
import { DAY_MS, EXPIRING_SOON_DAYS, SCOPE_ORDER, daysUntil, ledgerState, type LedgerState } from "./format";

export interface LedgerFinding {
  id: string;
  title: string;
  fingerprint: string | null;
  filePath: string | null;
  band: string | null;
  reviewId: string;
  /** Distinct findings (across runs) this suppression silenced that we can see. */
  occurrences: number;
}

export interface ChainRef {
  seq: number;
  actor: string | null;
  at: string;
}

export interface AuditIndex {
  created: Map<string, ChainRef>;
  revoked: Map<string, ChainRef>;
  breakGlass: Map<string, ChainRef>;
}

export interface LedgerEntry {
  item: SuppressionItem;
  state: LedgerState;
  finding: LedgerFinding | null;
  repository: string | null;
  created: ChainRef | null;
  revoked: ChainRef | null;
  breakGlass: ChainRef | null;
  /** Whole days until expiry (negative once passed); null when open-ended. */
  expiresInDays: number | null;
}

/** The newest finding per suppression id, plus how many distinct findings it covers. */
export function findingsBySuppression(findings: readonly Finding[]): Map<string, LedgerFinding> {
  const map = new Map<string, LedgerFinding & { newest: string }>();
  for (const f of findings) {
    const id = f.suppression?.suppression_id;
    if (!id) continue;
    const seen = map.get(id);
    if (!seen) {
      map.set(id, {
        id: f.id,
        title: f.title,
        fingerprint: f.fingerprint ?? null,
        filePath: f.location?.file_path ?? null,
        band: f.severity?.band ?? null,
        reviewId: f.review_id,
        occurrences: 1,
        newest: f.created_at,
      });
      continue;
    }
    seen.occurrences += 1;
    if (f.created_at > seen.newest) {
      Object.assign(seen, {
        id: f.id,
        title: f.title,
        fingerprint: f.fingerprint ?? null,
        filePath: f.location?.file_path ?? null,
        band: f.severity?.band ?? null,
        reviewId: f.review_id,
        newest: f.created_at,
      });
    }
  }
  return map;
}

/** A minimal audit event shape (what useAudit returns, without the lossless payload types). */
export interface AuditLike {
  seq: number;
  event_type: string;
  actor_id?: string | null;
  payload?: unknown;
  created_at: string;
}

function suppressionIdOf(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "suppression_id" in payload) {
    const v = (payload as { suppression_id?: unknown }).suppression_id;
    return typeof v === "string" ? v : null;
  }
  return null;
}

export function indexAudit(events: readonly AuditLike[]): AuditIndex {
  const index: AuditIndex = { created: new Map(), revoked: new Map(), breakGlass: new Map() };
  for (const e of events) {
    const id = suppressionIdOf(e.payload);
    if (!id) continue;
    const ref: ChainRef = { seq: e.seq, actor: e.actor_id ?? null, at: e.created_at };
    if (e.event_type === "suppression.created") index.created.set(id, ref);
    else if (e.event_type === "suppression.revoked") index.revoked.set(id, ref);
    else if (e.event_type === "override.break_glass") index.breakGlass.set(id, ref);
  }
  return index;
}

export function buildEntries(
  items: readonly SuppressionItem[],
  nowMs: number,
  joins: { findings?: Map<string, LedgerFinding>; repoByReview?: Map<string, string>; audit?: AuditIndex } = {},
): LedgerEntry[] {
  return items.map((item) => {
    const finding = joins.findings?.get(item.suppression_id) ?? null;
    return {
      item,
      state: ledgerState(item, nowMs),
      finding,
      repository: finding ? (joins.repoByReview?.get(finding.reviewId) ?? null) : null,
      created: joins.audit?.created.get(item.suppression_id) ?? null,
      revoked: joins.audit?.revoked.get(item.suppression_id) ?? null,
      breakGlass: joins.audit?.breakGlass.get(item.suppression_id) ?? null,
      expiresInDays: daysUntil(item.expires_at, nowMs),
    };
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Case-insensitive match over everything a row prints. */
export function matchesSearch(entry: LedgerEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { item, finding, repository } = entry;
  const haystack = [
    item.reason,
    item.rule_key,
    item.match_path,
    item.created_by,
    item.category,
    item.scope,
    item.suppression_id,
    finding?.title,
    finding?.fingerprint,
    finding?.filePath,
    repository,
  ];
  return haystack.some((v) => typeof v === "string" && v.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

export interface Count<K extends string = string> {
  key: K;
  count: number;
}

export interface LedgerSummary {
  /** Findings silenced across the whole ledger (sum of suppressed_count). */
  silenced: number;
  /** Findings silenced by suppressions that are active now. */
  silencedNow: number;
  active: number;
  expired: number;
  revoked: number;
  /** Active suppressions with no expiry. */
  openEnded: number;
  /** Active suppressions expiring within EXPIRING_SOON_DAYS, soonest first. */
  expiringSoon: LedgerEntry[];
  /** Active suppressions by category, largest first. */
  byCategory: Count[];
  /** Active suppressions by scope, narrowest first (every scope present, zero or not). */
  byScope: Count<SuppressionScope>[];
  /** Who created suppressions (every state), most first. */
  suppressors: Count[];
  /** Suppressions created per week, oldest first; the last bin ends at `nowMs`. */
  weekly: number[];
  /** Active suppressions of security findings — the ones worth a second look. */
  securityActive: number;
  /** Active suppressions recorded with a break-glass override. */
  breakGlass: number;
}

function tally<K extends string>(keys: readonly K[]): Count<K>[] {
  const map = new Map<K, number>();
  for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function summarize(entries: readonly LedgerEntry[], nowMs: number, weeks = 6): LedgerSummary {
  const active = entries.filter((e) => e.state === "active");
  const weekly = Array.from({ length: weeks }, () => 0);
  for (const e of entries) {
    const t = Date.parse(e.item.created_at);
    if (Number.isNaN(t) || t > nowMs) continue;
    const back = Math.floor((nowMs - t) / (7 * DAY_MS));
    if (back < weeks) weekly[weeks - 1 - back] += 1;
  }
  const scopeCounts = new Map(tally(active.map((e) => e.item.scope)).map((c) => [c.key, c.count]));
  return {
    silenced: entries.reduce((n, e) => n + (e.item.suppressed_count ?? 0), 0),
    silencedNow: active.reduce((n, e) => n + (e.item.suppressed_count ?? 0), 0),
    active: active.length,
    expired: entries.filter((e) => e.state === "expired").length,
    revoked: entries.filter((e) => e.state === "revoked").length,
    openEnded: active.filter((e) => !e.item.expires_at).length,
    expiringSoon: active
      .filter((e) => e.expiresInDays !== null && e.expiresInDays >= 0 && e.expiresInDays <= EXPIRING_SOON_DAYS)
      .sort((a, b) => (a.expiresInDays ?? 0) - (b.expiresInDays ?? 0)),
    byCategory: tally(active.map((e) => e.item.category ?? "uncategorised")),
    byScope: SCOPE_ORDER.map((key) => ({ key, count: scopeCounts.get(key) ?? 0 })),
    suppressors: tally(entries.map((e) => e.item.created_by ?? "system")),
    weekly,
    securityActive: active.filter((e) => e.item.category === "security").length,
    breakGlass: active.filter((e) => e.breakGlass !== null).length,
  };
}
