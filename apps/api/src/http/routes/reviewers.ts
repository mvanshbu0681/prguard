import { Hono } from "hono";
import type { ReviewerInfo } from "../../contracts.ts";
import { reviewers as registry, reviewerInfo } from "../../review/reviewers/index.ts";
import { requireUser, type AuthEnv } from "../session.ts";

export const reviewers = new Hono<AuthEnv>();

reviewers.get("/", requireUser, (c) => c.json(registry.map((r): ReviewerInfo => reviewerInfo(r))));
