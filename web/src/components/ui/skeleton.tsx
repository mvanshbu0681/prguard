// OWNER: T1b (wave 1). A static block. No shimmer, no pulse (brand-gaps §2
// ruling 5, motion §3.2): decorative motion would imply progress that is not
// happening. Size it to the content it stands in for, exactly, so the swap
// costs no layout shift. The fill is one rung above its container
// (--ui-skeleton: ink-2 on the page, ink-3 inside a table, ink-4 in a popover).
import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("ui-skeleton", className)} {...props} />;
}

export { Skeleton };
