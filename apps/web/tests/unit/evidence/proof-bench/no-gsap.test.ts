// OWNER: t4 (wave 2). src/components/evidence/** ships on both surfaces (dashboard included),
// so it must never import gsap or '@/motion/useReplay' (marketing-only, GSAP-backed) — that
// would drag GSAP into the dashboard bundle. The replay is built on useSequence instead.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(import.meta.dirname, "..", "..", "..", "..", "src", "components", "evidence", "ProofBench");

function sourceFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .map((f) => join(DIR, f));
}

describe("ProofBench never imports gsap or useReplay", () => {
  const files = sourceFiles();

  it("found the component's source files (the test isn't accidentally checking nothing)", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith("ProofBench.tsx"))).toBe(true);
  });

  it.each(files)("%s carries no gsap or useReplay import", (file) => {
    const text = readFileSync(file, "utf8");
    // Match actual import/require syntax only — this file's own comments are allowed to
    // NAME "@/motion/useReplay" while explaining why it is never imported.
    expect(text).not.toMatch(/from\s+["']gsap/);
    expect(text).not.toMatch(/require\(\s*["']gsap/);
    expect(text).not.toMatch(/from\s+["']@\/motion\/useReplay["']/);
    expect(text).not.toMatch(/from\s+["']@\/motion\/GsapRuntime["']/);
    expect(text).not.toMatch(/require\(\s*["']@\/motion\/(useReplay|GsapRuntime)["']/);
  });
});
