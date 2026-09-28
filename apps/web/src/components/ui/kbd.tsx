// OWNER: T1b (wave 1). A key cap: 1px --rule-2, 2px radius, 11px mono, --text-body.
//
//   <Kbd>⌘K</Kbd>   <KbdGroup><Kbd>g</Kbd><Kbd>o</Kbd></KbdGroup>
//
// Google Sans Code has ⌘ ⇧ ⌥ ← ↑ → ↓ but no ⏎ or ↵: write "Enter", "Esc", "Tab".
import * as React from "react";
import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd" className={cn("ui-kbd", className)} {...props} />;
}

/** A key combination or sequence. Nested <kbd> is the HTML spec's form for "these keys together". */
function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd-group" className={cn("ui-kbd-group", className)} {...props} />;
}

export { Kbd, KbdGroup };
