import { Hono } from "hono";
import type { InstallationSummary, Me } from "../../contracts.ts";
import * as installationsRepo from "../../db/repos/installations.ts";
import type { Installation } from "../../db/schema.ts";
import { requireUser, visibleRepos, type AuthEnv } from "../session.ts";

export function installationSummary(i: Installation, repoCount: number, canEdit: boolean): InstallationSummary {
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
    canEdit,
  };
}

export const me = new Hono<AuthEnv>();

me.get("/", requireUser, (c) => {
  const user = c.get("user");
  const scope = c.get("scope");
  const repos = visibleRepos(c);
  const body: Me = {
    user: { id: user.id, login: user.login, name: user.name, avatarUrl: user.avatarUrl },
    installations: installationsRepo
      .listByIds(scope.installationIds)
      .map((i) =>
        installationSummary(i, repos.filter((r) => r.installationId === i.id).length, scope.adminInstallationIds.includes(i.id)),
      ),
    // Goes through the API so the install carries our OAuth state back to the callback.
    installUrl: "/api/auth/install",
  };
  return c.json(body);
});
