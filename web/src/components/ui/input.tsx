// OWNER: T1b (wave 1). Design §5.2, motion §4.1.6.
//
// 32px, --ink-1 fill, a meaning-bearing 1px --ink-7 border (3.03:1, SC 1.4.11),
// 2px radius, 13px Inter. Hover brightens the border one step (--ink-8); focus
// keeps it and adds the 2px --signal-hi ring; aria-invalid="true" flips it to
// --alarm in 0ms. Wrap it in <Field> for the label, hint and error wiring.
// `mono` is for hashes, SHAs, paths and anything else a machine produced.
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Google Sans Code 12.5px, tabular, tracking 0 — for machine-produced values. */
  mono?: boolean;
}

function Input({ className, type, mono = false, ...props }: InputProps) {
  return <input type={type} data-slot="input" data-mono={mono ? "" : undefined} className={cn("ui-input", className)} {...props} />;
}

export { Input };
