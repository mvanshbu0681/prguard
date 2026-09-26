"use client";

// OWNER: T1b (wave 1). Design §5.9 + the t1b brief: --ink-2 on a 1px --rule-2
// hairline, 2px radius, 6px/8px padding, 13px Inter --text-body, max 260px,
// 8px from the trigger, no arrow, no shadow. Enters over 180ms --ease-snap
// (opacity + 2px travel) after a 400ms open delay; leaves over 160ms --ease-exit
// with no close delay. variant="value" sets a machine value in mono.
//
// Never the only home for information: definitions, caveats and n values are
// always-visible body text (design §8.4 / §8.7). The Provider normally lives in
// src/lib/providers.tsx (T2); a Tooltip outside one throws.
import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** Design §5.9: 400ms open delay. */
export const TOOLTIP_OPEN_DELAY_MS = 400;

function TooltipProvider({ delayDuration = TOOLTIP_OPEN_DELAY_MS, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 8,
  variant = "prose",
  container,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  /** prose: 13px Inter (≤ 6 words is a label, not a sentence). value: 12.5px mono, tabular. */
  variant?: "prose" | "value";
  container?: React.ComponentProps<typeof TooltipPrimitive.Portal>["container"];
}) {
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-variant={variant}
        sideOffset={sideOffset}
        className={cn("ui-tooltip", variant === "value" && "ui-tooltip--value", className)}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
