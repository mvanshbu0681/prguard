import type { PullRequest } from "../db/schema.ts";

function cap(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * 3.5);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…(truncated)`;
}

/** The shared context every model call about a PR starts from. */
export function buildContext(pr: PullRequest): string {
  const parts: string[] = [];
  parts.push(`## Pull request\nTitle: ${pr.title}\n${pr.body?.trim() ? `Description:\n${cap(pr.body.trim(), 1000)}` : "Description: (none)"}`);
  return parts.join("\n\n");
}

export { cap };
