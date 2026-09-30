import type { Finding } from "./types.ts";

type Promptable = Pick<Finding, "path" | "line" | "startLine" | "title" | "body" | "suggestion">;

/** A copy-ready instruction for a coding agent to fix one finding. */
export function agentPrompt(f: Promptable): string {
  const where =
    f.line === null
      ? `\`${f.path}\``
      : f.startLine && f.startLine !== f.line
        ? `\`${f.path}\` lines ${f.startLine}-${f.line}`
        : `\`${f.path}\` line ${f.line}`;
  const lines = [`In ${where}: ${f.title}.`, "", `Problem: ${f.body.trim().replace(/\s*\n\s*/g, " ")}`, ""];
  if (f.suggestion) lines.push("Fix: replace those lines with:", "", f.suggestion.replace(/\n$/, ""));
  else lines.push("Fix: make the smallest change that resolves this, keeping the file's existing style.");
  return lines.join("\n");
}
