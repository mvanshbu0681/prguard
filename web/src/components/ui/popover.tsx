"use client";

// OWNER: T1b (wave 1). Design §3.6 level 3: --ink-3, 1px --rule-2, the inset
// highlight, 4px radius, no shadow. Motion §4.3: scaleY 0.98 → 1 from the
// trigger edge in 180ms --ease-snap; exit 160ms --ease-exit.
// A popover never holds the only copy of a definition, a caveat or an n —
// those are always-visible body text (design §8.7).
import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  container?: React.ComponentProps<typeof PopoverPrimitive.Portal>["container"];
}) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn("ui-pop ui-popover", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor(props: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-header" className={cn("flex flex-col gap-1", className)} {...props} />;
}

// A div, not a heading: a popover must not add a level to the page's outline wherever it opens.
function PopoverTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-title" className={cn("ui-popover__title", className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="popover-description" className={cn("ui-popover__description", className)} {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
