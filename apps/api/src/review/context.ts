import * as installationsRepo from "../db/repos/installations.ts";
import type { PullRequest, Repository } from "../db/schema.ts";

function cap(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * 3.5);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…(truncated)`;
}

/** Org rules then repo rules, as the team wrote them, each capped on its own. Empty when neither is set. */
export function teamRules(repo: Repository): string {
  const org = installationsRepo.get(repo.installationId)?.rules.trim() ?? "";
  const own = repo.rules.trim();
  return [org && `Organization rules:\n${cap(org, 1500)}`, own && `Repository rules:\n${cap(own, 1500)}`].filter(Boolean).join("\n\n");
}

/** The shared context every model call about a PR starts from. A missing brief is simply left out. */
export function buildContext(pr: PullRequest, repo: Repository): string {
  const parts: string[] = [];
  if (repo.brief?.trim()) parts.push(`## Repository brief (${repo.fullName})\n${cap(repo.brief.trim(), 3000)}`);
  const rules = teamRules(repo);
  if (rules) parts.push(`## Team rules (enforce these; report violations with category "rules")\n${rules}`);
  parts.push(`## Pull request\nTitle: ${pr.title}\n${pr.body?.trim() ? `Description:\n${cap(pr.body.trim(), 1000)}` : "Description: (none)"}`);
  return parts.join("\n\n");
}
