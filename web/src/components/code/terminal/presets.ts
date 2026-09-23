// OWNER: t1d (wave 1). Ready-made highlight rules. TerminalBlock applies none by default:
// the caller (the Proof Bench) passes these, or its own, explicitly.
import type { TerminalHighlightRule } from "./model";

/**
 * pytest output, as the Proof Bench reads it (design §5.7, landing §01, brand-gaps §2 ruling 2):
 *   - the `E ` traceback line, whole line, in --alarm-text          mark "error"
 *   - `FAILED …` / `ERROR …` short-summary lines, in --alarm-text
 *   - the word `failed`, in --alarm-text                            mark "failed"
 *   - the word `passed`, in --signal-text (pytest's own green is overridden) mark "passed"
 *   - the run summary line (`1 failed in 0.39s`) is marked "summary" for the bench's
 *     1px --alarm underline, and set in --text-body so pytest's colouring of the whole
 *     line (green or red) never survives around the two words that carry the verdict.
 * Order matters: earlier rules win overlapping text; the first line-scope tone wins.
 */
export const PYTEST_TONES: readonly TerminalHighlightRule[] = Object.freeze([
  { pattern: /^E(?:\s|$)/, tone: "alarm", scope: "line", mark: "error" },
  { pattern: /^(?:FAILED|ERROR)\b/, tone: "alarm", scope: "line" },
  {
    pattern: /^=*\s*\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed|deselected|warnings?)\b.*\bin \d+(?:\.\d+)?s\b/,
    tone: "body",
    scope: "line",
    mark: "summary",
  },
  { pattern: /\bfailed\b/, tone: "alarm", mark: "failed" },
  { pattern: /\bpassed\b/, tone: "signal", mark: "passed" },
]);
