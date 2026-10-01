import * as repositoriesRepo from "../db/repos/repositories.ts";
import { installationClient, splitFullName } from "../github/app.ts";
import { getSnapshot } from "../github/snapshot.ts";
import { text } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";
import { briefKey, enqueue } from "../queue/queue.ts";
import { FatalError, registerJob, type JobContext } from "../queue/worker.ts";
import { estimateTokens } from "../review/diff.ts";
import { collect, type Material } from "./collect.ts";

const SINGLE_PASS_TOKENS = 45_000;

const BRIEF_SYSTEM = `You write the repository brief that PR Guard's code reviewers read before reviewing a pull request.
Write markdown with exactly these sections:
## What it is
## Stack
## Structure
## Conventions
## Watch out for
Rules: be specific and factual, name real paths, frameworks and patterns you can see. Under "Structure", list the main folders and what lives there. Under "Conventions", state the house rules a reviewer should enforce (error handling, logging, data access, naming, validation, tests). Under "Watch out for", list risky or subtle areas. At most 600 words. Do not invent anything the files do not support. No preamble. Put identifiers, file paths, commands, config keys and literal values in single backticks.`;

const AREA_SYSTEM = `You summarise one area of a codebase for a repository brief. In at most 120 words: what this area does, key files, and patterns or conventions visible in the code. Plain markdown bullets, no preamble.`;

function section(title: string, files: { path: string; text: string }[]): string {
  return files.map((f) => `### ${title}: ${f.path}\n\`\`\`\n${f.text}\n\`\`\``).join("\n\n");
}

async function writeBrief(fullName: string, m: Material, meta: { repositoryId: number }): Promise<string> {
  const head = `Repository: ${fullName}\n\n## File tree\n${m.tree}\n\n## Key files\n${section("File", m.keyFiles)}`;
  const samples = [...m.samples].map(([area, files]) => `## Area: ${area}\n${section("Sample", files)}`).join("\n\n");
  const whole = `${head}\n\n${samples}`;

  if (estimateTokens(whole) <= SINGLE_PASS_TOKENS) {
    return text({ ...meta, purpose: "brief", role: "smart", system: BRIEF_SYSTEM, prompt: whole });
  }

  const notes = await Promise.all(
    [...m.samples].map(async ([area, files]) => {
      const note = await text({
        ...meta,
        purpose: "brief:area",
        role: "fast",
        system: AREA_SYSTEM,
        prompt: `Repository: ${fullName}\nArea: ${area}\n\n${section("Sample", files)}`,
      }).catch(() => "");
      return note ? `## Area: ${area}\n${note}` : "";
    }),
  );
  const trimmedHead = estimateTokens(head) > 30_000 ? head.slice(0, 30_000 * 3.5) : head;
  return text({ ...meta, purpose: "brief", role: "smart", system: BRIEF_SYSTEM, prompt: `${trimmedHead}\n\n# Area notes\n${notes.filter(Boolean).join("\n\n")}` });
}

export function queueBrief(repositoryId: number): void {
  repositoriesRepo.update(repositoryId, { briefStatus: "queued" });
  enqueue("index_repo", briefKey(repositoryId), { repositoryId });
}

async function indexRepo(payload: Record<string, unknown>, ctx: JobContext): Promise<void> {
  const repositoryId = Number(payload.repositoryId);
  const repo = repositoriesRepo.get(repositoryId);
  if (!repo || repo.removedAt) return;
  repositoriesRepo.update(repositoryId, { briefStatus: "running" });
  const briefLog = log.child({ repo: repo.fullName });
  try {
    const gh = await installationClient(repo.installationId);
    const r = splitFullName(repo.fullName);
    const { data: info } = await gh.rest.repos.get(r);
    repositoriesRepo.update(repositoryId, { defaultBranch: info.default_branch });
    let sha: string;
    try {
      sha = (await gh.rest.repos.getBranch({ ...r, branch: info.default_branch })).data.commit.sha;
    } catch {
      repositoriesRepo.update(repositoryId, { briefStatus: "none" });
      briefLog.info("repository is empty, no brief");
      return;
    }
    ctx.checkCancelled();
    const root = await getSnapshot(gh, repositoryId, repo.fullName, sha);
    if (!root) throw new FatalError("Repository too large to scan");
    const material = collect(root);
    const brief = await writeBrief(repo.fullName, material, { repositoryId });
    if (!brief.trim()) throw new Error("Empty brief");
    repositoriesRepo.update(repositoryId, { brief, briefStatus: "ready", briefSha: sha, briefUpdatedAt: Date.now() });
    briefLog.info({ chars: brief.length }, "brief written");
  } catch (err) {
    if (!ctx.isLastAttempt && !(err instanceof FatalError)) {
      repositoriesRepo.update(repositoryId, { briefStatus: "queued" });
      throw err;
    }
    repositoriesRepo.update(repositoryId, { briefStatus: "failed" });
    briefLog.error({ err: errMessage(err) }, "brief failed");
    throw new FatalError(errMessage(err));
  }
}

registerJob("index_repo", indexRepo, async (payload) => {
  repositoriesRepo.update(Number(payload.repositoryId), { briefStatus: "failed" });
});
