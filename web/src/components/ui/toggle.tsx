"use client";

// OWNER: T1b (wave 1). A two-state control (motion §4.1.4): the density
// toggle (32px ↔ 26px), wrap, and the footer's MOTION / CONTRAST controls.
//
// 11px mono caps. Rest --text-dim; hover steps one rung and lifts the label to
// --text-body (hover-quiet). On = level 4 — --ink-4 fill, --ink-7 border,
// --text-primary — plus the 2px --signal bar a selected tab carries, so the
// state is a shape and not colour alone. aria-pressed is set by Radix.
// A toggle that writes data-motion / data-contrast flips the page in 0ms.
import * as React from "react";
import { Toggle as TogglePrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export type ToggleVariant = "default" | "outline";
export type ToggleSize = "sm" | "md" | "lg";

export function toggleVariants({
  variant = "default",
  size = "md",
  className,
}: { variant?: ToggleVariant | null; size?: ToggleSize | "default" | null; className?: string } = {}): string {
  const s = !size || size === "default" ? "md" : size;
  return cn("ui-toggle hover-quiet", variant === "outline" && "ui-toggle--outline", s !== "md" && `ui-toggle--${s}`, className);
}

export interface ToggleProps extends React.ComponentProps<typeof TogglePrimitive.Root> {
  variant?: ToggleVariant | null;
  size?: ToggleSize | "default" | null;
}

function Toggle({ className, variant = "default", size = "md", ...props }: ToggleProps) {
  return <TogglePrimitive.Root data-slot="toggle" className={toggleVariants({ variant, size, className })} {...props} />;
}

export { Toggle };
