"use client";
// OWNER: t1c (wave 1). StageDot — one pipeline station's state (docs/design/02-design-system.md
// §1.11, §8.2 "Stage: glyph + dash pattern + text label").
//
//   pending   ○  hollow, 1px --ink-6
//   running   ◉  1px --signal-hi ring + centre dot. The ring carries the class `heartbeat`;
//                track t3 owns that keyframe (1200ms, steps(1, end)) and its reduced-motion end state.
//   done      ●  filled --signal-lo
//   degraded  ▲  filled --marker
//   failed    ■  filled --alarm (a glyph square: --alarm as fill, never as text)
//
// Five SHAPES, not five colours, so the state survives greyscale and forced-colors mode
// (every shape is drawn in currentColor, which forced colors maps to CanvasText).
// Connectors between stations are <StageRail>'s (track T7); this is the node alone. The root
// is an <svg>, so a rail drawn as one SVG can nest it (x / y) as well as HTML can inline it.
//
// The stamp goes on an inner <g> with transform-box: fill-box, never on the root <svg>
// (§6.4 rule 4: Safari mis-handles transforms on the outermost svg).
import type { CSSProperties, SVGProps } from "react";
import type { StageState } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { STAGE_DOT_COLOR, STAGE_DOT_SHAPE, STAMP_CLASS, type StageDotSize } from "./spec";
import { useStamp } from "./use-stamp";

// Geometry per size, in that size's own pixel grid (viewBox = size): circles on the
// half-pixel grid, squares on whole pixels.
function shape(state: StageState, s: StageDotSize) {
  const c = s / 2;
  switch (state) {
    case "pending":
      return <circle cx={c} cy={c} r={c - 1.5} fill="none" stroke="currentColor" strokeWidth={1} />;
    case "running":
      return (
        <>
          <circle className="heartbeat" cx={c} cy={c} r={c - 1.5} fill="none" stroke="currentColor" strokeWidth={1} />
          <circle cx={c} cy={c} r={s === 8 ? 1 : c - 3.5} fill="currentColor" />
        </>
      );
    case "done":
      return <circle cx={c} cy={c} r={c - 1} fill="currentColor" />;
    case "degraded":
      return <path d={`M${c} ${s * 0.06}L${s * 0.98} ${s * 0.9}H${s * 0.02}Z`} fill="currentColor" />;
    case "failed":
      // the done disc's bounding box: the heaviest shape is the one that stops the run
      return <rect x={1} y={1} width={s - 2} height={s - 2} fill="currentColor" />;
  }
}

export type StageDotProps = Omit<SVGProps<SVGSVGElement>, "children" | "ref"> & {
  state: StageState;
  size?: StageDotSize;
  /** Accessible name; defaults to `stage <state>`. `false` when a visible label already says it. */
  label?: string | false;
  /** The real telemetry interval for the running heartbeat, written on this element (never :root). */
  heartbeatMs?: number;
};

export function StageDot({ state, size = 10, label, heartbeatMs, className, style, ...rest }: StageDotProps) {
  const stamps = useStamp(state);
  const name = label === false ? undefined : (label ?? `stage ${state}`);
  const beat = state === "running" && heartbeatMs ? ({ "--heartbeat-period": `${heartbeatMs}ms` } as CSSProperties) : undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      focusable="false"
      role={name ? "img" : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      data-slot="stage-dot"
      data-state={state}
      data-shape={STAGE_DOT_SHAPE[state]}
      className={cn("inline-block shrink-0 overflow-visible transition-none", STAGE_DOT_COLOR[state], className)}
      style={beat ? { ...beat, ...style } : style}
      {...rest}
    >
      <g key={stamps} data-slot="stage-dot-stamp" className={cn("origin-center [transform-box:fill-box]", stamps > 0 && STAMP_CLASS)}>
        {shape(state, size)}
      </g>
    </svg>
  );
}
