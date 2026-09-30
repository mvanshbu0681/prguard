import type { Hono } from "hono";
import * as deliveriesRepo from "../db/repos/deliveries.ts";
import * as installationsRepo from "../db/repos/installations.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as usersRepo from "../db/repos/users.ts";
import { errMessage, log } from "../log.ts";
import { queueBrief } from "../brief/index-repo.ts";
import { cancelRepoWork } from "../review/lifecycle.ts";
import { githubApp } from "./app.ts";
import { saveInstallation, saveRepos, type GitHubInstallation, type GitHubRepo } from "./reconcile.ts";

// Payloads are typed loosely on purpose: only the fields read below are relied on.
type Payload = any;
type Handler = (payload: Payload) => Promise<void> | void;

const handlers = new Map<string, Handler>();

export function on(event: string, handler: Handler): void {
  handlers.set(event, handler);
}

export function registerWebhookRoute(app: Hono): void {
  app.post("/api/webhooks", async (c) => {
    const body = await c.req.text();
    const signature = c.req.header("x-hub-signature-256") ?? "";
    const event = c.req.header("x-github-event") ?? "";
    const delivery = c.req.header("x-github-delivery") ?? "";

    if (!signature || !(await githubApp.webhooks.verify(body, signature).catch(() => false))) {
      log.warn({ event, delivery }, "webhook signature rejected");
      return c.json({ error: "Invalid signature." }, 401);
    }

    const payload = JSON.parse(body) as Payload;
    const action: string | null = payload.action ?? null;
    if (delivery && !deliveriesRepo.record(delivery, event, action)) {
      log.info({ event, action, delivery }, "duplicate webhook ignored");
      return c.json({ ok: true, duplicate: true });
    }

    const handler = handlers.get(event);
    if (handler) {
      setImmediate(() => {
        Promise.resolve(handler(payload)).catch((err) =>
          log.error({ event, action, delivery, err: errMessage(err) }, "webhook handler failed"),
        );
      });
    }
    log.info({ event, action, delivery, handled: Boolean(handler) }, "webhook received");
    return c.json({ ok: true });
  });
}

on("installation", (payload) => {
  const installation = payload.installation as GitHubInstallation;
  switch (payload.action) {
    case "created": {
      saveInstallation(installation);
      const repos = (payload.repositories ?? []) as GitHubRepo[];
      saveRepos(installation.id, repos);
      for (const repo of repos) queueBrief(repo.id);
      // Whoever installed it can see it straight away, even before their next sign-in.
      const installer = payload.sender?.id ? usersRepo.getByGithubId(payload.sender.id) : undefined;
      if (installer) usersRepo.addInstallation(installer.id, installation.id, true);
      break;
    }
    case "deleted": {
      installationsRepo.markDeleted(installation.id);
      const removed = repositoriesRepo.markRemovedForInstallation(installation.id);
      return cancelRepoWork(removed, "removed");
    }
    case "suspend":
      installationsRepo.setSuspended(installation.id, true);
      break;
    case "unsuspend":
      installationsRepo.setSuspended(installation.id, false);
      break;
    default:
      saveInstallation(installation);
  }
});

on("installation_repositories", (payload) => {
  const installationId: number = payload.installation.id;
  if (!installationsRepo.get(installationId)) saveInstallation(payload.installation as GitHubInstallation);
  const added = (payload.repositories_added ?? []) as GitHubRepo[];
  const removed = (payload.repositories_removed ?? []) as GitHubRepo[];
  if (added.length) {
    saveRepos(installationId, added);
    for (const repo of added) queueBrief(repo.id);
  }
  if (removed.length) {
    repositoriesRepo.markRemoved(removed.map((r) => r.id));
    return cancelRepoWork(
      removed.map((r) => r.id),
      "removed",
    );
  }
});
