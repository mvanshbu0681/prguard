// The audit log's derived model (pure, no React).
import { describe, expect, it } from "vitest";
import { LosslessNumber } from "@/api/lossless";
import { actorMix, actorView, dailyActivity, dayLabel, describe as describeEvent, familyOf, parseSearch, tamperEdit, typeLabel, type AuditEvent } from "@/components/routes/audit";

const ev = (over: Partial<AuditEvent>): AuditEvent => ({
  seq: 1,
  event_type: "review.requested",
  actor_type: "system",
  actor_id: "pipeline",
  payload: {},
  created_at: "2026-09-23T10:00:00Z",
  event_hash: "a".repeat(64),
  prev_hash: null,
  ...over,
});

describe("families and labels", () => {
  it("groups the seventeen event types into what a reader filters by", () => {
    expect(familyOf("review.stage_completed")).toBe("runs");
    expect(familyOf("finding.suppressed")).toBe("findings");
    expect(familyOf("proof.executed")).toBe("proofs");
    expect(familyOf("gate.delivered")).toBe("gates");
    expect(familyOf("suppression.revoked")).toBe("suppressions");
    expect(familyOf("override.break_glass")).toBe("overrides");
    expect(typeLabel("finding.disproven")).toBe("Finding refuted");
    expect(typeLabel("some.new_type")).toBe("Some new type");
  });
  it("writes one plain sentence per payload, never inventing missing fields", () => {
    expect(describeEvent(ev({ event_type: "review.stage_completed", payload: { stage: "ingest", stage_index: 1, stage_total: 9, duration_ms: 1016 } }))).toBe("1/9 ingest in 1.0s");
    expect(describeEvent(ev({ event_type: "finding.proposed", payload: { rule_key: "unguarded_none_attribute", file_path: "app/x.py", severity_band: "critical", severity_score: new LosslessNumber("0.81") } }))).toBe(
      "unguarded none attribute · app/x.py · critical 0.81",
    );
    expect(describeEvent(ev({ event_type: "proof.executed", payload: { proof_status: "proven", base_exit_code: 0, head_exit_code: 1 } }))).toBe("proven · base exit 0 · head exit 1");
    expect(describeEvent(ev({ event_type: "finding.proposed", payload: {} }))).toBe("");
  });
});

describe("actors", () => {
  it("tells a person, Witness itself and the pipeline apart", () => {
    expect(actorView(ev({ actor_type: "human", actor_id: "sana-q" }))).toMatchObject({ kind: "human", name: "sana-q" });
    expect(actorView(ev({ actor_type: "ai", actor_id: "specialist:bugs:claude-sonnet-5" }))).toMatchObject({ kind: "witness", name: "witness[bot]", detail: "bugs specialist · claude-sonnet-5" });
    expect(actorView(ev({ actor_type: "system", actor_id: "proof-runner:docker" }))).toMatchObject({ kind: "system", name: "proof-runner", detail: "docker", glyph: "proof" });
  });
  it("tallies the mix and ranks people by actions", () => {
    const mix = actorMix([ev({ actor_type: "human", actor_id: "a" }), ev({ actor_type: "human", actor_id: "b" }), ev({ actor_type: "human", actor_id: "b" }), ev({ actor_type: "ai", actor_id: "specialist:x:y" }), ev({})]);
    expect([mix.human, mix.witness, mix.system]).toEqual([3, 1, 1]);
    expect(mix.people[0]).toEqual({ name: "b", count: 2 });
  });
});

describe("search", () => {
  it("reads #n or n as a seq, 4+ hex characters as a hash prefix, anything else as text", () => {
    expect(parseSearch("#1428")).toEqual({ kind: "seq", seq: 1428 });
    expect(parseSearch("1384")).toEqual({ kind: "seq", seq: 1384 });
    expect(parseSearch("8dbdc96d")).toEqual({ kind: "hash", prefix: "8dbdc96d" });
    expect(parseSearch("break glass")).toEqual({ kind: "text", text: "break glass" });
    expect(parseSearch("  ")).toEqual({ kind: "none" });
  });
});

describe("activity", () => {
  it("bins events per UTC day, ending at the newest event's day", () => {
    const days = dailyActivity([ev({ created_at: "2026-09-23T10:00:00Z" }), ev({ created_at: "2026-09-23T11:00:00Z" }), ev({ created_at: "2026-09-21T01:00:00Z" })], 3);
    expect(days).toEqual([
      { day: "2026-09-21", count: 1 },
      { day: "2026-09-22", count: 0 },
      { day: "2026-09-23", count: 2 },
    ]);
    expect(dayLabel("2026-09-23")).toBe("Wed 23 Sep");
    expect(dayLabel("2026-09-23", false)).toBe("23 Sep");
  });
});

describe("tamperEdit", () => {
  it("downgrades a severity, flips a gate, or buries a proof — on a copy, never the original", () => {
    const original = ev({ event_type: "finding.proposed", payload: { severity_band: "critical" } });
    const edit = tamperEdit(original);
    expect(edit).toMatchObject({ field: "payload.severity_band", from: "critical", to: "low" });
    expect((edit.event.payload as { severity_band: string }).severity_band).toBe("low");
    expect((original.payload as { severity_band: string }).severity_band).toBe("critical");
    expect(tamperEdit(ev({ payload: { conclusion: "failure" } }))).toMatchObject({ field: "payload.conclusion", to: "success" });
    expect(tamperEdit(ev({ payload: { proof_status: "proven" } }))).toMatchObject({ field: "payload.proof_status", to: "disproven" });
    expect(tamperEdit(ev({ payload: {} }))).toMatchObject({ field: "actor_id", from: "pipeline" });
  });
});
