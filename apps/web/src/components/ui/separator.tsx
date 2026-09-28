"use client";

// OWNER: T1b (wave 1). A --rule-hair hairline (0.5px at 2dppx). Decorative by
// default: a meaning-bearing edge is a border in --ink-7, not a separator.
import * as React from "react";
import { Separator as SeparatorPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Separator({ className, orientation = "horizontal", decorative = true, ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn("ui-separator", className)}
      {...props}
    />
  );
}

export { Separator };
