// OWNER: d2 (wave 3). Pure formatting + derivation for /findings — no React, no
// DOM, so every rule here is unit-testable without mounting a component
// (mirrors src/components/badges/format.ts and ChainRail/format.ts's split of
// logic from markup).
import type { SeverityInputName } from "@/components/evidence/ContributionBar";
import type { Finding, RepositoryRef } from "@/lib/api-types";
import type { ProofStatus, SeverityBand } from "@/lib/contracts";
import type { FindingFilterPatch, FindingUrlFilters } from "./types";

// ---------------------------------------------------------------------------
// location — "path/to/file.py:41", middle-truncated (dashboard §2.6, §5.5):
// "the filename and line matter, the middle does not".
// ---------------------------------------------------------------------------

/** `file_path:start_line` (or bare `file_path` with no line), never invented. */
export function locationText(filePath: string, startLine: number | null | undefined): string {
  return startLine != null ? `${filePath}:${startLine}` : filePath;
}

/**
 * Middle-truncates a location string to `maxChars`, keeping the filename+line
 * (the end) whole whenever it fits, and only eating into the directory prefix.
 * Falls back to a plain middle-ellipsis when even the filename+line overflows
 * the budget on its own.
 */
export function middleTruncateLocation(filePath: string, startLine: number | null | undefined, maxChars = 34): string {
  const full = locationText(filePath, startLine);
  if (full.length <= maxChars) return full;
  const segments = filePath.split("/");
  const fileName = segments[segments.length - 1] ?? filePath;
  const tail = startLine != null ? `${fileName}:${startLine}` : fileName;
  const ellipsis = "…";
  if (tail.length >= maxChars - 1) {
    const keep = Math.max(1, Math.floor((maxChars - 1) / 2));
    return `${full.slice(0, keep)}${ellipsis}${full.slice(full.length - keep)}`;
  }
  const headBudget = Math.max(0, maxChars - tail.length - ellipsis.length);
  const head = filePath.slice(0, headBudget);
  return `${head}${ellipsis}${tail}`;
}

// ---------------------------------------------------------------------------
// fingerprint — first 8 hex chars (dashboard §2.6 column spec).
// ---------------------------------------------------------------------------

export const NO_VALUE = "—"; // em dash, matches badges/format.ts's NO_SCORE convention

export function shortFingerprint(fingerprint: string | null | undefined): string {
  if (!fingerprint) return NO_VALUE;
  return fingerprint.length <= 8 ? fingerprint : fingerprint.slice(0, 8);
}

// ---------------------------------------------------------------------------
// age — relative time, compact mono ("2h", "5d"), never a spinner-adjacent
// count-up. Falls back to an absolute date past a year so the column never
// prints something misleadingly precise for old fixture data.
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function relativeAge(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return NO_VALUE;
  const deltaMs = now - then;
  if (deltaMs < 0) return "now";
  if (deltaMs < MINUTE) return "now";
  if (deltaMs < HOUR) return `${Math.floor(deltaMs / MINUTE)}m`;
  if (deltaMs < DAY) return `${Math.floor(deltaMs / HOUR)}h`;
  if (deltaMs < MONTH) return `${Math.floor(deltaMs / DAY)}d`;
  if (deltaMs < YEAR) return `${Math.floor(deltaMs / MONTH)}mo`;
  return `${Math.floor(deltaMs / YEAR)}y`;
}

// ---------------------------------------------------------------------------
// repository#PR — Finding carries only review_id (web/src/api/types.gen.ts);
// the repository and PR number live on the review, so the table joins against
// GET /v1/reviews (useReviewList, plan A11) once and looks each row up by id.
// ---------------------------------------------------------------------------

export function repoPrLabel(repository: RepositoryRef, prNumber: number): string {
  return `${repository.owner}/${repository.name}#${prNumber}`;
}

export interface RepoLookupEntry {
  label: string;
  repository: string; // "owner/name", for the repository filter chip's href
}

