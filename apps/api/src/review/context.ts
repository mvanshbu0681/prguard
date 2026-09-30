import type { PullRequest, Repository } from "../db/schema.ts";

function cap(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * 3.5);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…(truncated)`;
}

/** The shared context every model call about a PR starts from. A missing brief is simply left out. */
export function buildContext(pr: PullRequest, repo: Repository): string {
  const parts: string[] = [];
  if (repo.brief?.trim()) parts.push(`## Repository brief (${repo.fullName})\n${cap(repo.brief.trim(), 3000)}`);
  parts.push(`## Pull request\nTitle: ${pr.title}\n${pr.body?.trim() ? `Description:\n${cap(pr.body.trim(), 1000)}` : "Description: (none)"}`);
  return parts.join("\n\n");
}
