// OWNER: t2b. The test helper that re-derives the corpus's audit hashes, tested on its own.
import { describe, expect, it } from "vitest";
import { canonical, eventHash, hashedDocument, Lexeme, parseLossless } from "./lossless-json";

describe("lossless JSON", () => {
  it("keeps number lexemes that JSON.parse would rewrite", () => {
    const parsed = parseLossless('{"a": 1.0, "b": 1e-05, "c": -0.0, "d": 12345678901234567890}') as Record<string, Lexeme>;
    expect(Object.values(parsed).map((value) => value.text)).toEqual(["1.0", "1e-05", "-0.0", "12345678901234567890"]);
  });

  it("canonicalises like Python's json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False)", () => {
    const value = parseLossless('{"zeta": [3, {"b": 2, "a": 1}], "Beta": "caf\\u00e9 \\u2028 \\u0001", "10": true, "9": null, "e": {}}');
    expect(canonical(value)).toBe('{"10":true,"9":null,"Beta":"café   \\u0001","e":{},"zeta":[3,{"a":1,"b":2}]}');
  });

  it("rejects malformed input", () => {
    expect(() => parseLossless('{"a": 1,}')).toThrow(SyntaxError);
    expect(() => parseLossless("[1] 2")).toThrow(SyntaxError);
  });

  it("hashes the served item's document with +00:00, and genesis with an empty prev_hash", () => {
    const item = parseLossless(
      '{"tenant_id": "t", "seq": 1, "event_type": "x", "actor_type": "system", "actor_id": null, "payload": {}, "created_at": "2026-09-23T11:46:21Z", "event_hash": "h"}',
    ) as Record<string, never>;
    const document = hashedDocument(item);
    expect(canonical(document)).toBe(
      '{"actor_id":null,"actor_type":"system","created_at":"2026-09-23T11:46:21+00:00","event_type":"x","payload":{},"seq":1,"tenant_id":"t"}',
    );
    expect(eventHash(null, document)).toBe(eventHash("", document));
    expect(eventHash(null, document)).toMatch(/^[0-9a-f]{64}$/);
  });
});
