import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileDiff } from "../diff.ts";

export type Ecosystem = "npm" | "pypi" | "golang";

/** A dependency this pull request adds or changes, and the manifest line that does it. */
export type Dependency = { ecosystem: Ecosystem; name: string; version: string; path: string; line: number };

const NPM_BLOCKS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
/** Top-level `package.json` fields that look like `"name": "value"` but are not dependencies. */
const PACKAGE_FIELDS = new Set(["name", "version", "description", "main", "module", "types", "type", "license", "author", "homepage", "packageManager"]);

export function isManifest(path: string): boolean {
  const name = path.split("/").pop()!.toLowerCase();
  return name === "package.json" || name === "go.mod" || name === "pyproject.toml" || /^requirements[^/]*\.txt$/.test(name);
}

/** The lowest version a range allows, as far as it can be read (`^1.2.0`, `>=1.2`, `~1.2.3`). */
export function lowestVersion(spec: string): string | null {
  const m = /(\d+(?:\.\d+){0,3}(?:[-+.][0-9A-Za-z.-]+)?)/.exec(spec.trim());
  return m ? m[1]! : null;
}

function added(file: FileDiff): { line: number; text: string }[] {
  return file.hunks.flatMap((h) => h.lines.filter((l) => l.kind === "add" && l.newNo !== null).map((l) => ({ line: l.newNo!, text: l.text })));
}

function readHead(snapshot: string | null, path: string): string | null {
  if (!snapshot) return null;
  try {
    return readFileSync(join(snapshot, path), "utf8");
  } catch {
    return null;
  }
}

function npm(file: FileDiff, snapshot: string | null): Dependency[] {
  // Added lines only name the package; the head file says which block it is in and its range.
  let declared = new Map<string, string>();
  const head = readHead(snapshot, file.path);
  if (head) {
    try {
      const json = JSON.parse(head) as Record<string, Record<string, string> | undefined>;
      declared = new Map(NPM_BLOCKS.flatMap((b) => Object.entries(json[b] ?? {})));
    } catch {
      // A package.json that does not parse: fall back to the added lines alone.
    }
  }
  const out: Dependency[] = [];
  for (const { line, text } of added(file)) {
    const m = /^\s*"(@?[a-z0-9][\w.\-/]*)"\s*:\s*"([^"]+)"/i.exec(text);
    if (!m) continue;
    const [, name, spec] = m;
    if (declared.size ? !declared.has(name!) : PACKAGE_FIELDS.has(name!)) continue;
    const range = declared.get(name!) ?? spec!;
    if (/^(file|link|git|github|workspace|https?):/.test(range)) continue;
    const version = lowestVersion(range);
    if (version) out.push({ ecosystem: "npm", name: name!, version, path: file.path, line });
  }
  return out;
}

function requirements(file: FileDiff): Dependency[] {
  const out: Dependency[] = [];
  for (const { line, text } of added(file)) {
    const clean = text.replace(/#.*$/, "").trim();
    if (!clean || clean.startsWith("-") || /:\/\//.test(clean)) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(==|>=|~=|<=|===|>)\s*([^\s,;]+)/.exec(clean);
    if (!m) continue;
    const version = lowestVersion(m[3]!);
    if (version) out.push({ ecosystem: "pypi", name: m[1]!.toLowerCase().replace(/_/g, "-"), version, path: file.path, line });
  }
  return out;
}

function pyproject(file: FileDiff): Dependency[] {
  const out: Dependency[] = [];
  for (const { line, text } of added(file)) {
    // PEP 621: "requests>=2.19"; Poetry: requests = "^2.19"
    const pep = /^\s*"([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(==|>=|~=|<=)\s*([^",;\s]+)/.exec(text);
    const poetry = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*"([^"]+)"/.exec(text);
    const name = pep?.[1] ?? poetry?.[1];
    const spec = pep?.[3] ?? poetry?.[2];
    if (!name || !spec || name.toLowerCase() === "python") continue;
    const version = lowestVersion(spec);
    if (version) out.push({ ecosystem: "pypi", name: name.toLowerCase().replace(/_/g, "-"), version, path: file.path, line });
  }
  return out;
}

function gomod(file: FileDiff): Dependency[] {
  const out: Dependency[] = [];
  for (const { line, text } of added(file)) {
    const m = /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)\s+(v[^\s]+)/i.exec(text);
    if (m) out.push({ ecosystem: "golang", name: m[1]!, version: m[2]!, path: file.path, line });
  }
  return out;
}

/** Dependencies added or changed by the PR's manifests. Removed lines are never looked up. */
export function dependencies(files: FileDiff[], snapshot: string | null): Dependency[] {
  const out: Dependency[] = [];
  for (const file of files) {
    const name = file.path.split("/").pop()!.toLowerCase();
    if (name === "package.json") out.push(...npm(file, snapshot));
    else if (name === "go.mod") out.push(...gomod(file));
    else if (name === "pyproject.toml") out.push(...pyproject(file));
    else if (/^requirements[^/]*\.txt$/.test(name)) out.push(...requirements(file));
  }
  const seen = new Set<string>();
  return out.filter((d) => {
    const key = `${d.ecosystem}:${d.name}@${d.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function purl(dep: Pick<Dependency, "ecosystem" | "name" | "version">): string {
  const name = dep.ecosystem === "npm" ? dep.name.replace(/^@/, "%40") : dep.name;
  return `pkg:${dep.ecosystem}/${name}@${dep.version}`;
}
