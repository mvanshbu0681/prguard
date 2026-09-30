import * as learningsRepo from "../db/repos/learnings.ts";
import type { LearningRow } from "../db/schema.ts";
import { titleWords } from "../review/findings.ts";
import type { Finding } from "../review/types.ts";

const IN_PROMPT = 30;
const MAX_CHARS = 1500 * 3.5;

/** The prompt section: the 30 most recent enabled learnings of the repository. Empty when none. */
export function learningsSection(repositoryId: number): string {
  const rows = learningsRepo.listEnabled(repositoryId).slice(0, IN_PROMPT);
  if (rows.length === 0) return "";
  let text = "## Team learnings (the team asked not to flag these; do not report them)\n";
  for (const row of rows) {
    const line = `- ${row.text}${row.path && !row.repoWide ? ` (\`${row.path}\`)` : ""}\n`;
    if (text.length + line.length > MAX_CHARS) break;
    text += line;
  }
  return text.trim();
}

function similarity(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = new Set(titleWords(b));
  if (!wa.length || !wb.size) return 0;
  const inter = wa.filter((w) => wb.has(w)).length;
  return inter / (wa.length + wb.size - inter);
}

/** Whether a learning covers a finding: the same fingerprint, or the same kind of issue on the same path. */
export function covers(learning: LearningRow, f: Finding): boolean {
  if (learning.fingerprint && learning.fingerprint === f.fingerprint) return true;
  if (!learning.title) return false;
  const samePlace = learning.repoWide || learning.path === f.path;
  const sameKind = !learning.category || learning.category === f.category;
  return samePlace && sameKind && similarity(learning.title, f.title) >= 0.5;
}

/**
 * Drops findings the team already dismissed. Critical findings from checks (secrets, malware) are
 * never suppressed: a learning cannot silence them.
 */
export function suppress(findings: Finding[], repositoryId: number): { kept: Finding[]; suppressed: { finding: Finding; learningId: number }[] } {
  const rows = learningsRepo.listEnabled(repositoryId);
  if (rows.length === 0) return { kept: findings, suppressed: [] };
  const kept: Finding[] = [];
  const suppressed: { finding: Finding; learningId: number }[] = [];
  for (const f of findings) {
    const hit = f.fromCheck && f.severity === "critical" ? undefined : rows.find((row) => covers(row, f));
    if (hit) suppressed.push({ finding: f, learningId: hit.id });
    else kept.push(f);
  }
  return { kept, suppressed };
}
