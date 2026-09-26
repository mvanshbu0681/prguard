// OWNER: t7 (wave 2). ./state.ts: mapping a polled ReviewStatus onto nine StageState values
// (dashboard-blueprint §2.4, §5.1) and the "<= 6 animated edges" cap (motion-spec §4.7).
import { describe, expect, it } from "vitest";
import { STAGES, type StageState } from "@/lib/contracts";
import { animatedEdgeCount, stageStatesFromReviewStatus, type ReviewStatusLike } from "@/components/evidence/StageRail/state";

function statesOf(status: ReviewStatusLike): Record<string, StageState> {
  return Object.fromEntries(stageStatesFromReviewStatus(status).map((s) => [s.key, s.state]));
}

describe("stageStatesFromReviewStatus", () => {
  it("queued, nothing reached: every stage pending", () => {
    const states = statesOf({ status: "queued", stage_index: null, stage_total: 9 });
    expect(Object.values(states)).toEqual(STAGES.map(() => "pending"));
  });

  it("running at stage 3: stages 1-2 done, 3 running, 4-9 pending", () => {
    const states = statesOf({ status: "running", stage_index: 3, stage_total: 9, seconds_since_heartbeat: 2 });
    expect(states.ingest).toBe("done");
    expect(states.context).toBe("done");
    expect(states.specialists).toBe("running");
    expect(states.coordinator).toBe("pending");
    expect(states.finalise).toBe("pending");
  });

  it("running with a stale heartbeat (> 20s): the current stage reads degraded, not running", () => {
    const fresh = statesOf({ status: "running", stage_index: 3, stage_total: 9, seconds_since_heartbeat: 19.9 });
    expect(fresh.specialists).toBe("running");
    const stale = statesOf({ status: "running", stage_index: 3, stage_total: 9, seconds_since_heartbeat: 20.1 });
    expect(stale.specialists).toBe("degraded");
    // stale telemetry never touches stages that have already completed or not started.
    expect(stale.context).toBe("done");
    expect(stale.coordinator).toBe("pending");
  });

  it("succeeded: every stage done, regardless of what stage_index last said", () => {
    const states = statesOf({ status: "succeeded", stage_index: 5, stage_total: 9 });
    expect(Object.values(states)).toEqual(STAGES.map(() => "done"));
  });

  it("failed at stage 7: 1-6 done, 7 failed, 8-9 pending — never running", () => {
    const states = statesOf({ status: "failed", stage_index: 7, stage_total: 9, seconds_since_heartbeat: 0 });
    expect(states.identity).toBe("done");
    expect(states.proof).toBe("failed");
    expect(states.delivery).toBe("pending");
    expect(states.finalise).toBe("pending");
  });

  it("cancelled reads the same shape as failed — a terminal problem at that stage", () => {
    const states = statesOf({ status: "cancelled", stage_index: 2, stage_total: 9 });
    expect(states.ingest).toBe("done");
    expect(states.context).toBe("failed");
    expect(states.specialists).toBe("pending");
  });

  it("a shorter stage_total than STAGES.length never invents a stage beyond it", () => {
    const states = statesOf({ status: "running", stage_index: 2, stage_total: 4 });
    expect(states.coordinator).toBe("pending"); // stage 4, still reachable
    expect(states.severity).toBe("pending"); // stage 5, beyond stage_total — still pending, never done
  });

  it("stage_index 0 or null while running/queued: nothing has started yet", () => {
    expect(statesOf({ status: "running", stage_index: 0, stage_total: 9 }).ingest).toBe("pending");
    expect(statesOf({ status: "running", stage_index: null, stage_total: 9 }).ingest).toBe("pending");
  });

  it("covers every StageState the mapper can produce across the run's lifecycle", () => {
    const seen = new Set<StageState>();
    for (const s of Object.values(statesOf({ status: "queued", stage_index: 0, stage_total: 9 }))) seen.add(s);
    for (const s of Object.values(statesOf({ status: "running", stage_index: 3, stage_total: 9, seconds_since_heartbeat: 1 }))) seen.add(s);
    for (const s of Object.values(statesOf({ status: "running", stage_index: 3, stage_total: 9, seconds_since_heartbeat: 30 }))) seen.add(s);
    for (const s of Object.values(statesOf({ status: "succeeded", stage_index: 9, stage_total: 9 }))) seen.add(s);
    for (const s of Object.values(statesOf({ status: "failed", stage_index: 5, stage_total: 9 }))) seen.add(s);
    expect([...seen].sort()).toEqual(["degraded", "done", "failed", "pending", "running"].sort());
  });
});

describe("animatedEdgeCount — the <= 6 simultaneous-animation cap (motion-spec §4.7)", () => {
  it("a plain stage running or degraded animates exactly one edge", () => {
    for (const key of STAGES.filter((k) => k !== "specialists")) {
      expect(animatedEdgeCount([{ key, state: "running" }])).toBe(1);
      expect(animatedEdgeCount([{ key, state: "degraded" }])).toBe(1);
    }
  });

  it("specialists running or degraded animates its four fork lanes as four edges", () => {
    expect(animatedEdgeCount([{ key: "specialists", state: "running" }])).toBe(4);
    expect(animatedEdgeCount([{ key: "specialists", state: "degraded" }])).toBe(4);
  });

  it("pending / done / failed never count as animated", () => {
    expect(animatedEdgeCount(STAGES.map((key) => ({ key, state: "pending" as const })))).toBe(0);
    expect(animatedEdgeCount(STAGES.map((key) => ({ key, state: "done" as const })))).toBe(0);
    expect(animatedEdgeCount(STAGES.map((key) => ({ key, state: "failed" as const })))).toBe(0);
  });

  it("stays at or under 6 for every reachable state of a real run, every stage_index", () => {
    for (let stageIndex = 0; stageIndex <= STAGES.length; stageIndex++) {
      for (const heartbeat of [1, 25]) {
        const running = stageStatesFromReviewStatus({ status: "running", stage_index: stageIndex, stage_total: 9, seconds_since_heartbeat: heartbeat });
        expect(animatedEdgeCount(running)).toBeLessThanOrEqual(6);
      }
      const failed = stageStatesFromReviewStatus({ status: "failed", stage_index: stageIndex, stage_total: 9 });
      expect(animatedEdgeCount(failed)).toBeLessThanOrEqual(6);
    }
  });
});
