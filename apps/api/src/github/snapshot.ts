import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { x as extract } from "tar";
import { config } from "../config.ts";
import { log } from "../log.ts";
import { installationToken, type GitHub } from "./app.ts";

const MAX_TARBALL_BYTES = 400 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const KEEP_PER_REPO = 4;
const SKIP_DIRS = /(^|\/)(node_modules|\.git|vendor|dist|build|\.next|coverage|__pycache__|\.venv)(\/|$)/;

const inflight = new Map<string, Promise<string | null>>();

/**
 * A read-only copy of the repository at `sha`, extracted from GitHub's tarball. Shared between jobs:
 * extracted into a temp folder, then renamed into place. Returns null when the repo is too large.
 */
export function getSnapshot(gh: GitHub, repositoryId: number, fullName: string, sha: string): Promise<string | null> {
  const key = `${repositoryId}@${sha}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = fetchSnapshot(gh, repositoryId, fullName, sha).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function fetchSnapshot(gh: GitHub, repositoryId: number, fullName: string, sha: string): Promise<string | null> {
  const repoDir = join(config.dataDir, "snapshots", String(repositoryId));
  const dir = join(repoDir, sha);
  if (existsSync(dir)) return dir;

  const token = await installationToken(gh);
  const res = await fetch(`https://api.github.com/repos/${fullName}/tarball/${sha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "prguard" },
    redirect: "follow",
  });
  if (!res.ok || !res.body) throw new Error(`Tarball download failed: ${res.status}`);
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_TARBALL_BYTES) {
    log.warn({ repo: fullName, size }, "repository too large to snapshot");
    await res.body.cancel();
    return null;
  }

  const tmp = `${dir}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(tmp, { recursive: true });
  try {
    await pipeline(
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
      extract({
        cwd: tmp,
        strip: 1,
        filter: (path, entry) => {
          const e = entry as { type?: string; size?: number };
          if (e.type === "SymbolicLink" || e.type === "Link") return false;
          if ((e.size ?? 0) > MAX_FILE_BYTES) return false;
          return !SKIP_DIRS.test(path.replace(/\\/g, "/"));
        },
      }),
    );
    try {
      await rename(tmp, dir);
    } catch {
      await rm(tmp, { recursive: true, force: true });
    }
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    throw err;
  }
  void prune(repoDir, sha);
  return dir;
}

async function prune(repoDir: string, keep: string): Promise<void> {
  try {
    const entries = await readdir(repoDir);
    const dirs = await Promise.all(
      entries.filter((e) => !e.includes(".tmp-")).map(async (e) => ({ e, t: (await stat(join(repoDir, e))).mtimeMs })),
    );
    dirs.sort((a, b) => b.t - a.t);
    for (const { e } of dirs.slice(KEEP_PER_REPO)) if (e !== keep) await rm(join(repoDir, e), { recursive: true, force: true });
  } catch {
    // Pruning is best effort.
  }
}
