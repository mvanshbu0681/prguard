import type { Severity } from "@contracts";
import clsx from "clsx";

export const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low", "nit"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  nit: "Nit",
};

const tint: Record<Severity, string> = {
  critical: "bg-sev-critical/12 text-sev-critical",
  high: "bg-sev-high/12 text-sev-high",
  medium: "bg-sev-medium/12 text-sev-medium",
  low: "bg-sev-low/12 text-sev-low",
  nit: "bg-sev-nit/12 text-sev-nit",
};

const dot: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
  nit: "bg-sev-nit",
};

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return <span aria-hidden="true" className={clsx("inline-block size-1.5 shrink-0 rounded-full", dot[severity], className)} />;
}

// `2 High` when a count is given, otherwise a labelled pill with a dot.
export function SeverityPill({ severity, count }: { severity: Severity; count?: number }) {
  return (
    <span
      className={clsx(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium tabular",
        tint[severity],
      )}
    >
      {count === undefined && <SeverityDot severity={severity} />}
      {count !== undefined && <span>{count}</span>}
      <span>{SEVERITY_LABEL[severity]}</span>
    </span>
  );
}
