import { describe, expect, it } from "vitest";
import { GATE_DELIVERIES } from "@/lib/contracts";
import { gateLadder } from "./gate-ladder";

describe("gateLadder", () => {
  it("has three rungs in GATE_DELIVERIES order", () => {
    const rungs = gateLadder("commit_status");
    expect(rungs.map((r) => r.delivery)).toEqual([...GATE_DELIVERIES]);
  });

  it("marks only the rung matching the fired delivery, matching the demo run's own gate (commit_status, not check_run)", () => {
    const rungs = gateLadder("commit_status");
    expect(rungs.find((r) => r.delivery === "commit_status")?.fired).toBe(true);
    expect(rungs.find((r) => r.delivery === "check_run")?.fired).toBe(false);
    expect(rungs.find((r) => r.delivery === "dry_run")?.fired).toBe(false);
  });

  it("marks nothing fired when the gate has no delivery", () => {
    expect(gateLadder(undefined).every((r) => !r.fired)).toBe(true);
    expect(gateLadder(null).every((r) => !r.fired)).toBe(true);
  });
});
