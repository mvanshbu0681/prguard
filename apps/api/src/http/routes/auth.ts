import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Octokit } from "octokit";
import { config } from "../../config.ts";
import * as installationsRepo from "../../db/repos/installations.ts";
import * as usersRepo from "../../db/repos/users.ts";
import { githubApp, installationClient } from "../../github/app.ts";
import { saveInstallation, syncInstallation, type GitHubInstallation } from "../../github/reconcile.ts";
import { queueBrief } from "../../brief/index-repo.ts";
import * as repositoriesRepo from "../../db/repos/repositories.ts";
import { errMessage, log } from "../../log.ts";
import { isHttps, SESSION_COOKIE } from "../session.ts";

const STATE_COOKIE = "pg_oauth_state";

export const auth = new Hono();

function startSession(c: Parameters<typeof setCookie>[0], userId: number, secure: boolean): void {
  const session = usersRepo.createSession(userId, config.sessionDays);
  setCookie(c, SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: config.sessionDays * 86_400,
  });
}

/** Makes sure a newly seen installation and its repos are stored, and briefs are on their way. */
async function adoptInstallation(installation: GitHubInstallation): Promise<void> {
  const known = installationsRepo.get(installation.id);
  saveInstallation(installation);
  if (known && !known.deletedAt) return;
  const repoIds = await syncInstallation(installation.id);
  for (const id of repoIds) if (repositoriesRepo.get(id)?.briefStatus === "none") queueBrief(id);
}

auth.get("/login", (c) => {
  const state = randomBytes(16).toString("hex");
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: "Lax", secure: isHttps(c), path: "/", maxAge: 600 });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.github.clientId);
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
});

auth.get("/callback", async (c) => {
  const { code, state, installation_id: installationId, setup_action: setupAction } = c.req.query();
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  const fail = (reason: string) => {
    log.warn({ reason }, "sign-in failed");
    return c.redirect(`${config.dashboardUrl}/login?error=1`);
  };
  if (!code) return fail("no code");
  // GitHub's install flow starts on github.com, so it carries no state; a sign-in we started must match ours.
  if (state ? state !== expected : !installationId) return fail("state mismatch");

  try {
    const { authentication } = await githubApp.oauth.createToken({ code });
    const userClient = new Octokit({ auth: authentication.token });
    const { data: me } = await userClient.rest.users.getAuthenticated();
    const user = usersRepo.upsert({ githubId: me.id, login: me.login, name: me.name ?? null, avatarUrl: me.avatar_url });

    const installs = (await userClient.paginate(userClient.rest.apps.listInstallationsForAuthenticatedUser, { per_page: 100 })) as unknown as GitHubInstallation[];
    for (const installation of installs) await adoptInstallation(installation);
    usersRepo.setInstallations(
      user.id,
      installs.map((i) => i.id),
    );

    startSession(c, user.id, isHttps(c));
    log.info({ user: me.login, installations: installs.length, setupAction }, "signed in");
    return c.redirect(`${config.dashboardUrl}/${setupAction === "install" || setupAction === "update" ? "repos" : "reviews"}`);
  } catch (err) {
    return fail(errMessage(err));
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
  usersRepo.setInstallations(
    user.id,
    installationsRepo.listActive().map((i) => i.id),
  );
  startSession(c, user.id, isHttps(c));
  return c.redirect(`${config.dashboardUrl}/reviews`);
});
