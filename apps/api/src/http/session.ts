import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import * as installationsRepo from "../db/repos/installations.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as usersRepo from "../db/repos/users.ts";
import type { Repository, User } from "../db/schema.ts";

export const SESSION_COOKIE = "pg_session";

export type AuthEnv = { Variables: { user: User; installationIds: number[] } };

/** 401 unless a valid session cookie is present; exposes the user and the installations they can see. */
export const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  const user = sessionId ? usersRepo.sessionUser(sessionId) : undefined;
  if (!user) return c.json({ error: "Sign in required." }, 401);
  const visible = new Set(installationsRepo.listActive().map((i) => i.id));
  c.set("user", user);
  c.set("installationIds", usersRepo.installationIds(user.id).filter((id) => visible.has(id)));
  await next();
});

/** The repository, if it exists and belongs to an installation the user can see. */
export function accessibleRepo(c: Context<AuthEnv>, id: number): Repository | undefined {
  const repo = repositoriesRepo.get(id);
  if (!repo || repo.removedAt || !c.get("installationIds").includes(repo.installationId)) return undefined;
  return repo;
}

export function isHttps(c: Context): boolean {
  return (c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "")) === "https";
}
