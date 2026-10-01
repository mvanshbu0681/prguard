export type Severity = "critical" | "high" | "medium" | "low" | "nit";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "nit"];

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, nit: 4 };

/** A finding after anchoring, dedupe and ranking. */
export type Finding = {
  reviewer: string;
  path: string;
  line: number | null;
  startLine: number | null;
  severity: Severity;
  category: string;
  title: string;
  body: string;
  suggestion: string | null;
  confidence: number;
  fingerprint: string;
  placement: "inline" | "body" | "hidden";
  /** A folded extra section, e.g. suggested tests or what Socket found. */
  details?: { title: string; body: string } | null;
  /** Confirmed by the verification pass, with the code that shows it. */
  verified?: boolean;
  evidence?: string | null;
  /** From a check (code, not a model): certain, so never verified or suppressed like model findings. */
  fromCheck?: boolean;
  /** The finding's lines at publish time. */
  snippet?: string | null;
};

export function countBySeverity(findings: Pick<Finding, "severity">[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
