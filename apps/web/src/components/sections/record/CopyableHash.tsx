"use client";
// OWNER: m5 (wave 3). One hash rendered first-8…last-4, the full value in `title`
// (hover) and on click-to-copy (landing-blueprint §07: "rendered first-8…last-4 with
// the full value on hover/copy"). Mirrors the click-to-copy hash chip already built
// inside <ChainRail> (src/components/evidence/ChainRail/ChainRail.tsx) — this is the
// same interaction on a value ChainRail does not itself render (a finding's
// fingerprint, plan A10 ids.proven_fingerprint), so it stays a small local component
// instead of reaching into ChainRail's private row markup.
import { useCallback, useState } from "react";
import { hashShort } from "@/components/evidence/ChainRail";
import { cn } from "@/lib/utils";

export interface CopyableHashProps {
  /** The full hex value, e.g. a fingerprint or a hash. Never truncated in the DOM. */
  value: string;
  className?: string;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access can be denied (permissions, non-secure context) — the value is
    // still visible and selectable via `title`, so this is a silent no-op.
    return false;
  }
}

export function CopyableHash({ value, className }: CopyableHashProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    void copyToClipboard(value).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [value]);

  return (
    <span
      role="button"
      tabIndex={0}
      title={value}
      onClick={onCopy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCopy();
        }
      }}
      className={cn(
        "type-data inline-flex cursor-pointer items-baseline gap-1.5 text-text-primary outline-none hover:text-signal-text focus-visible:[box-shadow:var(--focus-ring)]",
        className,
      )}
    >
      {hashShort(value)}
      <span aria-live="polite" className="type-micro text-text-dim">
        {copied ? "copied" : ""}
      </span>
    </span>
  );
}
