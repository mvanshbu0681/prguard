// OWNER: t4 (wave 2). Pure derivations for <ProofBench> — no React, no DOM, unit-testable.
//
// Every string here is built ONLY from fields FindingProof (or the caller's props) actually
// carry. Nothing is a literal fallback value that could be mistaken for data (plan hard
// rule: never hard-code a number/value a fixture or API field provides).
import type { ProofStatus } from "@/lib/contracts";
import type { FindingProof, ProofExecution } from "./props";

/** First 7 characters of a SHA, or null when the SHA is not known. */
export function sha7(sha: string | null | undefined): string | null {
  if (!sha) return null;
  return sha.slice(0, 7);
}

export type PaneTone = "signal" | "alarm";

/** exit_code 0 -> signal (passed), any other number -> alarm (failed). null/undefined: unknown. */
export function paneTone(execution: ProofExecution | null | undefined): PaneTone | null {
  const code = execution?.exit_code;
  if (code === null || code === undefined) return null;
  return code === 0 ? "signal" : "alarm";
}

/** TerminalBlock `rail` prop for a pane's tone. */
export function railTone(tone: PaneTone | null): "signal-lo" | "alarm" | "none" {
  if (tone === "signal") return "signal-lo";
  if (tone === "alarm") return "alarm";
  return "none";
}

/** TerminalBlock `background` prop for a pane's tone. */
export function paneBackground(tone: PaneTone | null): "signal-tint-lo" | "alarm-tint-lo" | "default" {
  if (tone === "signal") return "signal-tint-lo";
  if (tone === "alarm") return "alarm-tint-lo";
  return "default";
}

/** Which pane (if any) is the one to underline at t=1900ms: the pane whose repro FAILED.
 *  Head is preferred (the regression side); base only when head has no reading. */
export function failingPane(proof: Pick<FindingProof, "base" | "head">): "base" | "head" | null {
  if (paneTone(proof.head) === "alarm") return "head";
  if (paneTone(proof.base) === "alarm") return "base";
  return null;
}

/** "PASSES" / "FAILS", or null when the pane's exit code is not known. */
function passFail(execution: ProofExecution | null | undefined): "PASSES" | "FAILS" | null {
  const tone = paneTone(execution);
  if (tone === null) return null;
  return tone === "signal" ? "PASSES" : "FAILS";
}

/** `proven` -> `PROVEN`, `not_attempted` -> `NOT ATTEMPTED`. A value, printed, never an adjective. */
export function stateWord(status: ProofStatus): string {
  return status.toUpperCase().replace(/_/g, " ");
}

/**
 * Verdict rail, left half: "PASSES AT BASE · FAILS AT HEAD · PROVEN". Falls back to the
 * state alone when either exit code is unknown (no execution to describe).
 */
export function verdictLeft(proof: Pick<FindingProof, "status" | "base" | "head">): string {
  const base = passFail(proof.base);
  const head = passFail(proof.head);
  if (base === null || head === null) return stateWord(proof.status);
  return `${base} AT BASE · ${head} AT HEAD · ${stateWord(proof.status)}`;
}

export type ConsequenceTone = "alarm" | "signal" | "marker" | "dim";

export interface Consequence {
  text: string;
  tone: ConsequenceTone;
}

/** Verdict rail, right half — the consequence of the verdict (brief STRUCTURE item 5). */
export function consequence(status: ProofStatus, blocking: boolean | undefined): Consequence {
  switch (status) {
    case "proven":
      return blocking ? { text: "→ blocks merge", tone: "alarm" } : { text: "proven · not blocking", tone: "dim" };
    case "disproven":
      return { text: "refuted by execution · gate stays clear", tone: "signal" };
    case "inconclusive":
      return { text: "advisory · a human decides", tone: "marker" };
    case "not_attempted":
    case "skipped_no_env":
    case "not_applicable":
      return { text: "not executed · advisory", tone: "dim" };
    default:
      return { text: "not executed · advisory", tone: "dim" };
  }
}

/** Tailwind colour utility for a consequence tone (>=24px never needed here: the rail is 11px). */
export const CONSEQUENCE_TEXT_CLASS: Record<ConsequenceTone, string> = {
  alarm: "text-alarm-text",
  signal: "text-signal-text",
  marker: "text-marker-text",
  dim: "text-text-dim",
};

/** The Exhibit meta line: "docker · isolated". Omits a missing half; null when both are missing. */
export function runnerIsolation(proof: Pick<FindingProof, "runner" | "isolation">): string | null {
  const parts = [proof.runner, proof.isolation].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

/** Pane header text: "$ git checkout 7c41a09 && pytest -q …" then the captured excerpt. */
export function paneText(shaShort: string | null, command: string | null | undefined, execution: ProofExecution | null | undefined): string {
  const excerpt = execution?.excerpt ?? "";
  const checkout = shaShort ? `git checkout ${shaShort} && ` : "";
  const cmd = command ?? "";
  if (!checkout && !cmd) return excerpt;
  return `$ ${checkout}${cmd}\n${excerpt}`;
}

/** True once every field the bench needs to show two real terminal panes is present. */
export function hasExecution(proof: Pick<FindingProof, "base" | "head" | "command">): boolean {
  return Boolean(proof.base?.excerpt && proof.head?.excerpt && proof.command);
}

/**
 * density="detail" panes are a fixed 210px (design §01 "TERMINAL PANE A/B"). That height is
 * `.prg-terminal__pre`'s own contract (src/styles/code.css): 8px top+bottom padding
 * (`--sp-2`) around 22px lines (`--lh-terminal`, the desktop terminal line-height — the
 * narrower figure of the two breakpoints code.css defines, so this budget is the safe one
 * for the 20px/mobile line-height too). (210 - 16) / 22 = 8.8, so 8 lines are the most a
 * detail-density pane can show with none of them clipped by the viewport's own scroll.
 *
 * A real capture (public/fixtures/reviews/4e8b1d0c…: a 13-line command+excerpt) is longer
 * than that, and the tail — the assertion, the `E` line, the run summary — is what a viewer
 * must see without touching the pane (motion spec §0 rule 1: the static frame is the whole
 * claim). Rather than truncating with an ellipsis (which would cut the summary line itself
 * on a long enough capture) this keeps the last N lines: on every captured pytest excerpt
 * the failure and its summary sit at the end, so the tail is the evidence that matters.
 */
export const DETAIL_PANE_VISIBLE_LINES = 8;

/**
 * Keep only the last `maxLines` lines of `text`, unchanged when it already fits. Used to
 * pre-fit a detail-density pane's content instead of letting the viewport's own scroll hide
 * the tail on load (the pane is never programmatically scrolled: this is a static, SSR-safe
 * substitute for that).
 */
export function tailLines(text: string, maxLines: number): string {
  if (!text) return text;
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(lines.length - maxLines).join("\n");
}
