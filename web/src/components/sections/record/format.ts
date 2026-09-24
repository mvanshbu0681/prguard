// OWNER: m5 (wave 3). Pure formatting for section 07 — no React, no DOM (mirrors
// src/components/evidence/ChainRail/format.ts's split of logic from markup).

/** `41–44` — a finding's location.start_line…end_line, the same axis the fingerprint
 *  demo argues is NOT part of identity. */
export function formatLineRange(startLine: number, endLine: number): string {
  return startLine === endLine ? String(startLine) : `${startLine}–${endLine}`;
}

/** `charge` — the trailing symbol name off a `path/to/file.py::symbol` symbol_path,
 *  for a short in-line reference; the full path still renders alongside it. */
export function symbolName(symbolPath: string): string {
  const i = symbolPath.lastIndexOf("::");
  return i === -1 ? symbolPath : symbolPath.slice(i + 2);
}

/** `2026-09-07` — a suppression's created/expiry date (brand-gaps §D: dates in prose
 *  read as a date, not a full timestamp; the audit rail keeps the full ISO instant). */
export function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return iso.slice(0, 10);
}

/** `no expiry` when a suppression carries none — never a blank cell (the real fixture
 *  row for ids.demo_suppression_id has `expires_at: null`; plan A7 forbids inventing one). */
export function formatExpiry(expiresAt: string | null | undefined): string {
  return expiresAt ? `expires ${formatIsoDate(expiresAt)}` : "no expiry";
}

/** "both occurrences" at the real count 2, "all N occurrences" at any other real count —
 *  the fingerprint caption reads `getDemoProvenFinding().history.occurrence_count`, never
 *  a hardcoded "both" (plan A7). */
export function occurrenceCountPhrase(n: number): string {
  return n === 2 ? "both occurrences" : `all ${n} occurrences`;
}

export interface OccurrenceRunContext {
  runStatus: string;
  gateConclusion: string | null;
  blocking: boolean;
}

/** One sentence of what the run did, derived from its own recorded fields rather than
 *  assumed from position in the list — so a regenerated corpus with a different story
 *  still reads correctly (plan A7: never hardcode what a fixture provides). PRGuard is
 *  the subject for system behaviour (brand-gaps §D rule 4). */
export function occurrenceCaption({ runStatus, gateConclusion, blocking }: OccurrenceRunContext): string {
  if (runStatus !== "succeeded") {
    return `The review was ${runStatus} before a verdict was recorded.`;
  }
  if (blocking) return "This review ran to completion and the finding blocked the merge.";
  if (gateConclusion === "failure") return "This review ran to completion; the gate recorded a failure.";
  return "This review ran to completion.";
}
