import { App, Octokit } from "octokit";
import { config } from "../config.ts";
import { log } from "../log.ts";

const octoLog = log.child({ mod: "octokit" });

export const githubApp = new App({
  appId: config.github.appId,
  privateKey: config.github.privateKey,
  oauth: { clientId: config.github.clientId, clientSecret: config.github.clientSecret },
  webhooks: { secret: config.github.webhookSecret },
  log: {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => octoLog.warn(msg),
    error: (msg: string) => octoLog.error(msg),
  },
});

export type GitHub = Octokit;

export function installationClient(installationId: number): Promise<GitHub> {
  return githubApp.getInstallationOctokit(installationId) as Promise<GitHub>;
}

export async function installationToken(gh: GitHub): Promise<string> {
  const auth = (await gh.auth({ type: "installation" })) as { token: string };
  return auth.token;
}

export function splitFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  return { owner: owner!, repo: repo! };
}
