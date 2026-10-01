import type { FileDiff } from "./diff.ts";

export type FileKind = "source" | "test" | "config" | "docs";

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "poetry.lock",
  "uv.lock",
  "pipfile.lock",
  "cargo.lock",
  "go.sum",
  "gemfile.lock",
  "composer.lock",
  "packages.lock.json",
  "pubspec.lock",
  "flake.lock",
]);

const GENERATED = [
  /(^|\/)(dist|build|out|coverage|\.next|node_modules|vendor|third_party|__generated__|generated)\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.(pb|pb\.gw)\.go$/,
  /_pb2(_grpc)?\.py$/,
  /\.snap$/,
  /\.lock$/,
];

const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|svgz|pdf|zip|gz|tgz|jar|woff2?|ttf|otf|eot|mp[34]|mov|wasm|so|dll|exe|bin|psd|sqlite|db)$/i;
const DOCS = /(\.(md|mdx|markdown|rst|txt|adoc)$)|(^|\/)(docs?|documentation)\/|(^|\/)(license|licence|changelog|authors|codeowners)(\.[a-z]+)?$/i;
const TESTS = /(^|\/)(tests?|__tests__|spec|specs|e2e)\/|[._-](test|spec)\.[a-z0-9]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
const CONFIG = /\.(json|ya?ml|toml|ini|cfg|conf|env\.example|properties|xml|gradle|lock)$|(^|\/)(dockerfile|makefile|\.github\/|\.gitignore|\.dockerignore|\.editorconfig|\.eslintrc|\.prettierrc)/i;

/** Dependency manifests that would otherwise look like docs (`requirements.txt`). */
const MANIFEST = /(^|\/)(requirements[^/]*\.txt|go\.mod)$/;

export function fileKind(path: string): FileKind {
  const p = path.toLowerCase();
  if (MANIFEST.test(p)) return "config";
  if (DOCS.test(p)) return "docs";
  if (TESTS.test(p)) return "test";
  if (CONFIG.test(p)) return "config";
  return "source";
}

export const KIND_PRIORITY: Record<FileKind, number> = { source: 0, test: 1, config: 2, docs: 3 };

/** Why a file is not worth reviewing, or null when it is. */
export function skipReason(file: FileDiff): string | null {
  const p = file.path.toLowerCase();
  const name = p.split("/").pop() ?? p;
  if (file.status === "removed") return "deleted";
  if (LOCKFILES.has(name)) return "lockfile";
  if (BINARY.test(p)) return "binary";
  if (GENERATED.some((re) => re.test(p))) return "generated";
  if (!file.hasPatch) return file.additions + file.deletions > 0 ? "diff too large" : "no changes";
  if (!file.hunks.some((h) => h.lines.some((l) => l.kind === "add"))) return "only deletions";
  return null;
}

export type Classified = {
  reviewable: FileDiff[];
  skipped: { path: string; reason: string }[];
  docsOnly: boolean;
};

export function classify(files: FileDiff[]): Classified {
  const reviewable: FileDiff[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const file of files) {
    const reason = skipReason(file);
    if (reason) skipped.push({ path: file.path, reason });
    else reviewable.push(file);
  }
  const docsOnly = reviewable.length > 0 && reviewable.every((f) => fileKind(f.path) === "docs");
  return { reviewable, skipped, docsOnly };
}
