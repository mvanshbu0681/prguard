import { Hono } from "hono";
import { z } from "zod";
import { queueBrief } from "../../brief/index-repo.ts";
import * as repositoriesRepo from "../../db/repos/repositories.ts";
import { repoDetail, repoItems } from "../serialize.ts";
import { accessibleRepo, requireUser, type AuthEnv } from "../session.ts";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  brief: z.string().max(40_000).optional(),
});

export const repos = new Hono<AuthEnv>();

repos.use("*", requireUser);

repos.get("/", (c) => c.json(repoItems(repositoriesRepo.listActive(c.get("installationIds")))));

repos.get("/:id", (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  return c.json(repoDetail(repo));
});

repos.patch("/:id", async (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request." }, 400);
  const { brief, ...rest } = parsed.data;
  repositoriesRepo.update(repo.id, {
    ...rest,
    ...(brief !== undefined ? { brief: brief.trim() || null, briefStatus: brief.trim() ? "ready" : "none", briefUpdatedAt: Date.now() } : {}),
  });
  return c.json(repoDetail(repositoriesRepo.get(repo.id)!));
});

repos.post("/:id/rescan", (c) => {
  const repo = accessibleRepo(c, Number(c.req.param("id")));
  if (!repo) return c.json({ error: "Repository not found." }, 404);
  queueBrief(repo.id);
  return c.json({ ok: true });
});
