import type { ReviewComment } from "../github/pr.ts";
import { agentPrompt } from "./agent-prompt.ts";
import { badge, button, priorityBadge, reviewerBadges, riskBadge, row, sevBadge, statusBadge, type Priority, type RiskLevel } from "./badges.ts";
import { countBySeverity, SEVERITIES, type Finding } from "./types.ts";

const MAX_BODY = 60_000;

/** Badge ids of a finding's reviewers (`general+security` merges two). */
function reviewerBadgeIds(reviewer: string): string[] {
  return reviewer.split("+");
}

function fold(title: string, body: string): string {
  return `<details><summary>${title}</summary>\n\n${body.trim()}\n\n</details>`;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function findingUrl(reviewUrl: string, f: Pick<Finding, "fingerprint">): string {
  return `${reviewUrl}#f-${f.fingerprint}`;
}

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
  /** `https://github.com/<repo>/blob/<head sha>`, for links to lines. */
  blobUrl: string;
  /** False when no reviewer ran (docs only, nothing reviewable, reviewers switched off). */
  reviewed: boolean;
  priority?: Priority | null;
  risk?: RiskLevel | null;
  /** One line: why this priority and this risk. */
  reasons?: string | null;
  /** Findings fixed by this push, new in this review, and still open on the PR. */
  since?: { fixed: number; new: number; open: number } | null;
  /** A Mermaid flowchart of the change. */
  flow?: string | null;
};

function location(f: Finding): string {
  if (f.line === null) return f.path;
  return f.startLine && f.startLine !== f.line ? `${f.path}:${f.startLine}-${f.line}` : `${f.path}:${f.line}`;
}

function lineLink(blobUrl: string, f: Finding): string {
  const path = f.path.split("/").map(encodeURIComponent).join("/");
  const anchor = f.line === null ? "" : f.startLine && f.startLine !== f.line ? `#L${f.startLine}-L${f.line}` : `#L${f.line}`;
  const short = location(f).split("/").pop()!;
  return `[\`${short}\`](${blobUrl}/${path}${anchor})`;
}

/**
 * One line comment: badges, title, body, suggestion, folded evidence and extras, a prompt for coding
 * agents, and a button into the dashboard at this finding.
 */
export function commentBody(f: Finding, reviewUrl: string): string {
  const badges = row([sevBadge(f.severity), ...reviewerBadges(reviewerBadgeIds(f.reviewer)), f.verified ? badge("verified") : ""]);
  const parts = [badges, "", `**${f.title}**`, "", f.body.trim()];
  if (f.suggestion !== null) parts.push("", "```suggestion", f.suggestion.replace(/\n$/, ""), "```");
  if (f.evidence) parts.push("", fold("Evidence", f.evidence));
  if (f.details) parts.push("", fold(f.details.title, f.details.body));
  parts.push("", fold("Prompt for AI agents", `\`\`\`\`text\n${agentPrompt(f)}\n\`\`\`\``));
  parts.push("", button("button-finding", findingUrl(reviewUrl, f)));
  return parts.join("\n");
}

export function toComments(findings: Finding[], reviewUrl: string): ReviewComment[] {
  return findings
    .filter((f) => f.placement === "inline" && f.line !== null)
    .map((f) => ({
      path: f.path,
      line: f.line!,
      side: "RIGHT" as const,
      ...(f.startLine && f.startLine < f.line! ? { start_line: f.startLine, start_side: "RIGHT" as const } : {}),
      body: commentBody(f, reviewUrl),
    }));
}

function header(input: BodyInput): string[] {
  const out = [row([badge("logo"), input.priority ? priorityBadge(input.priority) : "", input.risk ? riskBadge(input.risk) : ""])];
  if (input.kind === "incremental" && input.range) {
    out.push("", `<sub>New commits \`${input.range.from.slice(0, 7)}..${input.range.to.slice(0, 7)}\`</sub>`);
  }
  return out;
}

function severityRow(input: BodyInput): string | null {
  if (!input.reviewed) return null;
  const visible = input.findings.filter((f) => f.placement !== "hidden");
  if (visible.length === 0) return "No issues found.";
  const counts = countBySeverity(visible);
  return row(SEVERITIES.filter((s) => counts[s] > 0).map((s) => sevBadge(s, counts[s])));
}

function sinceRow(since: NonNullable<BodyInput["since"]>): string {
  const parts = [
    since.fixed > 0 ? statusBadge("fixed", since.fixed) : "",
    since.new > 0 ? statusBadge("new", since.new) : "",
    since.open > 0 ? statusBadge("open", since.open) : "",
  ];
  return `Since the last review ${row(parts)}`;
}

