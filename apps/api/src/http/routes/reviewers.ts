import { Hono } from "hono";
import type { ReviewerInfo } from "../../contracts.ts";
import { reviewers as registry } from "../../review/reviewers/index.ts";
import { requireUser, type AuthEnv } from "../session.ts";

export const reviewers = new Hono<AuthEnv>();

reviewers.get("/", requireUser, (c) =>
  c.json(registry.map((r): ReviewerInfo => ({ id: r.id, name: r.name, description: r.description }))),
);
