import { randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Octokit } from "octokit";
import { queueBrief } from "../../brief/index-repo.ts";
import { config } from "../../config.ts";
import * as installationsRepo from "../../db/repos/installations.ts";
import * as repositoriesRepo from "../../db/repos/repositories.ts";
import * as usersRepo from "../../db/repos/users.ts";
import { githubApp, installationClient } from "../../github/app.ts";
import { saveInstallation, syncInstallation, type GitHubInstallation } from "../../github/reconcile.ts";
import { errMessage, log } from "../../log.ts";
import { isHttps, SESSION_COOKIE } from "../session.ts";

const STATE_COOKIE = "pg_oauth_state";

export const auth = new Hono();

function startSession(c: Context, userId: number): void {
  const session = usersRepo.createSession(userId, config.sessionDays);
  setCookie(c, SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttps(c),
    path: "/",
    maxAge: config.sessionDays * 86_400,
  });
}

function newState(c: Context): string {
  const state = randomBytes(16).toString("hex");
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: "Lax", secure: isHttps(c), path: "/", maxAge: 900 });
  return state;
}

/** Makes sure a newly seen installation and its repos are stored, and briefs are on their way. */
async function adoptInstallation(installation: GitHubInstallation): Promise<void> {
  const known = installationsRepo.get(installation.id);
  saveInstallation(installation);
  if (known && !known.deletedAt) return;
  const repoIds = await syncInstallation(installation.id);
  for (const id of repoIds) if (repositoriesRepo.get(id)?.briefStatus === "none") queueBrief(id);
}

/**
 * What GitHub says this user can see: installations and repos. A user administers an installation
 * when it is their own account, or when they are admin on every repository it covers (org owners
 * are). This needs no organization "Members" permission, which the App does not request.
 */
async function readAccess(userClient: Octokit, login: string, installs: GitHubInstallation[]): Promise<usersRepo.Access> {
  const access: usersRepo.Access = { installations: [], repositories: [] };
  for (const installation of installs) {
    const repos = (await userClient.paginate(userClient.rest.apps.listInstallationReposForAuthenticatedUser, {
      installation_id: installation.id,
      per_page: 100,
    })) as { id: number; permissions?: { admin?: boolean; maintain?: boolean } }[];
    const mine = repos.map((repo) => ({ repositoryId: Number(repo.id), admin: Boolean(repo.permissions?.admin || repo.permissions?.maintain) }));
    access.repositories.push(...mine);

    const owner = (installation.account?.login ?? "").toLowerCase() === login.toLowerCase();
    const covered = new Set(mine.filter((r) => r.admin).map((r) => r.repositoryId));
    const all = repositoriesRepo.listActive([installation.id]);
    const adminOfAll = all.length > 0 && all.every((r) => covered.has(r.id));
    access.installations.push({ installationId: installation.id, admin: owner || adminOfAll });
  }
  return access;
}

auth.get("/login", (c) => {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.github.clientId);
  url.searchParams.set("state", newState(c));
  return c.redirect(url.toString());
});

/** Installing (or changing repositories) starts here so the callback can prove we started it. */
auth.get("/install", (c) => {
  const url = new URL(`https://github.com/apps/${config.github.slug}/installations/new`);
  url.searchParams.set("state", newState(c));
  return c.redirect(url.toString());
});

auth.get("/callback", async (c) => {
  const { code, state, setup_action: setupAction } = c.req.query();
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  // An install started on github.com carries no state of ours: its data arrives by webhook, and the
  // user signs in normally. Signing in on an unverified callback would allow login CSRF.
  if (!state && setupAction) return c.redirect(`${config.dashboardUrl}/login`);
  if (!code || !state || state !== expected) {
    log.warn({ hasCode: Boolean(code), hasState: Boolean(state) }, "sign-in rejected");
    return c.redirect(`${config.dashboardUrl}/login?error=1`);
  }

  try {
    const { authentication } = await githubApp.oauth.createToken({ code });
    const userClient = new Octokit({ auth: authentication.token });
    const { data: me } = await userClient.rest.users.getAuthenticated();
    const user = usersRepo.upsert({ githubId: me.id, login: me.login, name: me.name ?? null, avatarUrl: me.avatar_url });

    const installs = (await userClient.paginate(userClient.rest.apps.listInstallationsForAuthenticatedUser, {
      per_page: 100,
    })) as unknown as GitHubInstallation[];
    for (const installation of installs) await adoptInstallation(installation);
    usersRepo.setAccess(user.id, await readAccess(userClient, me.login, installs));

    startSession(c, user.id);
    log.info({ user: me.login, installations: installs.length, setupAction }, "signed in");
    return c.redirect(`${config.dashboardUrl}/${setupAction ? "repos" : "reviews"}`);
  } catch (err) {
    log.warn({ err: errMessage(err) }, "sign-in failed");
    return c.redirect(`${config.dashboardUrl}/login?error=1`);
  }
});

auth.post("/logout", (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) usersRepo.deleteSession(sessionId);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

/** Local-only sign-in for automated browser checks (DEV_LOGIN=1, never in production). */
auth.get("/dev", async (c) => {
  if (!config.devLogin) return c.json({ error: "Not found." }, 404);
  const login = c.req.query("login");
  if (!login) return c.json({ error: "Missing login." }, 400);
  const installs = installationsRepo.listActive();
  if (!installs.length) return c.json({ error: "No installations yet." }, 400);
  const client = await installationClient(installs[0]!.id);
  const { data: gh } = await client.rest.users.getByUsername({ username: login });
  const user = usersRepo.upsert({ githubId: Number(gh.id), login: gh.login, name: gh.name ?? null, avatarUrl: gh.avatar_url });
  usersRepo.setAccess(user.id, {
    installations: installs.map((i) => ({ installationId: i.id, admin: true })),
    repositories: [],
  });
  startSession(c, user.id);
  return c.redirect(`${config.dashboardUrl}/reviews`);
});
