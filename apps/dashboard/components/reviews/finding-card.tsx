import type { FindingItem } from "@contracts";
import { ArrowUpRight } from "lucide-react";
import { InlineCode } from "@/components/ui/inline-code";
import { Markdown } from "@/components/ui/markdown";
import { ReviewerPill } from "@/components/ui/pills";
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
  return (
    <article
      id={`f-${finding.fingerprint}`}
      className="scroll-mt-16 overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi target:border-line-3"
    >
      <header className="flex h-10 items-center gap-3 border-b border-line bg-surface-2/50 px-4">
        <SeverityPill severity={finding.severity} />
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
      </div>
    </article>
  );
}
