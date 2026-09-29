// The audit chain's derived model — pure, no React, no DOM. Families group the
// seventeen event types into what a reader filters by; `describe` turns a payload
// into one plain sentence; actors are classified so a person, Witness itself and
// the pipeline never look alike.
import { numericValue } from "@/api/lossless";
import type { LosslessAuditEvent } from "@/components/evidence/ChainRail";

export type AuditEvent = LosslessAuditEvent & { review_id?: string | null; finding_id?: string | null };

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

export const FAMILIES = ["runs", "findings", "proofs", "gates", "suppressions", "overrides"] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_LABEL: Record<Family, string> = {
  runs: "Runs",
  findings: "Findings",
  proofs: "Proofs",
  gates: "Gates",
  suppressions: "Suppressions",
  overrides: "Overrides",
};

export function familyOf(eventType: string): Family {
  if (eventType.startsWith("review.")) return "runs";
  if (eventType.startsWith("finding.")) return "findings";
  if (eventType.startsWith("proof.")) return "proofs";
  if (eventType.startsWith("gate.")) return "gates";
  if (eventType.startsWith("suppression.")) return "suppressions";
  return "overrides";
}

/** `finding.proposed` → `Finding proposed`; `review.stage_completed` → `Stage completed`. */
export function typeLabel(eventType: string): string {
  const LABELS: Record<string, string> = {
    "review.requested": "Review requested",
    "review.started": "Review started",
    "review.stage_completed": "Stage completed",
    "review.degraded": "Review degraded",
    "review.failed": "Review failed",
    "review.completed": "Review completed",
    "finding.proposed": "Finding proposed",
    "finding.suppressed": "Finding silenced",
    "finding.published": "Finding published",
    "finding.disproven": "Finding refuted",
    "proof.generated": "Proof generated",
    "proof.executed": "Proof executed",
    "gate.evaluated": "Gate evaluated",
    "gate.delivered": "Gate delivered",
    "suppression.created": "Suppression created",
    "suppression.revoked": "Suppression revoked",
    "override.break_glass": "Break-glass override",
  };
  return LABELS[eventType] ?? eventType.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Visual tone of an event's type tag. Proof and gate tones follow the product's one
 *  colour code (kit PROOF_ENCODING / GATE_ENCODING): proven and clear are lime,
 *  refuted is ink (an outline), inconclusive amber, blocked red, neutral grey. */
export type EventTone = "neutral" | "ok" | "danger" | "warn" | "refuted";

function field(payload: unknown, key: string): unknown {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : undefined;
}
function str(payload: unknown, key: string): string | null {
  const v = field(payload, key);
  return typeof v === "string" ? v : null;
}
function num(payload: unknown, key: string): number | null {
  return numericValue(field(payload, key));
}

export function eventTone(e: Pick<AuditEvent, "event_type" | "payload">): EventTone {
  switch (e.event_type) {
    case "override.break_glass":
    case "review.failed":
      return "danger";
    case "review.degraded":
    case "suppression.created":
    case "suppression.revoked":
    case "finding.suppressed":
      return "warn";
    case "proof.executed": {
      const status = str(e.payload, "proof_status");
      return status === "proven" ? "ok" : status === "disproven" ? "refuted" : status === "inconclusive" ? "warn" : "neutral";
    }
    case "gate.evaluated":
      return str(e.payload, "conclusion") === "failure" ? "danger" : str(e.payload, "conclusion") === "success" ? "ok" : "neutral";
    case "finding.disproven":
      return "refuted";
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------------------
// One sentence per event
// ---------------------------------------------------------------------------

function seconds(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

const humanWord = (s: string | null) => (s ? s.replace(/_/g, " ") : "");

/** One plain sentence for the event's payload; never invents what the payload lacks. */
export function describe(e: Pick<AuditEvent, "event_type" | "payload">): string {
  const p = e.payload;
  switch (e.event_type) {
    case "review.requested": {
      const repo = str(p, "repository");
      const pr = num(p, "pr_number");
      const via = str(p, "trigger");
      return [repo && pr !== null ? `${repo}#${pr}` : repo, via ? `via ${via}` : null, field(p, "force") === true ? "forced" : null].filter(Boolean).join(" · ") || "Review requested";
    }
    case "review.started": {
      const total = num(p, "stage_total");
      return `${total !== null ? `${total} stages` : "Pipeline"}${str(p, "trigger") ? ` · ${str(p, "trigger")}` : ""}`;
    }
    case "review.stage_completed": {
      const i = num(p, "stage_index");
      const total = num(p, "stage_total");
      const stage = humanWord(str(p, "stage"));
      return `${i !== null && total !== null ? `${i}/${total} ` : ""}${stage || "stage"}${num(p, "duration_ms") !== null ? ` in ${seconds(num(p, "duration_ms"))}` : ""}`;
    }
    case "review.degraded": {
      const d = field(p, "degradations");
      return Array.isArray(d) && d.length ? `Degraded: ${d.map((x) => humanWord(String(x))).join(", ")}` : "Degraded";
    }
    case "review.failed":
      return [str(p, "error_code"), str(p, "stage") ? `at ${humanWord(str(p, "stage"))}` : null].filter(Boolean).join(" ") || "Review failed";
    case "review.completed": {
      const counts = field(p, "counts");
      const published = num(counts, "published");
      const blocking = num(counts, "blocking");
      const gate = str(p, "gate_conclusion");
      return [str(p, "status"), published !== null ? `${published} published` : null, blocking !== null ? `${blocking} blocking` : null, gate ? `gate ${gate}` : null]
        .filter(Boolean)
        .join(" · ");
    }
    case "finding.proposed": {
      const band = str(p, "severity_band");
      const score = num(p, "severity_score");
      return [humanWord(str(p, "rule_key")), str(p, "file_path"), band ? `${band}${score !== null ? ` ${score.toFixed(2)}` : ""}` : null].filter(Boolean).join(" · ");
    }
    case "finding.published": {
      const mode = humanWord(str(p, "delivery_mode"));
      const line = num(p, "delivered_line");
      return [mode ? `Delivered ${mode}` : null, line !== null ? `line ${line}` : null, field(p, "blocking") === true ? "blocking" : null, str(p, "proof_status")].filter(Boolean).join(" · ");
    }
    case "finding.disproven":
      return `Refuted by its own test${str(p, "outcome") ? ` · ${humanWord(str(p, "outcome"))}` : ""}${str(p, "clamped_to") ? ` · clamped to ${str(p, "clamped_to")}` : ""}`;
    case "finding.suppressed":
      return `Silenced by suppression ${(str(p, "suppression_id") ?? "").slice(0, 8)}`;
    case "proof.generated":
      return str(p, "test_file_path") ?? "Repro test written";
    case "proof.executed": {
      const base = num(p, "base_exit_code");
      const head = num(p, "head_exit_code");
      return [str(p, "proof_status"), base !== null && head !== null ? `base exit ${base} · head exit ${head}` : null, humanWord(str(p, "isolation"))].filter(Boolean).join(" · ");
    }
    case "gate.evaluated":
      return str(p, "reason") ?? str(p, "conclusion") ?? "Gate evaluated";
    case "gate.delivered":
      return [humanWord(str(p, "delivery")), str(p, "context_name"), field(p, "delivered") === false ? "not delivered" : null].filter(Boolean).join(" · ");
    case "suppression.created":
    case "override.break_glass":
      return str(p, "reason") ?? "";
    case "suppression.revoked":
      return `Revoked ${str(p, "scope") ?? ""} suppression ${(str(p, "suppression_id") ?? "").slice(0, 8)}`.replace(/\s+/g, " ");
    default:
      return "";
  }
}

/** Events whose sentence is a person's own words (printed as a quote). */
export function isQuote(eventType: string): boolean {
  return eventType === "suppression.created" || eventType === "override.break_glass";
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

export type ActorKind = "human" | "witness" | "system";

export interface ActorView {
  kind: ActorKind;
  /** What the row prints: `priya-raman`, `witness[bot]`, `pipeline`. */
  name: string;
  /** A second, quieter clause: `bugs specialist · claude-sonnet-5`, `docker`. */
  detail: string | null;
  /** The glyph key for a system actor. */
  glyph: "webhook" | "pipeline" | "gate" | "proof" | "reaper" | "api" | "system";
}

export function actorView(e: Pick<AuditEvent, "actor_type" | "actor_id">): ActorView {
  const id = e.actor_id ?? "";
  if (e.actor_type === "ai") {
    // specialist:bugs:claude-sonnet-5
    const [, role, model] = id.split(":");
    return { kind: "witness", name: "witness[bot]", detail: [role ? `${role} specialist` : null, model].filter(Boolean).join(" · ") || null, glyph: "system" };
  }
  if (e.actor_type === "human") {
    return { kind: "human", name: id || "someone", detail: id === "api" ? "API key" : null, glyph: id === "api" ? "api" : "system" };
  }
  const [head, tail] = id.split(":");
  const glyph: ActorView["glyph"] =
    head === "webhook" ? "webhook" : head === "pipeline" ? "pipeline" : head === "gate" ? "gate" : head === "proof-runner" ? "proof" : head === "reaper" ? "reaper" : "system";
  return { kind: "system", name: head || "system", detail: tail ?? null, glyph };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchQuery = { kind: "none" } | { kind: "seq"; seq: number } | { kind: "hash"; prefix: string } | { kind: "text"; text: string };

/** `#1428` / `1428` → a seq; 4+ hex chars → a hash prefix; anything else → text. */
export function parseSearch(raw: string): SearchQuery {
  const q = raw.trim().toLowerCase();
  if (!q) return { kind: "none" };
  const seq = /^#?(\d{1,9})$/.exec(q);
  if (seq) return { kind: "seq", seq: Number(seq[1]) };
  if (/^[0-9a-f]{4,64}$/.test(q)) return { kind: "hash", prefix: q };
  return { kind: "text", text: q };
}

export function matchesSearch(e: AuditEvent, q: SearchQuery): boolean {
  switch (q.kind) {
    case "none":
      return true;
    case "seq":
      return e.seq === q.seq;
    case "hash":
      return e.event_hash.startsWith(q.prefix) || (e.prev_hash ?? "").startsWith(q.prefix) || (e.finding_id ?? "").startsWith(q.prefix) || (e.review_id ?? "").startsWith(q.prefix);
    case "text": {
      const hay = [e.event_type, typeLabel(e.event_type), e.actor_id, describe(e), e.review_id, e.finding_id].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q.text);
    }
  }
}

// ---------------------------------------------------------------------------
// Day grouping (newest first) and activity
// ---------------------------------------------------------------------------

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Tue 23 Sep` in UTC — the day rule between chain blocks (fixed three-letter
 *  months: en-GB's Intl writes "Sept", which breaks the rhythm of the rule). */
export function dayLabel(key: string, withWeekday = true): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withWeekday ? `${WEEKDAYS[d.getUTCDay()]} ${date}` : date;
}

/** Events per UTC day over the last `days` days ending at the newest event's day, oldest first. */
export function dailyActivity(events: readonly AuditEvent[], days = 28): { day: string; count: number }[] {
  if (events.length === 0) return [];
  const newest = events.reduce((m, e) => (e.created_at > m ? e.created_at : m), events[0].created_at);
  const end = Date.parse(`${dayKey(newest)}T00:00:00Z`);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(dayKey(e.created_at), (counts.get(dayKey(e.created_at)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
}

export interface ActorMix {
  human: number;
  witness: number;
  system: number;
  /** People by name, most actions first. */
  people: { name: string; count: number }[];
}

export function actorMix(events: readonly AuditEvent[]): ActorMix {
  const mix: ActorMix = { human: 0, witness: 0, system: 0, people: [] };
  const people = new Map<string, number>();
  for (const e of events) {
    const a = actorView(e);
    mix[a.kind] += 1;
    if (a.kind === "human") people.set(a.name, (people.get(a.name) ?? 0) + 1);
  }
  mix.people = [...people.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return mix;
}

export function familyCounts(events: readonly AuditEvent[]): Record<Family, number> {
  const counts = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
  for (const e of events) counts[familyOf(e.event_type)] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// The tamper demo: one plausible insider edit to one event's payload.
// ---------------------------------------------------------------------------

export interface TamperEdit {
  /** Dotted path of the edited field, e.g. `payload.severity_band`. */
  field: string;
  from: string;
  to: string;
  /** The edited event (a structural copy; the original is untouched). */
  event: AuditEvent;
}

function clonePayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? { ...(payload as Record<string, unknown>) } : {};
}

/** The edit an insider would want: downgrade a severity, flip a gate, bury a proof. */
export function tamperEdit(e: AuditEvent): TamperEdit {
  const payload = clonePayload(e.payload);
  const band = str(payload, "severity_band");
  if (band) {
    const to = band === "low" ? "info" : "low";
    payload.severity_band = to;
    return { field: "payload.severity_band", from: band, to, event: { ...e, payload } };
  }
  const conclusion = str(payload, "conclusion");
  if (conclusion) {
    const to = conclusion === "failure" ? "success" : "failure";
    payload.conclusion = to;
    return { field: "payload.conclusion", from: conclusion, to, event: { ...e, payload } };
  }
  const proof = str(payload, "proof_status");
  if (proof) {
    const to = proof === "proven" ? "disproven" : "proven";
    payload.proof_status = to;
    return { field: "payload.proof_status", from: proof, to, event: { ...e, payload } };
  }
  const actor = e.actor_id ?? "";
  const to = actor === "someone-else" ? "nobody" : "someone-else";
  return { field: "actor_id", from: actor || "null", to, event: { ...e, actor_id: to } };
}
