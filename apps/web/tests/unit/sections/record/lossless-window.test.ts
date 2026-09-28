// @vitest-environment node
// OWNER: m5 (wave 3). Brief "TESTS": the seq-1428 payload keeps '1.0' — the exact
// window <FlightRecorderPanel> renders (manifest.ids.tamper_demo_seq ± the panel's
// default before/after), read and parsed exactly as the client component does
// (parseLosslessJson over getAuditEventsText()'s raw text — never getAuditChain(),
// which has already been through JSON.parse and would silently turn every "1.0" in
// this window's severity_inputs into the plain number 1, the false-break bug plan A8
// exists to prevent).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLosslessNumber, parseLosslessJson } from "@/api/lossless";
import { windowAroundSeq } from "@/components/sections/record/build-view";

interface RawAuditEvent {
  seq: number;
  payload?: Record<string, unknown>;
}
interface RawAuditFile {
  items: RawAuditEvent[];
}

const rawText = readFileSync(join(process.cwd(), "public", "fixtures", "audit", "events.json"), "utf8");
const TAMPER_DEMO_SEQ = 1428; // manifest.ids.tamper_demo_seq (plan A10, this repo's fixed demo identifiers)
const BEFORE = 3;
const AFTER = 2; // FlightRecorderPanel's defaults — six events total

function windowOf(items: RawAuditEvent[]): RawAuditEvent[] {
  return windowAroundSeq(items, TAMPER_DEMO_SEQ, BEFORE, AFTER);
}

describe("the section 07 window, parsed losslessly", () => {
  it("is six events, matching the copy ('Six real events')", () => {
    const file = parseLosslessJson(rawText) as RawAuditFile;
    expect(windowOf(file.items)).toHaveLength(6);
  });

  it("keeps '1.0' as a LosslessNumber whose lexeme is exactly '1.0' — never the plain number 1", () => {
    const file = parseLosslessJson(rawText) as RawAuditFile;
    const proposed = windowOf(file.items).find((e) => e.seq === TAMPER_DEMO_SEQ);
    expect(proposed).toBeDefined();

    const inputs = (proposed!.payload as { severity_inputs?: Record<string, unknown> }).severity_inputs;
    expect(inputs).toBeDefined();

    // The real fixture's reachability, path_sensitivity and proof_confidence are all
    // written as the float lexeme "1.0" (never a bare "1") — assert every one of them.
    const oneDotZeroFields = ["reachability", "path_sensitivity", "proof_confidence"] as const;
    for (const field of oneDotZeroFields) {
      const value = inputs![field];
      expect(isLosslessNumber(value), `${field} should be a LosslessNumber, not a plain JS number`).toBe(true);
      expect(String(value)).toBe("1.0");
    }
  });

  it("contrasts with a plain JSON.parse, which collapses '1.0' to the plain number 1 — the false-break bug", () => {
    const file = JSON.parse(rawText) as RawAuditFile;
    const proposed = windowOf(file.items).find((e) => e.seq === TAMPER_DEMO_SEQ);
    const value = (proposed!.payload as { severity_inputs: { reachability: unknown } }).severity_inputs.reachability;
    expect(value).toBe(1);
    expect(String(value)).toBe("1");
  });
});
