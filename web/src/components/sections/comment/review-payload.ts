// OWNER: m3 (wave 3). Section 04 — "What lands in your PR" (docs/design/06-brand-gaps-and-corrections.md §E).
//
// review_payload comes off the wire typed as `{ [key: string]: unknown } | null`
// (src/api/types.gen.ts — the OpenAPI document has no schema for it). This file
// gives it a local, section-owned shape and the one piece of extraction logic
// the brief asks for: finding the inline comment for the finding with
// `proof_status: proven` inside a real ReviewResult.review_payload.
//
// Per plan §14 ownership: a wave-2/wave-1 type gap is extended locally, never
// by editing the frozen src/lib/api-types.ts.
import type { ReviewResult } from "@/lib/api-types";

/** One entry of review_payload.comments — an inline, nearest-line, or file-level PR comment. */
export interface PRGuardReviewComment {
  path: string;
  body: string;
  line?: number;
  side?: "LEFT" | "RIGHT";
  start_line?: number;
  start_side?: "LEFT" | "RIGHT";
  subject_type?: "line" | "file";
}

/** The exact body PRGuard posts to `POST /repos/{owner}/{repo}/pulls/{n}/reviews` (brand-gaps §E). */
export interface PRGuardReviewPayload {
  event: string;
  body: string;
  commit_id: string;
  comments: PRGuardReviewComment[];
}

export class ReviewPayloadShapeError extends Error {
  constructor(detail: string) {
    super(`ReviewResult.review_payload does not match the expected PRGuard review body: ${detail}`);
    this.name = "ReviewPayloadShapeError";
  }
}

function isComment(value: unknown): value is PRGuardReviewComment {
  return typeof value === "object" && value !== null && typeof (value as { path?: unknown }).path === "string" && typeof (value as { body?: unknown }).body === "string";
}

/**
 * Narrows `ReviewResult["review_payload"]` to the shape this section renders.
 * Throws rather than returning null: a malformed or missing payload on the
 * demo run is a corpus defect, not a state this section degrades for (the
 * corpus is real — plan A14/t2b — so this should never fire outside a broken
 * fixture rebuild).
 */
export function asReviewPayload(value: ReviewResult["review_payload"]): PRGuardReviewPayload {
  if (typeof value !== "object" || value === null) throw new ReviewPayloadShapeError("not an object");
  const record = value as Record<string, unknown>;
  if (typeof record.event !== "string") throw new ReviewPayloadShapeError('"event" is not a string');
  if (typeof record.body !== "string") throw new ReviewPayloadShapeError('"body" is not a string');
  if (typeof record.commit_id !== "string") throw new ReviewPayloadShapeError('"commit_id" is not a string');
  if (!Array.isArray(record.comments) || !record.comments.every(isComment)) throw new ReviewPayloadShapeError('"comments" is not an array of {path, body}');
  return { event: record.event, body: record.body, commit_id: record.commit_id, comments: record.comments };
}

/** The one comment whose body carries `proof_status: proven` — the section's inline example (brand-gaps §E). */
export function findProvenComment(payload: PRGuardReviewPayload): PRGuardReviewComment {
  const comment = payload.comments.find((c) => c.body.includes("proof_status: proven"));
  if (!comment) throw new ReviewPayloadShapeError("no comment carries proof_status: proven");
  return comment;
}

/** GitHub's own "L41-L44" / "L44" anchor grammar for a review comment's location. */
export function commentAnchor(comment: PRGuardReviewComment): string {
  if (comment.subject_type === "file" || comment.line === undefined) return comment.path;
  const hasRange = comment.start_line !== undefined && comment.start_line !== comment.line;
  return hasRange ? `${comment.path} · L${comment.start_line}-L${comment.line}` : `${comment.path} · L${comment.line}`;
}

/** GitHub's UI renders the API's `event` enum in title case ("COMMENT" → "Comment"), never re-typed. */
export function titleCaseEvent(event: string): string {
  return event.length === 0 ? event : event.charAt(0) + event.slice(1).toLowerCase();
}
