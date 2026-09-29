// Pure derivations for /findings — no React, no DOM, so every rule is unit-testable
// (tests/unit/routes/findings-list/format.test.ts).
import { humanize } from "@/components/dash/format";
import { PROOF_LABEL, type ProofKey } from "@/components/dash/kit";
import type { Finding, RepositoryRef } from "@/lib/api-types";
import type { SeverityBand } from "@/lib/contracts";
import type { FindingsSort, FindingsView, FindingsViewPatch, StatusView } from "./types";

export const NO_VALUE = "—";

// ---------------------------------------------------------------------------
// Location — "path/to/file.py:41", middle-truncated: the filename and line
// matter, the middle does not.
// ---------------------------------------------------------------------------

/** `file_path:start_line` (or the bare path with no line), never invented. */
export function locationText(filePath: string, startLine: number | null | undefined): string {
  return startLine != null ? `${filePath}:${startLine}` : filePath;
}

/** Keeps the filename:line whole whenever it fits and eats only the directory prefix. */
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
  return `${filePath.slice(0, headBudget)}${ellipsis}${tail}`;
}

export function shortFingerprint(fingerprint: string | null | undefined): string {
  if (!fingerprint) return NO_VALUE;
  return fingerprint.length <= 8 ? fingerprint : fingerprint.slice(0, 8);
}

/** A trailing-ellipsis cut for values printed as prose (a chip, an empty-state sentence). */
export function ellipsisTruncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`;
}

// ---------------------------------------------------------------------------
// The review join. A Finding carries only review_id; the repository, the PR
// and its title live on the review (GET /v1/reviews), joined once.
// ---------------------------------------------------------------------------

export function repoPrLabel(repository: RepositoryRef, prNumber: number): string {
  return `${repository.owner}/${repository.name}#${prNumber}`;
}

export interface RepoLookupEntry {
  /** `owner/name#42` */
  label: string;
  /** `owner/name`, the repository filter's value. */
  repository: string;
  /** The repository's short name, `checkout-service`. */
  name: string;
  prNumber: number;
  prTitle: string | null;
}

export function buildRepoLookup(
  items: readonly { review_id: string; repository: RepositoryRef; pull_request: { number: number; title?: string | null } }[],
): Map<string, RepoLookupEntry> {
  const map = new Map<string, RepoLookupEntry>();
  for (const item of items) {
    map.set(item.review_id, {
      label: repoPrLabel(item.repository, item.pull_request.number),
      repository: `${item.repository.owner}/${item.repository.name}`,
      name: item.repository.name,
      prNumber: item.pull_request.number,
      prTitle: item.pull_request.title ?? null,
    });
  }
  return map;
}

/** The distinct repositories in the lookup, alphabetical — the Repository filter's options. */
export function repositoriesOf(lookup: Map<string, RepoLookupEntry>): string[] {
  return [...new Set([...lookup.values()].map((e) => e.repository))].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Proof labels are the kit's, so a menu, a chip and a legend all say the same word. */
export { PROOF_LABEL };

export const SEVERITY_FLOOR_LABEL: Record<SeverityBand, string> = {
  critical: "Critical only",
  high: "High and above",
  medium: "Medium and above",
  low: "Low and above",
  info: "Info and above",
};

export const STATUS_LABEL: Record<StatusView, string> = {
  published: "Published",
  disproven: "Refuted",
  suppressed: "Suppressed",
  dropped: "Dropped",
  proposed: "Proposed",
  all: "All",
};

export const SORT_LABEL: Record<FindingsSort, string> = {
  newest: "Newest first",
  severity: "Most severe",
  recurring: "Most recurring",
  oldest: "Oldest first",
};

// ---------------------------------------------------------------------------
// Active filters — named once, used by the chips row and the empty state.
// ---------------------------------------------------------------------------

export interface ActiveFilterChip {
  key: keyof FindingsView;
  text: string;
  /** The patch that clears exactly this filter. */
  clear: FindingsViewPatch;
  /** `pill`: the filter bar already shows it on a control. `chip`: only a removable chip does (deep-link identity filters). */
  shownOn: "pill" | "chip";
}

/** Every active filter or lens except status, sort and group, in a fixed order. */
export function activeFilterChips(view: FindingsView): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const q = view.q?.trim();
  if (q) chips.push({ key: "q", text: `“${ellipsisTruncate(q, 24)}”`, clear: { q: null }, shownOn: "pill" });
  if (view.severity_min) chips.push({ key: "severity_min", text: `severity ≥ ${view.severity_min}`, clear: { severity_min: null }, shownOn: "pill" });
  if (view.proof_status.length > 0) {
    chips.push({
      key: "proof_status",
      text: `proof: ${view.proof_status.map((s) => PROOF_LABEL[s].toLowerCase()).join(", ")}`,
      clear: { proof_status: null },
      shownOn: "pill",
    });
  }
  if (view.blocking !== null) {
    chips.push({ key: "blocking", text: view.blocking ? "blocking only" : "non-blocking only", clear: { blocking: null }, shownOn: view.blocking ? "pill" : "chip" });
  }
  if (view.specialist) chips.push({ key: "specialist", text: `specialist: ${humanize(view.specialist).toLowerCase()}`, clear: { specialist: null }, shownOn: "pill" });
  if (view.repository) chips.push({ key: "repository", text: `repo: ${view.repository}`, clear: { repository: null }, shownOn: "pill" });
  if (view.pr_number !== null) chips.push({ key: "pr_number", text: `PR #${view.pr_number}`, clear: { pr_number: null }, shownOn: "chip" });
  if (view.review_id) chips.push({ key: "review_id", text: `run ${ellipsisTruncate(view.review_id, 8)}`, clear: { review_id: null }, shownOn: "chip" });
  if (view.fingerprint) chips.push({ key: "fingerprint", text: `fingerprint ${ellipsisTruncate(view.fingerprint, 8)}`, clear: { fingerprint: null }, shownOn: "chip" });
  return chips;
}

