import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "vendor", "coverage", "__pycache__", ".venv", "target", ".idea", ".vscode"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|swift|scala|ex|exs|c|cc|cpp|h|hpp|vue|svelte|sql|sh)$/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp[34]|wasm|lock)$/i;
const KEY_FILES = [
  /^readme(\.[a-z]+)?$/i,
  /^contributing(\.[a-z]+)?$/i,
  /^(agents|claude|architecture)\.md$/i,
  /^package\.json$/,
  /^pyproject\.toml$/,
  /^requirements[^/]*\.txt$/,
  /^go\.mod$/,
  /^cargo\.toml$/,
  /^pom\.xml$/,
  /^build\.gradle(\.kts)?$/,
  /^gemfile$/i,
  /^composer\.json$/,
  /^tsconfig\.json$/,
  /^dockerfile$/i,
  /^docker-compose[^/]*\.ya?ml$/,
  /^(next|vite|nuxt|astro|svelte)\.config\.[a-z]+$/,
  /^\.env\.example$/,
];
const CENTRAL = /(^|\/)(index|main|app|server|routes?|router|models?|schema|service|handlers?|controllers?|api|db|config)\.[a-z]+$/i;

export type Material = { tree: string; keyFiles: { path: string; text: string }[]; samples: Map<string, { path: string; text: string }[]> };

function listFiles(root: string, max = 20_000): { path: string; size: number }[] {
  const out: { path: string; size: number }[] = [];
  const stack = [root];
  while (stack.length && out.length < max) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
      } else if (e.isFile()) {
        const path = relative(root, full).replace(/\\/g, "/");
        if (!BINARY.test(path)) out.push({ path, size: statSync(full).size });
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function read(root: string, path: string, maxChars: number, maxLines?: number): string {
  try {
    let text = readFileSync(join(root, path), "utf8");
    if (maxLines) text = text.split("\n").slice(0, maxLines).join("\n");
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text;
  } catch {
    return "";
  }
}

/** Picks what a reader needs to understand a repository: its shape, manifests, docs and a few central files per area. */
export function collect(root: string): Material {
  const files = listFiles(root);
  const byDepth = [...files].sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  const treePaths = byDepth.slice(0, 400).map((f) => f.path).sort();
  const tree = `${treePaths.join("\n")}${files.length > 400 ? `\n… and ${files.length - 400} more files` : ""}`;

  const keyFiles = files
    .filter((f) => f.path.split("/").length <= 2 && KEY_FILES.some((re) => re.test(f.path.split("/").pop()!)))
    .slice(0, 14)
    .map((f) => ({ path: f.path, text: read(root, f.path, 6000) }));

  const samples = new Map<string, { path: string; text: string }[]>();
  const code = files.filter((f) => CODE.test(f.path) && f.size < 200_000);
  const areaOf = (path: string) => {
    const parts = path.split("/");
    if (parts.length === 1) return ".";
    if (["src", "app", "lib", "packages", "apps", "services", "internal", "pkg", "cmd"].includes(parts[0]!) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
    return parts[0]!;
  };
  const areas = new Map<string, { path: string; size: number }[]>();
  for (const f of code) areas.set(areaOf(f.path), [...(areas.get(areaOf(f.path)) ?? []), f]);
  const ranked = [...areas].sort((a, b) => b[1].length - a[1].length).slice(0, 24);
  for (const [area, list] of ranked) {
    const picks = [...list].sort((a, b) => Number(CENTRAL.test(b.path)) - Number(CENTRAL.test(a.path)) || a.size - b.size).slice(0, 3);
    samples.set(area, picks.map((p) => ({ path: p.path, text: read(root, p.path, 5000, 120) })));
  }
  return { tree, keyFiles, samples };
}
