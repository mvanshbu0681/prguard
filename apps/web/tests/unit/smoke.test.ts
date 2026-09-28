// OWNER: T0 (wave 0). Proves the harness (jsdom, jest-dom, @/ alias) and pins
// the seed contracts later tracks build on.
import { describe, expect, it } from "vitest";
import { API_BASE, FIXTURES } from "@/lib/env";
import { SEVERITY_INPUTS, SEVERITY_THRESHOLDS, STAGES } from "@/lib/contracts";
import { cn } from "@/lib/utils";

describe("seed", () => {
  it("runs in jsdom with jest-dom matchers", () => {
    const el = document.createElement("section");
    el.setAttribute("data-stub", "");
    document.body.append(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-stub");
  });

  it("defaults to fixture mode and a local API", () => {
    expect(FIXTURES).toBe(process.env.NEXT_PUBLIC_FIXTURES !== "0");
    expect(API_BASE).toBe(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000");
  });

  it("keeps the frozen contract order", () => {
    expect(SEVERITY_INPUTS).toEqual(["path_sensitivity", "reachability", "blast_radius", "coverage_gap", "proof_confidence", "churn"]);
    expect(STAGES).toHaveLength(9);
    expect(Object.values(SEVERITY_THRESHOLDS)).toEqual([0.15, 0.35, 0.55, 0.75]);
  });

  it("merges Witness theme scales in cn()", () => {
    expect(cn("rounded-md", "rounded-data")).toBe("rounded-data");
    expect(cn("shadow-palette", "shadow-modal")).toBe("shadow-modal");
    expect(cn("ease-snap", "ease-instrument")).toBe("ease-instrument");
    expect(cn("type-body", "type-label")).toBe("type-label");
    expect(cn("bg-ink-1", "bg-ink-2")).toBe("bg-ink-2");
    expect(cn("text-text-body", "text-sm")).toBe("text-text-body text-sm");
  });
});
