"use client";
// OWNER: t1c (wave 1). StatusBadge — a finding's lifecycle status (docs/design/02-design-system.md
// §1.9). Border STYLE is the encoding, because it survives greyscale, colour-vision
// deficiency and forced-colors mode where hue and alpha do not:
//
//   proposed    --text-dim, 1px DOTTED --rule-2                pre-publication
//   published   --text-body, 2px --signal-lo LEFT RAIL          on the pull request
//   suppressed  --text-dim, 1.5px DASHED --ink-7, ledger glyph  the row stays on the record
//               (an SVG stroke: browsers snap a 1.5px CSS border to 1px)
//   dropped     --text-dim, strikethrough, NO border
//   disproven   the disproven proof chip: 1px solid --signal outline, --signal-text,
//               struck vial, struck label (§1.9 has four rows; the API has a fifth status)
import type { ComponentProps } from "react";
import type { FindingStatus } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { CHIP_BASE, CHIP_LABEL, FINDING_STATUS, STAMP_CLASS } from "./spec";
import { useStamp } from "./use-stamp";

export type StatusBadgeProps = Omit<ComponentProps<"span">, "children"> & { status: FindingStatus };

/**
 * A 1.5px dashed outline over the chip's (transparent) 1px border. Absolute boxes resolve
 * against the padding box (inside that border), so -0.25px puts the svg 0.75px in from the
 * chip's outer edge, and a stroke centred on its edge reaches that edge exactly; rx matches the 2px
 * --radius-data corner at the stroke's centre line.
 */
function DashedOutline() {
  return (
    <svg
      data-slot="status-badge-outline"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-[-0.25px] h-[calc(100%+0.5px)] w-[calc(100%+0.5px)] overflow-visible text-status-suppressed-border"
    >
      <rect x="0" y="0" width="100%" height="100%" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

export function StatusBadge({ status, className, ...rest }: StatusBadgeProps) {
  const spec = FINDING_STATUS[status];
  const stamps = useStamp(status);
  return (
    <span
      key={stamps}
      data-slot="status-badge"
      data-status={status}
      className={cn(CHIP_BASE, spec.className, stamps > 0 && STAMP_CLASS, className)}
      {...rest}
    >
      {spec.glyph}
      <span className="sr-only">status </span>
      <span className={cn(CHIP_LABEL, spec.strike && "line-through decoration-1")}>{spec.label}</span>
      {spec.dashes ? <DashedOutline /> : null}
    </span>
  );
}