/** The patch that clears every filter and lens but keeps the status segment. */
export function clearFiltersPatch(): FindingsViewPatch {
  return { severity_min: null, proof_status: null, blocking: null, repository: null, pr_number: null, review_id: null, fingerprint: null, q: null, specialist: null };
}

/** "Nothing matches severity ≥ high + proof: proven." — names the filter, never "No data available". */
export function emptyStateMessage(view: FindingsView): string {
  const chips = activeFilterChips(view);
  if (chips.length === 0) {
    return view.status === "all" ? "Witness has not raised a finding yet." : `No ${STATUS_LABEL[view.status].toLowerCase()} findings yet.`;
  }
  const clause = chips.map((c) => c.text).join(" + ");
  return clause.endsWith("…") ? `Nothing matches ${clause}` : `Nothing matches ${clause}.`;
}

// ---------------------------------------------------------------------------
// The page headline: the live count, in the landing's two-tone voice.
// ---------------------------------------------------------------------------

/**
 * Two sentences, each ending in a period (the product's H1 convention). The
 * second is scoped to the first ("25 of them"), so a count of proven findings
 * among what is on screen never reads as a rival to the product-wide total.
 */
export function headline(status: StatusView, count: number, proven: number | undefined, filtered = false): { title: string; soft: string | null } {
  const n = count.toLocaleString("en-US");
  const findings = count === 1 ? "finding" : "findings";
  const ofThem = proven === undefined || count === 0 ? null : proven === 0 ? "None of them proven yet." : proven === count && count > 1 ? "All of them proven." : `${proven.toLocaleString("en-US")} of ${count === 1 ? "it" : "them"} proven.`;
  if (filtered) {
    const word = status === "all" ? "" : `${STATUS_LABEL[status].toLowerCase()} `;
    return count === 0 ? { title: `No ${word}findings match.`, soft: null } : { title: `${n} ${word}${findings} ${count === 1 ? "matches" : "match"}.`, soft: ofThem };
  }
  switch (status) {
    case "published":
      return { title: `${n} ${findings} on your PRs.`, soft: ofThem };
    case "disproven":
      return { title: `${n} ${count === 1 ? "claim" : "claims"} Witness refuted.`, soft: "Each one by running its own repro test." };
    case "suppressed":
      return { title: `${n} suppressed ${findings}.`, soft: "Each one on the audited ledger." };
    case "dropped":
      return { title: `${n} ${findings} dropped.`, soft: "Noise the coordinator kept off your PRs." };
    case "proposed":
      return { title: `${n} ${findings} still proposed.`, soft: "Waiting on the coordinator." };
    default:
      return { title: `${n} ${findings} raised.`, soft: ofThem };
  }
}

