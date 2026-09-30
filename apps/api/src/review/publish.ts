import type { ReviewComment } from "../github/pr.ts";
import { countBySeverity, SEVERITIES, type Finding, type Severity } from "./types.ts";

const LABEL: Record<Severity, string> = {
  critical: "🛑 Critical",
  high: "🔴 High",
  medium: "🟠 Medium",
  low: "🟡 Low",
  nit: "💬 Nit",
};

const MAX_BODY = 60_000;

export type BodyInput = {
  summary: string | null;
  walkthrough: { path: string; change: string }[];
  kind: "full" | "incremental";
  range: { from: string; to: string } | null;
  findings: Finding[];
  skipped: { path: string; reason: string }[];
  notReviewed: string[];
  filesReviewed: number;
  note: string | null;
  reviewUrl: string;
  /** False when no reviewer ran (docs only, nothing reviewable, reviewers switched off). */
  reviewed: boolean;
};

function severityLine(findings: Finding[]): string {
  const visible = findings.filter((f) => f.placement !== "hidden");
  if (visible.length === 0) return "No issues found.";
  const counts = countBySeverity(visible);
  const parts = SEVERITIES.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  return `**${visible.length} finding${visible.length === 1 ? "" : "s"}** · ${parts.join(" · ")}`;
}

function location(f: Finding): string {
  if (f.line === null) return `\`${f.path}\``;
  return f.startLine && f.startLine !== f.line ? `\`${f.path}:${f.startLine}-${f.line}\`` : `\`${f.path}:${f.line}\``;
}

export function commentBody(f: Finding): string {
  const parts = [`**${LABEL[f.severity]}** · ${f.category} — **${f.title}**`, "", f.body.trim()];
  if (f.suggestion !== null) parts.push("", "```suggestion", f.suggestion.replace(/\n$/, ""), "```");
  return parts.join("\n");
}

export function toComments(findings: Finding[]): ReviewComment[] {
  return findings
    .filter((f) => f.placement === "inline" && f.line !== null)
    .map((f) => ({
      path: f.path,
      line: f.line!,
      side: "RIGHT" as const,
      ...(f.startLine && f.startLine < f.line! ? { start_line: f.startLine, start_side: "RIGHT" as const } : {}),
      body: commentBody(f),
    }));
}

export function reviewBody(input: BodyInput): string {
  const out: string[] = [];
  const heading =
    input.kind === "incremental" && input.range
      ? `### PR Guard · new commits \`${input.range.from.slice(0, 7)}..${input.range.to.slice(0, 7)}\``
      : "### PR Guard";
  out.push(heading, "");
  if (input.summary) out.push(input.summary, "");
  if (input.note) out.push(`> ${input.note}`, "");
  if (input.reviewed) out.push(severityLine(input.findings), "");

  const inBody = input.findings.filter((f) => f.placement === "body");
  if (inBody.length) {
    out.push(`<details open><summary>Findings not attached to a line (${inBody.length})</summary>`, "");
    for (const f of inBody) out.push(`- **${LABEL[f.severity]}** ${location(f)} — **${f.title}**. ${f.body.trim().replace(/\n+/g, " ")}`);
    out.push("", "</details>", "");
  }

  if (input.walkthrough.length) {
    out.push("<details><summary>Walkthrough</summary>", "", "| File | Change |", "| --- | --- |");
    for (const w of input.walkthrough) out.push(`| \`${w.path}\` | ${w.change.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`);
    out.push("", "</details>", "");
  }

  const hidden = input.findings.filter((f) => f.placement === "hidden").length;
  const footer = [`Reviewed ${input.filesReviewed} file${input.filesReviewed === 1 ? "" : "s"}`];
  if (input.skipped.length) footer.push(`skipped ${input.skipped.length}`);
  if (input.notReviewed.length) footer.push(`${input.notReviewed.length} not reviewed (budget)`);
  if (hidden) footer.push(`${hidden} nit${hidden === 1 ? "" : "s"} hidden`);
  footer.push(`[Details](${input.reviewUrl})`);
  out.push(`<sub>${footer.join(" · ")}</sub>`);

  const body = out.join("\n");
  return body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}\n\n…` : body;
}

/** Same body with every inline finding moved into it; used when GitHub rejects the line comments. */
export function withInlineInBody(findings: Finding[]): Finding[] {
  return findings.map((f) => (f.placement === "inline" ? { ...f, placement: "body" as const } : f));
}

export function checkTitle(findings: Finding[], reviewed = true): { title: string; conclusion: "success" | "neutral" } {
  if (!reviewed) return { title: "Summary posted", conclusion: "success" };
  const visible = findings.filter((f) => f.placement !== "hidden");
  const counts = countBySeverity(visible);
  const serious = counts.critical + counts.high > 0;
  if (visible.length === 0) return { title: "No issues found", conclusion: "success" };
  const top = SEVERITIES.find((s) => counts[s] > 0 && s !== "nit" && s !== "low");
  const suffix = top ? ` · ${counts[top]} ${top}` : "";
  return { title: `${visible.length} finding${visible.length === 1 ? "" : "s"}${suffix}`, conclusion: serious ? "neutral" : "success" };
}
