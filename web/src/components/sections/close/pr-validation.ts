// OWNER: m6 (wave 3). Section 09 — the run surface (plan A5, landing blueprint §11).
//
// Client-side shape check for the "Run one" input, so a garbage value never
// reaches `POST /v1/reviews`. The two patterns are copied verbatim from
// `src/lib/fixture-resolver.ts` (itself a verbatim copy of the backend's
// `routes_reviews.py` `_PR_URL` / `_PR_SHORTHAND`), so a value this module
// accepts is guaranteed to be a value the fixture resolver — and the real
// backend — accepts too. `INVALID_PR_URL_MESSAGE` is the backend's own wording
// (`api/errors.py` DEFAULT_MESSAGES, mirrored in fixture-resolver.ts's
// `MESSAGES.INVALID_PR_URL`, not exported from there) so the client shows the
// identical string the server would have returned for the same input.
export const PR_URL_PATTERN = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pulls?\/(\d+)(?:[/?#].*)?$/i;
export const PR_SHORTHAND_PATTERN = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;

export const INVALID_PR_URL_MESSAGE = "Could not parse a GitHub pull request from the supplied URL.";
export const EMPTY_PR_URL_MESSAGE = "Paste a pull request URL or owner/repo#42.";

/** True when `candidate` (untrimmed) matches either shape the backend accepts as `pr_url`. */
export function isValidPrReference(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  return PR_URL_PATTERN.test(trimmed) || PR_SHORTHAND_PATTERN.test(trimmed);
}

/**
 * The trimmed value to send as `pr_url`, or a validation message when the
 * shape is wrong — the same two-state result the input's <Field error> wants.
 */
export function validatePrReference(candidate: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = candidate.trim();
  if (!trimmed) return { ok: false, message: EMPTY_PR_URL_MESSAGE };
  if (!PR_URL_PATTERN.test(trimmed) && !PR_SHORTHAND_PATTERN.test(trimmed)) return { ok: false, message: INVALID_PR_URL_MESSAGE };
  return { ok: true, value: trimmed };
}