/** Why a view holds nothing that blocks, when the status itself rules it out. */
export function noBlockingReason(status: StatusView): string | null {
  switch (status) {
    case "dropped":
      return "Dropped findings never reach the gate.";
    case "suppressed":
      return "A suppression takes a finding off the gate.";
    case "disproven":
      return "A refuted claim can never block.";
    case "proposed":
      return "Nothing reaches the gate until it is published.";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Lenses: search, specialist, sort, group — applied over loaded rows.
// ---------------------------------------------------------------------------

/** Case-insensitive match over the title, file path, symbol, rule and fingerprint prefix. */
export function matchesSearch(finding: Finding, query: string | null | undefined): boolean {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  const haystack = [finding.title, finding.location.file_path, finding.location.symbol_path ?? "", finding.rule_key, finding.fingerprint?.slice(0, 12) ?? ""]
    .join("\n")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/** Search and specialist: the lenses that narrow the set (order untouched). */
export function narrow(rows: readonly Finding[], view: Pick<FindingsView, "q" | "specialist">): Finding[] {
  return rows.filter((f) => matchesSearch(f, view.q) && (view.specialist === null || f.specialist === view.specialist));
}

export function applyLenses(rows: readonly Finding[], view: Pick<FindingsView, "q" | "specialist" | "sort">): Finding[] {
  return sortFindings(narrow(rows, view), view.sort);
}

const score = (f: Finding) => f.severity?.score ?? -1;

/** `newest` keeps the API's own order (created_at DESC, id DESC); the others are stable re-sorts. */
export function sortFindings(rows: readonly Finding[], sort: FindingsSort): Finding[] {
  const indexed = rows.map((f, i) => ({ f, i }));
  switch (sort) {
    case "severity":
      indexed.sort((a, b) => Number(Boolean(b.f.blocking)) - Number(Boolean(a.f.blocking)) || score(b.f) - score(a.f) || a.i - b.i);
      break;
    case "recurring":
      indexed.sort((a, b) => (b.f.history?.occurrence_count ?? 1) - (a.f.history?.occurrence_count ?? 1) || score(b.f) - score(a.f) || a.i - b.i);
      break;
    case "oldest":
      indexed.reverse();
      break;
    default:
      break;
  }
  return indexed.map((x) => x.f);
}

export interface FindingGroup {
  key: string;
  /** Main label: `checkout-service #4821` or the file path. */
  label: string;
  /** Secondary: the PR title, or the repository for a file. */
  detail: string | null;
  kind: "pr" | "file";
  rows: Finding[];
}

/** Groups in first-appearance order (so the sort decides which group leads). */
export function groupFindings(rows: readonly Finding[], by: "pr" | "file", lookup: Map<string, RepoLookupEntry>): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const f of rows) {
    const entry = lookup.get(f.review_id);
    const key = by === "pr" ? (entry?.label ?? `run:${f.review_id}`) : `${entry?.repository ?? ""}:${f.location.file_path}`;
    let group = groups.get(key);
    if (!group) {
      group =
        by === "pr"
          ? { key, kind: "pr", label: entry ? `${entry.name} #${entry.prNumber}` : `Run ${f.review_id.slice(0, 8)}`, detail: entry?.prTitle ?? null, rows: [] }
          : { key, kind: "file", label: f.location.file_path, detail: entry?.name ?? null, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(f);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Summary — the composition of a set of findings. Computed from rows when the
// browser holds all of them; otherwise the route asks the API for each count.
// ---------------------------------------------------------------------------

export interface FindingsSummary {
  total: number;
  bands: Record<SeverityBand, number>;
  /** No severity at all (the coordinator dropped it before scoring). */
  unscored: number;
  /** The six proof outcomes, keyed like the kit's PROOF_ENCODING. No proof at all counts as not attempted. */
  proof: Record<ProofKey, number>;
  blocking: number;
}

export function emptyBands(): Record<SeverityBand, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function emptyProof(): Record<ProofKey, number> {
  return { proven: 0, disproven: 0, inconclusive: 0, skipped_no_env: 0, not_attempted: 0, not_applicable: 0 };
}

export function summarize(rows: readonly Finding[]): FindingsSummary {
  const s: FindingsSummary = { total: rows.length, bands: emptyBands(), unscored: 0, proof: emptyProof(), blocking: 0 };
  for (const f of rows) {
    if (f.severity) s.bands[f.severity.band] += 1;
    else s.unscored += 1;
    s.proof[(f.proof?.status ?? "not_attempted") as ProofKey] += 1;
    if (f.blocking) s.blocking += 1;
  }
  return s;
}

// ---------------------------------------------------------------------------
// One row per issue. A re-run of a PR, or the next PR on the same code, raises
// the same finding again under the same fingerprint; the inbox keeps the latest
// occurrence per fingerprint per repository (the API's order is newest first,
// so the first one seen) and the row's "2 runs" chip says it came back.
// ---------------------------------------------------------------------------

export function occurrenceKey(f: Finding, lookup: Map<string, RepoLookupEntry>): string {
  if (!f.fingerprint) return `id:${f.id}`;
  const repo = lookup.get(f.review_id)?.repository ?? `run:${f.review_id}`;
  return `${repo}:${f.fingerprint}`;
}

/** Keeps the first row per fingerprint per repository, in the given order (pass the API's newest-first order). */
export function foldRepeats(rows: readonly Finding[], lookup: Map<string, RepoLookupEntry>): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of rows) {
    const key = occurrenceKey(f, lookup);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
