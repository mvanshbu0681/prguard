"use client";

import type { FindingItem } from "@contracts";
import clsx from "clsx";
import { ArrowUpRight, BadgeCheck, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { InlineCode } from "@/components/ui/inline-code";
import { Markdown } from "@/components/ui/markdown";
import { FindingStatusPill, ReviewerPill } from "@/components/ui/pills";
import { SeverityPill } from "@/components/ui/severity";
import { Suggestion } from "./suggestion";

function location(finding: FindingItem): string {
  if (finding.line === null) return finding.path;
  if (finding.startLine !== null && finding.startLine !== finding.line) {
    return `${finding.path}:${finding.startLine}-${finding.line}`;
  }
  return `${finding.path}:${finding.line}`;
}

export function FindingCard({ finding }: { finding: FindingItem }) {
  const settled = finding.status !== "open";

  return (
    <article
      id={`f-${finding.fingerprint}`}
      className={clsx(
        "scroll-mt-16 overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi target:border-line-3",
        settled && "opacity-60",
      )}
    >
      <header className="flex h-10 items-center gap-3 border-b border-line bg-surface-2/50 px-4">
        <SeverityPill severity={finding.severity} />
        {finding.verified && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-text">
            <BadgeCheck className="size-3.5 text-accent" aria-hidden="true" />
            Verified
          </span>
        )}
        {settled && <FindingStatusPill status={finding.status} />}
        <a
          href={finding.url}
          target="_blank"
          rel="noreferrer"
          title="Open on GitHub"
          className="group/loc flex min-w-0 items-center gap-1 font-mono text-xs text-accent-text hover:text-primary"
        >
          <span className="truncate">{location(finding)}</span>
          <ArrowUpRight
            className="size-3 shrink-0 opacity-0 transition-opacity group-hover/loc:opacity-100"
            aria-hidden="true"
          />
        </a>
        {finding.placement === "body" && (
          <span className="shrink-0 rounded-sm border border-line-2 px-1.5 text-2xs leading-4 text-dim">In summary</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {finding.reviewers.map((r) => (
            <ReviewerPill key={r.id} badge={r.badge} name={r.name} />
          ))}
        </span>
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        <h3 className="text-base font-semibold leading-snug text-primary">
          <InlineCode text={finding.title} />
        </h3>
        {finding.body.trim() && <Markdown size="sm">{finding.body}</Markdown>}
        {finding.suggestion && <Suggestion code={finding.suggestion} />}
        {finding.evidence?.trim() && (
          <Collapsible variant="inline" title="Evidence">
            <Markdown size="sm">{finding.evidence}</Markdown>
          </Collapsible>
        )}
        {finding.details && finding.details.body.trim() && (
          <Collapsible variant="inline" title={finding.details.title}>
            <Markdown size="sm">{finding.details.body}</Markdown>
          </Collapsible>
        )}
      </div>

      {(finding.agentPrompt || finding.commentUrl) && (
        <footer className="flex items-center gap-0.5 border-t border-hair px-2 py-1">
          {finding.agentPrompt && <CopyPrompt text={finding.agentPrompt} />}
          {finding.commentUrl && (
            <ButtonLink href={finding.commentUrl} variant="ghost" size="sm">
              Comment
              <ArrowUpRight aria-hidden="true" />
            </ButtonLink>
          )}
        </footer>
      )}
    </article>
  );
}

function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  function copy() {
    // `navigator.clipboard` only exists on secure origins.
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      {copied ? <Check className="text-ok" aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy prompt"}</span>
    </Button>
  );
}
