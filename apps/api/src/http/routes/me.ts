import { Hono } from "hono";
import { config } from "../../config.ts";
import type { InstallationSummary, Me } from "../../contracts.ts";
import * as installationsRepo from "../../db/repos/installations.ts";
import * as repositoriesRepo from "../../db/repos/repositories.ts";
import type { Installation } from "../../db/schema.ts";
import { requireUser, type AuthEnv } from "../session.ts";

export function installationSummary(i: Installation, repoCount: number): InstallationSummary {
  return {
    id: i.id,
    accountLogin: i.accountLogin,
    accountType: i.accountType,
    avatarUrl: i.avatarUrl,
    rules: i.rules,
    repoCount,
    settingsUrl:
      i.accountType === "Organization"
        ? `https://github.com/organizations/${i.accountLogin}/settings/installations/${i.id}`
        : `https://github.com/settings/installations/${i.id}`,
  };
}

export const me = new Hono<AuthEnv>();

me.get("/", requireUser, (c) => {
  const user = c.get("user");
  const ids = c.get("installationIds");
  const repos = repositoriesRepo.listActive(ids);
  const body: Me = {
    user: { id: user.id, login: user.login, name: user.name, avatarUrl: user.avatarUrl },
    installations: installationsRepo
      .listByIds(ids)
      .map((i) => installationSummary(i, repos.filter((r) => r.installationId === i.id).length)),
    installUrl: `https://github.com/apps/${config.github.slug}/installations/new`,
  };
  return c.json(body);
});
