"use client";

// OWNER: T1b (wave 1). A thin --ink-6 thumb (2px radius, never a pill) on a
// transparent 8px track; the thumb steps one rung (ink-7) on hover.
// If the region holds no focusable content, pass viewportProps={{ tabIndex: 0 }}
// so a keyboard user can scroll it; its ring is inset so it is never clipped.
import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  children,
  viewportProps,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>;
}) {
  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn("ui-scroll", className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        {...viewportProps}
        className={cn("ui-scroll__viewport", viewportProps?.className)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({ className, orientation = "vertical", ...props }: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("ui-scrollbar", className)}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb data-slot="scroll-area-thumb" className="ui-scrollbar__thumb" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
