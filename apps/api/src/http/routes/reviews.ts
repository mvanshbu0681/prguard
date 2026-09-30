import { Hono } from "hono";
import * as repositoriesRepo from "../../db/repos/repositories.ts";
import * as reviewsRepo from "../../db/repos/reviews.ts";
import type { ReviewStatus } from "../../db/schema.ts";
import { reviewItems } from "../serialize.ts";
import { requireUser, type AuthEnv } from "../session.ts";

const STATUS_FILTERS: Record<string, ReviewStatus[]> = {
  active: ["queued", "running"],
  completed: ["completed"],
  failed: ["failed"],
};

export const reviews = new Hono<AuthEnv>();

reviews.use("*", requireUser);

reviews.get("/", (c) => {
  const visible = repositoriesRepo.listActive(c.get("installationIds")).map((r) => r.id);
  const repo = Number(c.req.query("repo"));
  const repositoryIds = repo ? visible.filter((id) => id === repo) : visible;
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
  const statuses = STATUS_FILTERS[c.req.query("status") ?? ""];
  return c.json(reviewItems(reviewsRepo.list({ repositoryIds, statuses, limit })));
});
