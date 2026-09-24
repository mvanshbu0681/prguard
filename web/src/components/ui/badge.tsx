// OWNER: T1b (wave 1). Design §5.4 base: a neutral rectangular chip.
//
// 20px tall (never smaller), 2px radius, 6px padding-x, 11px Google Sans Code
// 600 caps +0.08em, an optional 12px leading glyph with a 4px gap. Never a pill.
// The label is --text-body (Lc 78): a chip label needs Lc 60 and --text-dim is 45.
//
// This is the NEUTRAL chip only. Proof, severity, gate and stage chips carry
// state, a mandatory glyph and a 0ms stamp; they are track t1c's, not this file's.
import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "outline";
/** The vendored-shadcn names, kept so generated call sites still compile. */
export type BadgeVariantAlias = "default" | "secondary" | "ghost";

const ALIAS: Record<BadgeVariantAlias, BadgeVariant> = {
  default: "neutral",
  secondary: "neutral",
  ghost: "outline",
};

export function resolveBadgeVariant(variant: BadgeVariant | BadgeVariantAlias | null | undefined): BadgeVariant {
  if (!variant) return "neutral";
  return (ALIAS as Record<string, BadgeVariant>)[variant] ?? (variant as BadgeVariant);
}

/** label: 11px mono caps +0.08em. value: a hash or SHA — case kept, tracking 0 (hashes are data, design §2.3). */
export type BadgeKind = "label" | "value";

export function badgeVariants({
  variant,
  kind = "label",
  className,
}: { variant?: BadgeVariant | BadgeVariantAlias | null; kind?: BadgeKind; className?: string } = {}): string {
  const v = resolveBadgeVariant(variant);
  return cn("ui-badge", v === "outline" && "ui-badge--outline", kind === "value" && "ui-badge--value", className);
}

export interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: BadgeVariant | BadgeVariantAlias | null;
  kind?: BadgeKind;
  /** Render the child (a link, a button) as the chip; it then gets the one-rung hover and the focus ring. */
  asChild?: boolean;
}

function Badge({ className, variant, kind = "label", asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span";
  const v = resolveBadgeVariant(variant);
  return <Comp data-slot="badge" data-variant={v} data-kind={kind} className={badgeVariants({ variant: v, kind, className })} {...props} />;
}

export { Badge };
