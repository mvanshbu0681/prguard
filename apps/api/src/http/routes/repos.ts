import { Hono } from "hono";
import { z } from "zod";
import { queueBrief } from "../../brief/index-repo.ts";
import type { Learning } from "../../contracts.ts";
import * as learningsRepo from "../../db/repos/learnings.ts";
import * as repositoriesRepo from "../../db/repos/repositories.ts";
import type { LearningRow } from "../../db/schema.ts";
import { reviewers } from "../../review/reviewers/index.ts";
import { repoDetail, repoItems } from "../serialize.ts";
import { accessibleRepo, canEditRepo, requireUser, visibleRepos, type AuthEnv } from "../session.ts";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  brief: z.string().max(40_000).optional(),
  rules: z.string().max(10_000).optional(),
  disabledReviewers: z
    .array(z.string())
    .optional()
    .transform((ids) => ids && [...new Set(ids)].filter((id) => reviewers.some((r) => r.id === id))),
});

const READ_ONLY = { error: "Only repository admins can change this." };

export const repos = new Hono<AuthEnv>();

repos.use("*", requireUser);

repos.get("/", (c) => c.json(repoItems(visibleRepos(c), c.get("scope").adminRepositoryIds)));

repos.get("/:id", (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  return c.json(repoDetail(repo, c.get("scope").adminRepositoryIds));
});

repos.patch("/:id", async (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  if (!canEditRepo(c, repo.id)) return c.json(READ_ONLY, 403);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request." }, 400);
  const { brief, ...rest } = parsed.data;
  repositoriesRepo.update(repo.id, {
    ...rest,
    ...(brief !== undefined ? { brief: brief.trim() || null, briefStatus: brief.trim() ? "ready" : "none", briefUpdatedAt: Date.now() } : {}),
  });
  return c.json(repoDetail(repositoriesRepo.get(repo.id)!, c.get("scope").adminRepositoryIds));
});

function learningItem(row: LearningRow): Learning {
  return { id: row.id, text: row.text, source: row.source, author: row.author, url: row.url, enabled: row.enabled, createdAt: row.createdAt };
}

const learningCreate = z.object({ text: z.string().trim().min(1).max(500) });
const learningPatch = z.object({ enabled: z.boolean().optional(), text: z.string().trim().min(1).max(500).optional() });

repos.get("/:id/learnings", (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  return c.json(learningsRepo.list(repo.id).map(learningItem));
});

repos.post("/:id/learnings", async (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  if (!canEditRepo(c, repo.id)) return c.json(READ_ONLY, 403);
  const parsed = learningCreate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request." }, 400);
  const row = learningsRepo.create({
    repositoryId: repo.id,
    text: parsed.data.text,
    source: "manual",
    path: null,
    category: null,
    fingerprint: null,
    title: null,
    findingId: null,
    repoWide: true,
    author: c.get("user").login,
    url: null,
  });
  return c.json(learningItem(row));
});

/** A learning of a repository this user can see, or undefined. */
function ownLearning(repoId: number, learningId: number): LearningRow | undefined {
  const row = learningsRepo.get(learningId);
  return row && row.repositoryId === repoId ? row : undefined;
}

repos.patch("/:id/learnings/:lid", async (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  if (!canEditRepo(c, repo.id)) return c.json(READ_ONLY, 403);
  if (!ownLearning(repo.id, Number(c.req.param("lid")))) return c.json({ error: "Learning not found." }, 404);
  const parsed = learningPatch.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request." }, 400);
  const row = learningsRepo.update(Number(c.req.param("lid")), parsed.data);
  return row ? c.json(learningItem(row)) : c.json({ error: "Learning not found." }, 404);
});

repos.delete("/:id/learnings/:lid", (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  if (!canEditRepo(c, repo.id)) return c.json(READ_ONLY, 403);
  if (!ownLearning(repo.id, Number(c.req.param("lid")))) return c.json({ error: "Learning not found." }, 404);
  learningsRepo.remove(Number(c.req.param("lid")));
  return c.json({ ok: true });
});

repos.post("/:id/rescan", (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  if (!canEditRepo(c, repo.id)) return c.json(READ_ONLY, 403);
  queueBrief(repo.id);
  return c.json({ ok: true });
});