export function buildRepoLookup(items: readonly { review_id: string; repository: RepositoryRef; pull_request: { number: number } }[]): Map<string, RepoLookupEntry> {
  const map = new Map<string, RepoLookupEntry>();
  for (const item of items) {
    map.set(item.review_id, {
      label: repoPrLabel(item.repository, item.pull_request.number),
      repository: `${item.repository.owner}/${item.repository.name}`,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Filters — the URL is the source of truth (src/lib/hooks/url-state.ts,
// owner t2a). This file only describes the ACTIVE set for the chip row and
// the filter-aware empty state; it never changes the URL itself.
// ---------------------------------------------------------------------------

export interface ActiveFilterChip {
  key: keyof FindingUrlFilters;
  /** Printed on the chip and folded into the empty-state sentence. */
  text: string;
  /** The patch that clears exactly this filter, passed straight to setFilters. */
  clear: FindingFilterPatch;
}

const BAND_LABEL: Record<SeverityBand, string> = { info: "info", low: "low", medium: "medium", high: "high", critical: "critical" };

function proofLabel(statuses: readonly ProofStatus[]): string {
  return statuses.map((s) => s.replaceAll("_", " ")).join(", ");
}

/** Every non-empty filter in `filters`, in a fixed, stable order — never the object's own key order. */
export function activeFilterChips(filters: FindingUrlFilters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.severity_min) {
    chips.push({ key: "severity_min", text: `severity ≥ ${BAND_LABEL[filters.severity_min]}`, clear: { severity_min: null } });
  }
  if (filters.proof_status.length > 0) {
    chips.push({ key: "proof_status", text: `proof: ${proofLabel(filters.proof_status)}`, clear: { proof_status: null } });
  }
  if (filters.blocking !== null && filters.blocking !== undefined) {
    chips.push({ key: "blocking", text: filters.blocking ? "blocking only" : "non-blocking only", clear: { blocking: null } });
  }
  if (filters.status) {
    chips.push({ key: "status", text: `status: ${filters.status.replaceAll("_", " ")}`, clear: { status: null } });
  }
  if (filters.repository) {
    chips.push({ key: "repository", text: `repo: ${filters.repository}`, clear: { repository: null } });
  }
  if (filters.pr_number !== null && filters.pr_number !== undefined) {
    chips.push({ key: "pr_number", text: `PR #${filters.pr_number}`, clear: { pr_number: null } });
  }
  if (filters.review_id) {
    chips.push({ key: "review_id", text: `run: ${filters.review_id.slice(0, 8)}`, clear: { review_id: null } });
  }
  if (filters.fingerprint) {
    chips.push({ key: "fingerprint", text: `fingerprint: ${shortFingerprint(filters.fingerprint)}`, clear: { fingerprint: null } });
  }
  return chips;
}

export function hasActiveFilters(filters: FindingUrlFilters): boolean {
  return activeFilterChips(filters).length > 0;
}

/** "No findings match severity ≥ high + proof: proven + blocking only." — dashboard §2.0's empty grammar: name the filter, never "No data available". */
export function emptyStateMessage(filters: FindingUrlFilters): string {
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return "No findings in this corpus.";
  return `No findings match ${chips.map((c) => c.text).join(" + ")}.`;
}

// ---------------------------------------------------------------------------
// provenance — the endpoint line every panel carries (dashboard bullet 3).
// ---------------------------------------------------------------------------

/** `GET /v1/findings?severity_min=high&proof_status=proven` — filters only, no cursor/limit (those are pagination, not the view's identity). */
export function findingsProvenanceSource(filters: FindingUrlFilters): string {
  const params = new URLSearchParams();
  if (filters.review_id) params.set("review_id", filters.review_id);
  if (filters.repository) params.set("repository", filters.repository);
  if (filters.pr_number != null) params.set("pr_number", String(filters.pr_number));
  if (filters.fingerprint) params.set("fingerprint", filters.fingerprint);
  if (filters.status) params.set("status", filters.status);
  if (filters.severity_min) params.set("severity_min", filters.severity_min);
  if (filters.blocking !== null && filters.blocking !== undefined) params.set("blocking", String(filters.blocking));
  for (const s of filters.proof_status ?? []) params.append("proof_status", s);
  const qs = params.toString();
  return qs ? `GET /v1/findings?${qs}` : "GET /v1/findings";
}

/**
 * FindingSeverity.weights (web/src/api/types.gen.ts) is `{ [key: string]: number }` —
 * a plain JSON object, not typed against SEVERITY_INPUTS — because the OpenAPI
 * schema doesn't pin its keys. It always carries exactly the six (severity.compute's
 * own contract), so this is a type-level acknowledgement of that, not a runtime check.
 */
export function toSeverityWeights(weights: Record<string, number>): Record<SeverityInputName, number> {
  return weights as Record<SeverityInputName, number>;
}

/** Score, 3 decimals — reuses the same rule as everywhere else (badges/format.ts), duplicated here only as a type-narrowing convenience for a possibly-absent FindingSeverity. */
export function findingScoreText(finding: Pick<Finding, "severity">): string {
  const score = finding.severity?.score;
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(3) : NO_VALUE;
}
