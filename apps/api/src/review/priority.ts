import type { PrioritySignals } from "../db/schema.ts";
import type { Severity } from "./types.ts";

export type Priority = "p0" | "p1" | "p2" | "p3";

const ORDER: Priority[] = ["p0", "p1", "p2", "p3"];

function raise(current: Priority, atLeast: Priority): Priority {
  return ORDER.indexOf(atLeast) < ORDER.indexOf(current) ? atLeast : current;
}

const URGENT_LABEL = /^(hotfix|urgent|p0|critical|sev[- ]?0|sev[- ]?1|incident)$/i;
const HIGH_LABEL = /^(p1|high|high[- ]priority|important)$/i;

export type PriorityInput = {
  signals: PrioritySignals | null;
  labels: string[];
  findings: { severity: Severity; reviewer: string }[];
  /** The PR's priority before this review; kept by incremental reviews unless something raises it. */
  previous: Priority | null;
  incremental: boolean;
};

/**
 * Business priority: the summary's read of impact and change type sets a base, labels and severe
 * findings can only raise it, and an incremental review keeps what the PR already had.
 */
export function decidePriority(input: PriorityInput): { priority: Priority; reason: string } {
  const notes: string[] = [];
  let priority: Priority;
  const s = input.signals;

  if (input.incremental && input.previous) {
    priority = input.previous;
  } else if (s) {
    priority = s.businessImpact === "high" ? "p1" : s.businessImpact === "low" ? "p3" : "p2";
    if (s.changeType === "hotfix" || s.changeType === "security") priority = s.businessImpact === "high" ? "p0" : raise(priority, "p1");
    else if (["docs", "test", "chore"].includes(s.changeType ?? "")) priority = "p3";
  } else {
    priority = "p2";
  }

  const urgent = input.labels.find((l) => URGENT_LABEL.test(l.trim()));
  const high = input.labels.find((l) => HIGH_LABEL.test(l.trim()));
  if (urgent) {
    priority = "p0";
    notes.push(`labelled \`${urgent}\``);
  } else if (high) {
    priority = raise(priority, "p1");
    notes.push(`labelled \`${high}\``);
  }

  const reviewers = (f: { reviewer: string }) => f.reviewer.split("+");
  const malware = input.findings.some((f) => f.severity === "critical" && reviewers(f).includes("supply-chain"));
  const secret = input.findings.some((f) => f.severity === "critical" && reviewers(f).includes("secrets"));
  const critical = input.findings.filter((f) => f.severity === "critical").length;
  if (malware || secret) {
    priority = "p0";
    notes.push(malware ? "adds a malicious package" : "commits a secret");
  } else if (critical) {
    priority = raise(priority, "p1");
    notes.push(`${critical} critical finding${critical === 1 ? "" : "s"}`);
  }

  const area = s?.impactArea?.trim();
  const lead = area ? area.charAt(0).toUpperCase() + area.slice(1) : !s ? "Ranked from labels and findings" : "";
  const reason = [lead, ...notes].filter(Boolean).join("; ");
  return { priority, reason: reason ? `${reason}.` : "" };
}
