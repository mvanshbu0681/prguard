"use client";
// OWNER: t1c (wave 1). The merge gate as a chip and as the run view's gate block
// (docs/design/02-design-system.md §1.8, §5.4; brand-gaps §2 ruling 2).
//
//   failure  BLOCKED   --alarm-text on --alarm-tint-hi, 1px --alarm border (the block adds a
//                      2px --alarm top rule). NEVER a solid red fill behind text: --ink-0 on
//                      --alarm measures Lc 43.3 and fails; --alarm is fill-only (R2).
//   neutral  NEUTRAL   --ink-2 / 1px --rule-1 / --text-dim — the run degraded or no sandbox
//                      could run the proofs, so nothing could block
//   success  CLEAR     achromatic --text-body on --signal-tint-lo, 1px --signal-lo underline.
//                      No green, no checkmark: an instrument at rest has a needle at zero.
//   null     RUNNING   the gate is not decided yet; neutral styling
//
// Every state keeps the same box: 280x64 (docs/design/04-dashboard-blueprint.md, the gate
// block), a 1px border on all four sides (transparent where the state has none), BLOCKED's 2px
// top rule taking its extra pixel out of the padding, and the second line always reserved and
// clamped to one line, so the 0ms colour flip never moves a pixel of layout. The glyph (■ ○ — ◉) keeps the state legible
// without colour. The failure square is --alarm as a fill, the one place a chip may use it.
import { useState, type ComponentProps, type ReactNode } from "react";
import { GateGlyph, type GateGlyphState } from "@/components/icons/chip-glyphs";
import type { GateConclusion } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { CHIP_BASE, CHIP_LABEL, GATE, STAMP_CLASS, gateDetail, type GateDelivery } from "./spec";
import { useStamp } from "./use-stamp";

/** A GateConclusion, or null while the run is still deciding. */
export type GateReading = GateConclusion | null;

function stateOf(conclusion: GateReading): GateGlyphState {
  return conclusion ?? "running";
}

export type GateChipProps = Omit<ComponentProps<"span">, "children"> & { conclusion: GateReading };

/** The gate as a 20px chip: BLOCKED · NEUTRAL · CLEAR · RUNNING. */
export function GateChip({ conclusion, className, ...rest }: GateChipProps) {
  const state = stateOf(conclusion);
  const spec = GATE[state];
  const stamps = useStamp(state);
  return (
    <span
      key={stamps}
      data-slot="gate-chip"
      data-conclusion={state}
      className={cn(CHIP_BASE, spec.chip, stamps > 0 && STAMP_CLASS, className)}
      {...rest}
    >
      <GateGlyph state={state} size={12} className={spec.glyph} />
      <span className="sr-only">merge gate </span>
      <span className={CHIP_LABEL}>{spec.label}</span>
    </span>
  );
}

export type GateBlockProps = Omit<ComponentProps<"div">, "children"> & {
  conclusion: GateReading;
  /** gate.blocking_finding_ids.length */
  blocking?: number;
  /** gate.delivery — which rung of the gate ladder carried the decision */
  delivery?: GateDelivery | null;
  /** gate.reason — printed for a neutral gate */
  reason?: string;
  /** Replaces the computed second line. */
  detail?: ReactNode;
  /**
   * Announce changes after mount: `role="alert"` when the gate turns BLOCKED — the only
   * alert in the product — and `role="status"` for every other change. Both regions render
   * empty at first paint so assistive tech registers them before anything is said. Turn it
   * off when more than one block is on screen.
   */
  announce?: boolean;
};

/** One line at 11px, always: the row exists in every state and never wraps. */
const DETAIL_ROW = "block min-w-0 truncate pl-5 font-mono text-[11px] leading-[1.4]";

/**
 * The gate block: 280x64, top-right of every run view.
 *
 *   ■ GATE · BLOCKED            check_run     the verdict, and the gate-ladder rung that carried it
 *     1 blocking finding                      why: the count, or the API's reason for a neutral gate
 */
export function GateBlock({ conclusion, blocking, delivery, reason, detail, announce = true, className, ...rest }: GateBlockProps) {
  const state = stateOf(conclusion);
  const spec = GATE[state];
  const stamps = useStamp(state);
  const line = detail ?? gateDetail(state, blocking, reason);

  // What the live regions say: set during render on a change, never at first paint.
  const [said, setSaid] = useState<{ state: GateGlyphState; alert: string; status: string }>({ state, alert: "", status: "" });
  if (said.state !== state) {
    const words = [typeof line === "string" ? line : null, delivery ?? null].filter(Boolean).map((w) => ` · ${w}`).join("");
    setSaid(
      state === "failure"
        ? { state, alert: `merge gate blocked${words}`, status: "" }
        : { state, alert: "", status: `merge gate ${spec.label.toLowerCase()}${words}` },
    );
  }

  // Only BLOCKED carries the 2px --alarm top rule. It takes its extra pixel from the top
  // padding, so the four states share one box and the flip never moves the content.
  const failure = state === "failure";
  const pad = failure ? "border-t-2 pt-[11px] pb-3" : "py-3";
  // The full sentence stays in the DOM (assistive tech reads all of it); the eye gets one
  // line and the rest on hover. gate.reason can run to three lines at 11px.
  const title = typeof line === "string" ? line : undefined;

  return (
    <div data-slot="gate-block" data-conclusion={state} className={cn("relative w-[280px] max-w-full", className)} {...rest}>
      <div
        key={stamps}
        data-slot="gate-block-frame"
        className={cn(
          "flex h-16 flex-col justify-center gap-1 overflow-hidden rounded-data border px-3 transition-none",
          pad,
          spec.block,
          stamps > 0 && STAMP_CLASS,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <GateGlyph state={state} size={12} className={spec.glyph} />
          <span className="type-badge">
            <span className="sr-only">merge </span>GATE · {spec.label}
          </span>
          {delivery ? (
            <span data-slot="gate-block-delivery" className="ms-auto truncate font-mono text-[11px] leading-[1.4]">
              <span className="sr-only">delivered by </span>
              {delivery}
            </span>
          ) : null}
        </span>
        {line ? (
          <span data-slot="gate-block-detail" title={title} className={DETAIL_ROW}>
            {line}
          </span>
        ) : (
          // Nothing to say yet (RUNNING, or no count supplied): the row is still reserved.
          <span data-slot="gate-block-detail-empty" aria-hidden="true" className={DETAIL_ROW}>
            {"\u00a0"}
          </span>
        )}
      </div>
      {announce ? (
        <>
          <span role="alert" className="sr-only">
            {said.alert}
          </span>
          <span role="status" className="sr-only">
            {said.status}
          </span>
        </>
      ) : null}
    </div>
  );
}
