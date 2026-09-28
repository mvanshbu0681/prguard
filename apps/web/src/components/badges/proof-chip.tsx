"use client";
// OWNER: t1c (wave 1). ProofChip — proof_status as a chip (docs/design/02-design-system.md
// §1.7, §5.4). Proven and disproven share the cyan hue on purpose (both are execution
// results); fill vs outline, the vial glyph and the label carry the difference, so the
// state survives greyscale, colour-vision deficiency and forced-colors mode.
//
//   proven          solid --signal, --ink-0 text, filled vial
//   disproven       transparent, 1px --signal, --signal-text, struck vial, struck label,
//                   optional caption `refuted by execution`
//   inconclusive    --marker-tint, 1px dashed --marker, --marker-text, half vial
//   not_attempted   transparent, 1px --rule-2, --text-disabled (an explicit token, never
//                   opacity), empty vial
//   not_applicable, skipped_no_env — the not_attempted style with their own label and vial
import type { ComponentProps, ReactNode } from "react";
import { ProofMark } from "@/components/icons/marks";
import type { ProofStatus } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { CHIP_BASE, CHIP_LABEL, PROOF_CHIP, STAMP_CLASS } from "./spec";
import { useStamp } from "./use-stamp";

export type ProofChipProps = Omit<ComponentProps<"span">, "children"> & {
  status: ProofStatus;
  /**
   * `true` prints the state's own caption (disproven: `refuted by execution`); anything
   * else prints that instead, e.g. why an inconclusive run needs a human.
   */
  caption?: true | ReactNode;
};

export function ProofChip({ status, caption, className, ...rest }: ProofChipProps) {
  const spec = PROOF_CHIP[status];
  const stamps = useStamp(status);
  const grouped = caption !== undefined && caption !== null && caption !== false;
  const chip = (
    <span
      key={stamps}
      data-slot="proof-chip"
      data-status={status}
      className={cn(CHIP_BASE, spec.className, stamps > 0 && STAMP_CLASS, !grouped && className)}
      {...(grouped ? {} : rest)}
    >
      <ProofMark status={status} size={12} />
      <span className="sr-only">proof status </span>
      <span className={cn(CHIP_LABEL, spec.strike && "line-through decoration-1")}>{spec.label}</span>
    </span>
  );
  if (!grouped) return chip;
  const text = caption === true ? spec.caption : caption;
  return (
    <span data-slot="proof-chip-group" className={cn("inline-flex items-center gap-2", className)} {...rest}>
      {chip}
      {text ? (
        <span data-slot="proof-chip-caption" className="font-mono text-[11px] leading-[1.4] text-text-dim">
          {text}
        </span>
      ) : null}
    </span>
  );
}