function tableRows(input: BodyInput): string[] {
  return input.findings
    .filter((f) => f.placement !== "hidden")
    .map((f) => `| ${sevBadge(f.severity)} | ${cell(f.title)} | ${lineLink(input.blobUrl, f)} |`);
}

function table(rows: string[], total: number): string {
  const more = total > rows.length ? `\n\nand ${total - rows.length} more in the full review.` : "";
  return ["| | Finding | Where |", "| --- | --- | --- |", ...rows].join("\n") + more;
}

type Parts = {
  head: string[];
  rows: string[];
  bodyOnly: string | null;
  folds: string[];
  tail: string[];
};

function assemble(p: Parts, rowCount: number): string {
  const out = [...p.head];
  if (p.rows.length) out.push(table(p.rows.slice(0, rowCount), p.rows.length), "");
  if (p.bodyOnly) out.push(p.bodyOnly, "");
  for (const f of p.folds) out.push(f, "");
  out.push(...p.tail);
  return out.join("\n");
}

/**
 * The review body: logo with priority and risk, summary, reasons, severity counts, a findings table,
 * folded key changes, flow, nits and skipped files, the limits note, and a button to the dashboard.
 * Stays under GitHub's size limit by dropping folds first, then table rows.
 */
export function reviewBody(input: BodyInput): string {
  const head = [...header(input), ""];
  if (input.summary) head.push(input.summary, "");
  if (input.reasons) head.push(input.reasons, "");
  const severities = severityRow(input);
  if (severities) head.push(severities, "");
  if (input.since && input.since.fixed + input.since.new + input.since.open > 0) head.push(sinceRow(input.since), "");

  const inBody = input.findings.filter((f) => f.placement === "body");
  const bodyOnly = inBody.length
    ? fold(
        `Not attached to a line (${inBody.length})`,
        inBody.map((f) => `- ${sevBadge(f.severity)} \`${location(f)}\`: **${f.title}**. ${f.body.trim().replace(/\n+/g, " ")}`).join("\n"),
      ).replace("<details>", "<details open>")
    : null;

  const folds: string[] = [];
  if (input.walkthrough.length) {
    const rows = input.walkthrough.map((w) => `| \`${w.path}\` | ${cell(w.change)} |`);
    folds.push(fold(`Key changes (${plural(input.walkthrough.length, "file")})`, ["| File | Change |", "| --- | --- |", ...rows].join("\n")));
  }
  if (input.flow) folds.push(fold("How the change flows", `\`\`\`mermaid\n${input.flow}\n\`\`\``));
  const hidden = input.findings.filter((f) => f.placement === "hidden");
  if (hidden.length) {
    folds.push(fold(plural(hidden.length, "nit"), hidden.map((f) => `- \`${location(f)}\`: ${f.title}`).join("\n")));
  }
  if (input.skipped.length) {
    folds.push(fold(`Skipped files (${input.skipped.length})`, input.skipped.map((s) => `- \`${s.path}\` (${s.reason})`).join("\n")));
  }

  const tail: string[] = [];
  if (input.note) tail.push(`> ${input.note}`, "");
  tail.push(button("button-review", input.reviewUrl));

  const parts: Parts = { head, rows: tableRows(input), bodyOnly, folds, tail };
  let rowCount = parts.rows.length;
  let body = assemble(parts, rowCount);
  while (body.length > MAX_BODY && parts.folds.length) {
    parts.folds.pop();
    body = assemble(parts, rowCount);
  }
  if (body.length > MAX_BODY && parts.bodyOnly) {
    parts.bodyOnly = null;
    body = assemble(parts, rowCount);
  }
  while (body.length > MAX_BODY && rowCount > 0) {
    rowCount = Math.max(0, rowCount - 10);
    body = assemble(parts, rowCount);
  }
  return body.length > MAX_BODY ? body.slice(0, MAX_BODY) : body;
}

/** The check run summary: the review's header, summary and findings table. */
export function checkSummary(input: BodyInput): string {
  const head = [...header(input), ""];
  if (input.summary) head.push(input.summary, "");
  if (input.reasons) head.push(input.reasons, "");
  const severities = severityRow(input);
  if (severities) head.push(severities, "");
  if (input.since && input.since.fixed + input.since.new + input.since.open > 0) head.push(sinceRow(input.since), "");
  const rows = tableRows(input).slice(0, 50);
  if (rows.length) head.push(table(rows, tableRows(input).length), "");
  head.push(`[Open in PR Guard](${input.reviewUrl})`);
  return head.join("\n").slice(0, MAX_BODY);
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
