// OWNER: t6 (wave 2). canonicalJson / auditHashDocument against hand-written cases and
// against every cross-language vector the backend generated (plan A8's "MUST PASS").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLosslessJson } from "@/api/lossless";
import { auditHashDocument, canonicalJson } from "@/lib/canonical-json";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "..", "public", "fixtures");

function readFixture(path: string): unknown {
  return parseLosslessJson(readFileSync(join(FIXTURES_DIR, path), "utf8"));
}

describe("canonicalJson — hand-written cases", () => {
  it("emits no whitespace and sorts keys by code point, recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("sorts uppercase before lowercase and digits before letters (code-point order)", () => {
    const doc = parseLosslessJson('{"zeta":1,"Beta":2,"alpha":3,"_x":4,"10":5,"9":6}');
    expect(canonicalJson(doc)).toBe('{"10":5,"9":6,"Beta":2,"_x":4,"alpha":3,"zeta":1}');
  });

  it("keeps array order but sorts the keys of objects inside it", () => {
    expect(canonicalJson([{ b: 1, a: 2 }, "x", 3])).toBe('[{"a":2,"b":1},"x",3]');
  });

  it("escapes the six short forms, other C0 controls as \\u00xx, quote and backslash", () => {
    expect(canonicalJson("line one\nline two")).toBe('"line one\\nline two"');
    expect(canonicalJson("a\tb")).toBe('"a\\tb"');
    expect(canonicalJson("a\rb")).toBe('"a\\rb"');
    expect(canonicalJson("bell\u0001here")).toBe('"bell\\u0001here"');
    expect(canonicalJson('she said "no"')).toBe('"she said \\"no\\""');
    expect(canonicalJson("C:\\ws\\tests")).toBe('"C:\\\\ws\\\\tests"');
  });

  it("emits non-ASCII raw, including an astral character, and never escapes U+2028", () => {
    expect(canonicalJson("café")).toBe('"café"');
    expect(canonicalJson("東京")).toBe('"東京"');
    expect(canonicalJson("test tube 🧪 in a value")).toBe('"test tube 🧪 in a value"');
    expect(canonicalJson("before\u2028after")).toBe('"before\u2028after"');
  });

  it("prints true/false/null and empty containers", () => {
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });

  it("prints a plain safe integer as-is", () => {
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(1450)).toBe("1450");
    expect(canonicalJson(-9007199254740991)).toBe("-9007199254740991");
  });

  it("prints a big-integer lexeme (beyond 2^53) exactly, losslessly", () => {
    const doc = parseLosslessJson('{"twenty_digits":12345678901234567890,"neg":-9007199254740993}') as Record<string, unknown>;
    expect(canonicalJson(doc)).toBe('{"neg":-9007199254740993,"twenty_digits":12345678901234567890}');
  });

  it('prints the integer lexeme "-0" as Python\'s int("-0"): 0', () => {
    const doc = parseLosslessJson('{"zero":-0}') as Record<string, unknown>;
    expect(canonicalJson(doc)).toBe('{"zero":0}');
  });

  it("formats floats in Python repr form: whole numbers, negative zero, tiny/huge exponents", () => {
    const doc = parseLosslessJson(
      '{"one":1.0,"half":0.5,"neg_zero":-0.0,"micro":1e-05,"tiny":1.5e-07,"quadrillion":1e+16,"almost":0.0001,"pi":3.14159}',
    ) as Record<string, unknown>;
    expect(canonicalJson(doc)).toBe(
      '{"almost":0.0001,"half":0.5,"micro":1e-05,"neg_zero":-0.0,"one":1.0,"pi":3.14159,"quadrillion":1e+16,"tiny":1.5e-07}',
    );
  });

  it("formats a float with many significant digits scientifically past exponent 16", () => {
    const doc = parseLosslessJson('{"x":1.2345678901234568e+17}') as Record<string, unknown>;
    expect(canonicalJson(doc)).toBe('{"x":1.2345678901234568e+17}');
  });

  it("formats a repeating-decimal artefact exactly as Python's repr would", () => {
    const doc = parseLosslessJson('{"x":0.22499999999999998}') as Record<string, unknown>;
    expect(canonicalJson(doc)).toBe('{"x":0.22499999999999998}');
  });
});

describe("auditHashDocument", () => {
  it("converts a trailing Z to +00:00 and keeps every other field", () => {
    const doc = auditHashDocument({
      tenant_id: "t",
      seq: 5,
      event_type: "review.requested",
      actor_type: "system",
      actor_id: null,
      payload: { a: 1 },
      created_at: "2026-09-23T11:46:21.482113Z",
    });
    expect(doc.created_at).toBe("2026-09-23T11:46:21.482113+00:00");
    expect(canonicalJson(doc)).toBe(
      '{"actor_id":null,"actor_type":"system","created_at":"2026-09-23T11:46:21.482113+00:00","event_type":"review.requested","payload":{"a":1},"seq":5,"tenant_id":"t"}',
    );
  });

  it("leaves an already-offset created_at untouched", () => {
    const doc = auditHashDocument({
      tenant_id: "t",
      seq: 1,
      event_type: "x",
      actor_type: "system",
      actor_id: null,
      payload: {},
      created_at: "2026-09-23T11:46:21+00:00",
    });
    expect(doc.created_at).toBe("2026-09-23T11:46:21+00:00");
  });
});

describe("canonicalJson — cross-language vectors (audit/vectors.json)", () => {
  const vectors = readFixture("audit/vectors.json") as { items: { name: string; document: unknown; canonical: string }[] };

  it("loaded a non-trivial vector set", () => {
    expect(vectors.items.length).toBeGreaterThan(5);
  });

  for (const vector of vectors.items) {
    it(`matches: ${vector.name}`, () => {
      expect(canonicalJson(vector.document)).toBe(vector.canonical);
    });
  }
});

describe("canonicalJson — the full audit corpus (audit/events.json)", () => {
  const file = readFixture("audit/events.json") as {
    items: { seq: number; event_type: string; actor_type: string; actor_id: string | null; payload: unknown; created_at: string; tenant_id: string }[];
  };

  it("loaded the whole 1,000+ event chain", () => {
    expect(file.items.length).toBeGreaterThan(1000);
  });

  it("canonicalises seq 1428's payload — the '1.0' float case the brief calls out", () => {
    const item = file.items.find((it) => it.seq === 1428)!;
    expect(item).toBeDefined();
    const doc = auditHashDocument(item as never);
    // severity_inputs carries reachability/path_sensitivity/proof_confidence as 1.0 (plan A13):
    // canonicalJson must print "1.0", never the bare "1" JSON.parse would have produced.
    expect(canonicalJson(doc)).toContain('"reachability":1.0');
    expect(canonicalJson(doc)).toContain('"path_sensitivity":1.0');
    expect(canonicalJson(doc)).toContain('"proof_confidence":1.0');
  });
});
