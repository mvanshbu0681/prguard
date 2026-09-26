"use client";
// OWNER: d3 (wave 3). Click-to-copy mono value — the fingerprint in the sticky
// mini-header and the full fingerprint in §06 IDENTITY (dashboard-blueprint
// §2.7). Same swallow-on-denial pattern as ChainRail's own copy button and
// ErrorState's request-id copy (no shared component exists to import: both are
// three lines of local logic in their own tracks).
import { useState } from "react";
import { cn } from "@/lib/utils";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access denied or unavailable (permissions, non-secure context):
    // the value is still visible and selectable, so this is a silent no-op.
    return false;
  }
}

export interface CopyableValueProps {
  /** What's shown. */
  display: string;
  /** What's copied — the full value when `display` is a shortened form. */
  full: string;
  label: string;
  className?: string;
}

export function CopyableValue({ display, full, label, className }: CopyableValueProps) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-slot="copyable-value"
      title={full}
      className={cn("type-data inline-flex items-center gap-1 text-text-body underline decoration-rule-2 decoration-dotted underline-offset-2 hover:text-text-primary", className)}
      onClick={async () => {
        const ok = await copyToClipboard(full);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      <span className="sr-only">{label} </span>
      {copied ? "COPIED" : display}
    </button>
  );
}
