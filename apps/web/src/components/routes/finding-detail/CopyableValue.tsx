"use client";
// Click-to-copy mono value (the fingerprint). Swallows a clipboard denial: the
// value is still visible and selectable.
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/dash/kit";

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
    <span className={className} data-slot="copyable-value">
      <span className="min-w-0 truncate" title={full}>
        {display}
      </span>
      <IconButton
        icon={copied ? Check : Copy}
        size="sm"
        label={copied ? "Copied" : `Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            // Clipboard access denied or unavailable.
          }
        }}
      />
    </span>
  );
}
