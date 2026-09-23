// OWNER: t1c (wave 1). The encodings behind every semantic chip, as plain data.
//
// Deliberately NOT a "use client" module: a server component can import these maps and read
// them (a label, a class list) — an object exported from a client module would reach the
// server as an opaque client reference. The components that render them live next door.
//
// Colours are the semantic tokens T0 defined in app/tokens/core.css (--proof-*, --gate-*,
// --status-*, --stage-*), used through their Tailwind utilities, so a retune there retunes
// every chip. tests/unit/badges resolves these class names back through core.css.
import type { ReactNode } from "react";
import { LedgerGlyph, type GateGlyphState, type Rung } from "@/components/icons/chip-glyphs";
import { ProofMark } from "@/components/icons/marks";
import type { DeliveryMode, FindingStatus, ProofStatus, SeverityBand, StageState } from "@/lib/contracts";

/* ------------------------------------------------------------------------------------
   The chip base — docs/design/02-design-system.md §5.4
   ------------------------------------------------------------------------------------ */

/**
 * 20px tall (never less), 2px radius, 6px padding-x, a 1px border on every state
 * (transparent where the state has none, so a flip never shifts layout), 11px Google Sans
 * Code 600 UPPERCASE +0.08em, 12px leading glyph, 4px gap. `transition-none`: THE 0ms RULE.
 */
export const CHIP_BASE =
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-data border px-1.5 type-badge transition-none";

/** Pulls the label's trailing +0.08em letter-space back in, so it sits optically centred. */
export const CHIP_LABEL = "-me-[0.08em]";

/** The class track t3 animates (180ms `scale(1.045) → 1`). A no-op until t3 lands. */
export const STAMP_CLASS = "stamp";

/* ------------------------------------------------------------------------------------
   Proof — §1.7
   ------------------------------------------------------------------------------------ */

const QUIET = "bg-proof-not-attempted-bg text-proof-not-attempted-fg border-proof-not-attempted-border";

export const PROOF_CHIP: Record<ProofStatus, { label: string; className: string; strike?: true; caption?: string }> = {
  proven: { label: "PROVEN", className: "bg-proof-proven-bg text-proof-proven-fg border-proof-proven-border" },
  disproven: {
    label: "DISPROVEN",
    className: "bg-proof-disproven-bg text-proof-disproven-fg border-proof-disproven-border",
    strike: true,
    caption: "refuted by execution",
  },
  inconclusive: {
    label: "INCONCLUSIVE",
    className: "bg-proof-inconclusive-bg text-proof-inconclusive-fg border-dashed border-proof-inconclusive-border",
  },
  not_attempted: { label: "NOT ATTEMPTED", className: QUIET },
  not_applicable: { label: "NOT APPLICABLE", className: QUIET },
  skipped_no_env: { label: "SKIPPED · NO ENV", className: QUIET },
};

/* ------------------------------------------------------------------------------------
   Severity — §1.6 (colour is the third cue)
   ------------------------------------------------------------------------------------ */

export const SEVERITY_FILL: Record<SeverityBand, string> = {
  info: "bg-sev-info",
  low: "bg-sev-low",
  medium: "bg-sev-medium",
  high: "bg-sev-high",
  critical: "bg-sev-critical",
};

/* ------------------------------------------------------------------------------------
   Gate — §1.8 + brand-gaps §2 ruling 2
   ------------------------------------------------------------------------------------ */

export type GateSpec = { label: string; chip: string; block: string; glyph: string };

export const GATE: Record<GateGlyphState, GateSpec> = {
  failure: {
    label: "BLOCKED",
    chip: "bg-gate-failure-bg text-gate-failure-fg border-gate-failure-border",
    block: "bg-gate-failure-bg text-gate-failure-fg border-gate-failure-border",
    glyph: "text-alarm",
  },
  neutral: {
    label: "NEUTRAL",
    chip: "bg-gate-neutral-bg text-gate-neutral-fg border-gate-neutral-border",
    block: "bg-gate-neutral-bg text-gate-neutral-fg border-gate-neutral-border",
    glyph: "",
  },
  success: {
    label: "CLEAR",
    chip: "bg-gate-success-bg text-gate-success-fg border-transparent border-b-gate-success-border",
    block: "bg-gate-success-bg text-gate-success-fg border-transparent border-b-gate-success-border",
    glyph: "",
  },
  running: {
    label: "RUNNING",
    chip: "bg-gate-neutral-bg text-gate-neutral-fg border-gate-neutral-border",
    block: "bg-gate-neutral-bg text-gate-neutral-fg border-gate-neutral-border",
    glyph: "",
  },
};

