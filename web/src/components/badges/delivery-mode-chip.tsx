"use client";
// OWNER: t1c (wave 1). DeliveryModeChip — which rung of the comment ladder carried a finding
// to the pull request (spec §4.7; docs/design/02-design-system.md §1.5: --marker marks an
// "S8 ladder fallback"). Labels follow brand-gaps §D: the value in 11px mono caps.
//
//   inline_exact    INLINE EXACT    rung 1   --text-body, 1px --rule-2    the line itself
//   inline_nearest  INLINE NEAREST  rung 2   --marker-text, 1px --marker  a nearby diff line
//   file_level      FILE LEVEL      rung 3   --marker-text, 1px --marker  a file comment
//   summary_only    SUMMARY ONLY    rung 4   --marker-text, 1px --marker  the review body table
//   not_delivered   NOT DELIVERED   no rung  --text-disabled, 1px --rule-2  (the quiet not_attempted style)
//
// The ladder glyph shows the rung by POSITION, so the mode reads without colour.
import type { ComponentProps } from "react";
import { RungGlyph } from "@/components/icons/chip-glyphs";
import type { DeliveryMode } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { chipLabel } from "./format";
import { CHIP_BASE, CHIP_LABEL, DELIVERY_MODE, STAMP_CLASS } from "./spec";
import { useStamp } from "./use-stamp";

export type DeliveryModeChipProps = Omit<ComponentProps<"span">, "children"> & { mode: DeliveryMode };

export function DeliveryModeChip({ mode, className, ...rest }: DeliveryModeChipProps) {
  const spec = DELIVERY_MODE[mode];
  const stamps = useStamp(mode);
  return (
    <span
      key={stamps}
      data-slot="delivery-mode-chip"
      data-mode={mode}
      className={cn(CHIP_BASE, spec.className, stamps > 0 && STAMP_CLASS, className)}
      {...rest}
    >
      <RungGlyph rung={spec.rung} size={12} />
      <span className="sr-only">delivery </span>
      <span className={CHIP_LABEL}>{chipLabel(mode)}</span>
    </span>
  );
}
