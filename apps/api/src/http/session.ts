import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import * as installationsRepo from "../db/repos/installations.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as usersRepo from "../db/repos/users.ts";
import type { Repository, User } from "../db/schema.ts";

export const SESSION_COOKIE = "pg_session";

export type Scope = {
  /** Installations the user belongs to. */
  installationIds: number[];
  /** Installations the user administers (org admins, account owners). */
  adminInstallationIds: number[];
  /** Repositories the user can see: every repo of an installation they administer, plus their own. */
  repositoryIds: Set<number>;
  /** Repositories whose settings the user may change. */
  adminRepositoryIds: Set<number>;
};

export type AuthEnv = { Variables: { user: User; scope: Scope } };

function scopeFor(userId: number): Scope {
  const active = new Set(installationsRepo.listActive().map((i) => i.id));
  const access = usersRepo.access(userId);
  const installs = access.installations.filter((i) => active.has(i.installationId));
  const installationIds = installs.map((i) => i.installationId);
  const adminInstallationIds = installs.filter((i) => i.admin).map((i) => i.installationId);

  const repos = repositoriesRepo.listActive(installationIds);
  const own = new Map(access.repositories.map((r) => [r.repositoryId, r.admin]));
  const repositoryIds = new Set<number>();
  const adminRepositoryIds = new Set<number>();
  for (const repo of repos) {
    const orgAdmin = adminInstallationIds.includes(repo.installationId);
    if (orgAdmin || own.has(repo.id)) repositoryIds.add(repo.id);
    if (orgAdmin || own.get(repo.id)) adminRepositoryIds.add(repo.id);
  }
  return { installationIds, adminInstallationIds, repositoryIds, adminRepositoryIds };
}

/** 401 unless a valid session cookie is present; exposes the user and what they can see. */
export const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  const user = sessionId ? usersRepo.sessionUser(sessionId) : undefined;
  if (!user) return c.json({ error: "Sign in required." }, 401);
  c.set("user", user);
  c.set("scope", scopeFor(user.id));
  await next();
});

export function visibleRepos(c: Context<AuthEnv>): Repository[] {
  const scope = c.get("scope");
  return repositoriesRepo.listActive(scope.installationIds).filter((r) => scope.repositoryIds.has(r.id));
}

/** The repository, if it exists and the user can see it. */
export function accessibleRepo(c: Context<AuthEnv>, id: number): Repository | undefined {
  const repo = repositoriesRepo.get(id);
  if (!repo || repo.removedAt || !c.get("scope").repositoryIds.has(repo.id)) return undefined;
  return repo;
}

export function canEditRepo(c: Context<AuthEnv>, repositoryId: number): boolean {
  return c.get("scope").adminRepositoryIds.has(repositoryId);
}

export function isHttps(c: Context): boolean {
  return (c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "")) === "https";
}