/** Where the gate decision was delivered (GateInfo.delivery). */
export type GateDelivery = "check_run" | "commit_status" | "dry_run";

/** `n blocking finding(s) · check_run` — a count and a rung, no adjectives (brand-gaps §D). */
export function gateDetail(state: GateGlyphState, blocking?: number, delivery?: GateDelivery | null, reason?: string): string | null {
  const rung = delivery ? ` · ${delivery}` : "";
  if (state === "failure" || state === "success") {
    if (blocking === undefined) return delivery ?? null;
    return `${blocking} blocking finding${blocking === 1 ? "" : "s"}${rung}`;
  }
  if (state === "neutral") return reason ? `${reason}${rung}` : (delivery ?? null);
  return null;
}

/* ------------------------------------------------------------------------------------
   Finding status — §1.9 (border STYLE is the encoding)
   ------------------------------------------------------------------------------------ */

export type StatusSpec = { label: string; className: string; glyph?: ReactNode; strike?: true };

export const FINDING_STATUS: Record<FindingStatus, StatusSpec> = {
  proposed: { label: "PROPOSED", className: "text-status-proposed-fg border-dotted border-status-proposed-border" },
  published: { label: "PUBLISHED", className: "text-status-published-fg border-transparent border-l-2 border-l-status-published-rail" },
  suppressed: {
    label: "SUPPRESSED",
    className: "text-status-suppressed-fg border-[1.5px] border-dashed border-status-suppressed-border",
    glyph: <LedgerGlyph size={12} />,
  },
  dropped: { label: "DROPPED", className: "text-status-dropped-fg border-transparent", strike: true },
  // §1.9 lists four statuses; the API has a fifth. A refuted finding reads the same
  // everywhere it appears: the disproven proof chip's outline, struck vial and struck label.
  disproven: {
    label: "DISPROVEN",
    className: "bg-proof-disproven-bg text-proof-disproven-fg border-proof-disproven-border",
    glyph: <ProofMark status="disproven" size={12} />,
    strike: true,
  },
};

/* ------------------------------------------------------------------------------------
   Stage — §1.11 (five shapes, not five colours)
   ------------------------------------------------------------------------------------ */

export const STAGE_DOT_SIZES = [8, 10, 12] as const;
export type StageDotSize = (typeof STAGE_DOT_SIZES)[number];

export const STAGE_DOT_COLOR: Record<StageState, string> = {
  pending: "text-stage-pending-node",
  running: "text-stage-running-node",
  done: "text-stage-done-node",
  degraded: "text-stage-degraded-node",
  failed: "text-stage-failed-node",
};

export const STAGE_DOT_SHAPE: Record<StageState, "ring" | "ring-dot" | "disc" | "triangle" | "square"> = {
  pending: "ring",
  running: "ring-dot",
  done: "disc",
  degraded: "triangle",
  failed: "square",
};

/* ------------------------------------------------------------------------------------
   Delivery mode — spec §4.7 comment ladder; §1.5 marker = "S8 ladder fallback"
   ------------------------------------------------------------------------------------ */

const FALLBACK = "bg-transparent text-marker-text border-marker";

export const DELIVERY_MODE: Record<DeliveryMode, { rung: Rung | null; className: string }> = {
  inline_exact: { rung: 0, className: "bg-transparent text-text-body border-rule-2" },
  inline_nearest: { rung: 1, className: FALLBACK },
  file_level: { rung: 2, className: FALLBACK },
  summary_only: { rung: 3, className: FALLBACK },
  not_delivered: { rung: null, className: "bg-transparent text-text-disabled border-dotted border-rule-2" },
};
