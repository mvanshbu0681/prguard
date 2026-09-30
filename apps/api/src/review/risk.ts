import type { ImpactSymbol } from "../db/schema.ts";
import type { FileDiff } from "./diff.ts";
import { fileKind } from "./noise.ts";
import type { Severity } from "./types.ts";

export type RiskLevel = "low" | "medium" | "high";
export type Risk = { level: RiskLevel; score: number; reasons: string[] };

const AREAS: { name: string; re: RegExp }[] = [
  { name: "payments", re: /(pay|billing|invoice|refund|charge|checkout|wallet|price|money|ledger|transfer|subscription)/i },
  { name: "auth", re: /(auth|login|session|permission|role|acl|oauth|password|jwt)/i },
  { name: "data and migrations", re: /(migration|schema|alembic|(^|\/)models?(\/|\.)|\.sql$|prisma)/i },
  { name: "security config", re: /(cors|csp|security|crypto|secret)/i },
  { name: "infrastructure", re: /(dockerfile|\.github\/workflows|terraform|helm|k8s|deploy)/i },
];

const GUARD = /\b(if|assert|raise|throw|require|authorize|permission|validate|check)\b/;

export type RiskInput = {
  prFiles: FileDiff[];
  impact: ImpactSymbol[];
  newDependencies: number;
  malware: boolean;
  /** Findings open on the PR after this review. */
  openFindings: { severity: Severity }[];
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Risk from code signals alone: size, sensitive areas, blast radius, new dependencies, removed
 * guards and open findings. Each signal adds points; the top three become the reasons.
 */
export function assessRisk(input: RiskInput): Risk {
  const parts: { points: number; reason: string }[] = [];
  const lines = input.prFiles.reduce((n, f) => n + f.additions + f.deletions, 0);
  if (lines >= 500) parts.push({ points: 20, reason: `${lines} lines changed` });
  else if (lines >= 200) parts.push({ points: 10, reason: `${lines} lines changed` });

  let areaPoints = 0;
  for (const area of AREAS) {
    const hit = input.prFiles.find((f) => area.re.test(f.path));
    if (!hit || areaPoints >= 40) continue;
    areaPoints += 20;
    parts.push({ points: 20, reason: `touches ${area.name} (\`${hit.path}\`)` });
  }

  const top = [...input.impact].sort((a, b) => b.refs - a.refs)[0];
  const refs = input.impact.reduce((n, s) => n + s.refs, 0);
  if (top && refs >= 5) {
    const points = refs >= 50 ? 30 : refs >= 20 ? 20 : 10;
    parts.push({ points, reason: `${plural(top.refs, "reference")} to \`${top.name}\`` });
  }

  if (input.malware) parts.push({ points: 50, reason: "adds a malicious package" });
  else if (input.newDependencies > 0) parts.push({ points: Math.min(15, 5 * input.newDependencies), reason: `adds ${plural(input.newDependencies, "dependency")}`.replace("dependencys", "dependencies") });

  const removedGuards = input.prFiles
    .filter((f) => fileKind(f.path) === "source")
    .flatMap((f) => f.hunks.flatMap((h) => h.lines.filter((l) => l.kind === "del" && GUARD.test(l.text))))
    .length;
  if (removedGuards >= 3) parts.push({ points: 10, reason: `removes ${removedGuards} checks` });

  const count = (s: Severity) => input.openFindings.filter((f) => f.severity === s).length;
  const critical = count("critical");
  const high = count("high");
  const medium = count("medium");
  if (critical) parts.push({ points: Math.min(40, 30 * critical), reason: `${plural(critical, "critical finding")}` });
  if (high) parts.push({ points: Math.min(30, 10 * high), reason: `${plural(high, "high finding")}` });
  if (medium) parts.push({ points: Math.min(9, 3 * medium), reason: `${plural(medium, "medium finding")}` });

  let score = parts.reduce((n, p) => n + p.points, 0);
  const onlyTestsOrDocs = input.prFiles.length > 0 && input.prFiles.every((f) => ["test", "docs"].includes(fileKind(f.path)));
  if (onlyTestsOrDocs) score = Math.round(score / 2);
  score = Math.min(100, score);
  const level: RiskLevel = score < 30 ? "low" : score < 60 ? "medium" : "high";
  const reasons = [...parts].sort((a, b) => b.points - a.points).slice(0, 3).map((p) => p.reason);
  return { level, score, reasons };
}
