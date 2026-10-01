import { z } from "zod";
import { getSnapshot } from "../github/snapshot.ts";
import { listFiles, threadsOutdated } from "../github/pr.ts";
import { agent } from "../llm/call.ts";
import { redactSecrets, secretsIn } from "../review/checks/secrets.ts";
import { codify } from "../review/codify.ts";
import { buildContext } from "../review/context.ts";
import { newLineText, toFileDiffs } from "../review/diff.ts";
import { savePull } from "../review/events.ts";
import { fitReplacement } from "../review/findings.ts";
import { readFile, repoTools } from "../review/tools.ts";
import { registerCommand, threadFinding, type CommandContext } from "./run.ts";

const fixSchema = z.object({ code: z.string(), explanation: z.string() });

const SYSTEM = `You are PR Guard, an automated code reviewer. Write the fix for one finding as a GitHub suggestion.
- code: the exact replacement for the numbered lines shown under "Lines to replace", whole lines with the same indentation. Only those lines: nothing before or after them.
- explanation: one sentence on what the change does. Put identifiers in single backticks.
- Keep the fix as small as possible and consistent with the file. Use the tools to check names you rely on.
Answer by calling submit_fix once.`;

const OUTDATED = "The code under this comment changed. Ask on the new lines.";
const NO_FIX = "I couldn't write a fix that commits cleanly on these lines. The prompt for AI agents on the finding has the details.";

async function fix(c: CommandContext): Promise<void> {
  const finding = threadFinding(c.payload)!;
  if (finding.line === null || !finding.githubCommentId) return void (await c.reply(NO_FIX));
  const outdated = await threadsOutdated(c.gh, c.r, c.payload.number);
  if (outdated.get(finding.githubCommentId)) return void (await c.reply(OUTDATED));

  const file = toFileDiffs(await listFiles(c.gh, c.r, c.payload.number)).find((f) => f.path === finding.path);
  if (!file) return void (await c.reply(OUTDATED));
  const start = finding.startLine ?? finding.line;
  const last = finding.line;
  const text = newLineText(file);
  const target: string[] = [];
  for (let l = start; l <= last; l++) target.push(`${String(l).padStart(6)} | ${text.get(l) ?? ""}`);

  const pr = savePull(c.repo, c.live);
  const snapshot = await getSnapshot(c.gh, c.repo.id, c.repo.fullName, c.live.head.sha).catch(() => null);
  const around = snapshot ? readFile(snapshot, finding.path, Math.max(1, start - 30), last + 30) : "";
  const prompt = [
    buildContext(pr, c.repo),
    `## Finding (\`${finding.path}:${start === last ? last : `${start}-${last}`}\`)\n**${finding.title}**\n${finding.body}`,
    around && `## Surrounding code\n\`\`\`\n${around}\n\`\`\``,
    `## Lines to replace\n\`\`\`\n${target.join("\n")}\n\`\`\``,
    c.args && `## Extra instruction from @${c.payload.author}\n${c.args}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await agent({
    purpose: "command:fix",
    role: "smart",
    repositoryId: c.repo.id,
    system: SYSTEM,
    prompt,
    tools: snapshot ? repoTools(snapshot) : {},
    answer: { name: "submit_fix", description: "The replacement code and a one-sentence explanation.", schema: fixSchema },
    maxSteps: snapshot ? 3 : 1,
  });
  const code = result ? fitReplacement(file, start, last, result.code) : null;
  if (!code || !result) return void (await c.reply(NO_FIX));
  // The code the model was shown may hold a secret it repeats: that exact value is scrubbed too.
  const sensitive = secretsIn(prompt);
  const explanation = redactSecrets(codify(result.explanation.trim(), new Set()), sensitive);
  await c.reply(`\`\`\`suggestion\n${redactSecrets(code, sensitive).replace(/\n$/, "")}\n\`\`\`\n\n${explanation}`);
}

registerCommand("fix", fix);
