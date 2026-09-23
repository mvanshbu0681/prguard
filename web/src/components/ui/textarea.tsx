// OWNER: T1b (wave 1). The input's rules (design §5.2) at 64px minimum height,
// resizing vertically and growing with its content where field-sizing is supported.
import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  mono?: boolean;
}

function Textarea({ className, mono = false, ...props }: TextareaProps) {
  return <textarea data-slot="textarea" data-mono={mono ? "" : undefined} className={cn("ui-input ui-textarea", className)} {...props} />;
}

export { Textarea };
