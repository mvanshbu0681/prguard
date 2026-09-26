// OWNER: t2b. Test helper: a JSON reader that keeps every number's lexeme, and the backend's
// canonical form rebuilt from it (plan A8). The fixture files were written by Python's
// json.dumps, so a number's lexeme in the file IS Python's repr of it: `1.0`, `1e-05`,
// `-0.0` survive here where JSON.parse would turn them into `1`, `0.00001` and `0`.
import { createHash } from "node:crypto";

/** A number as written in the file. */
export class Lexeme {
  constructor(readonly text: string) {}
}

export type Lossless = null | boolean | string | Lexeme | Lossless[] | { [key: string]: Lossless };

export function parseLossless(text: string): Lossless {
  let at = 0;
  const fail = (what: string): never => {
    throw new SyntaxError(`${what} at offset ${at}`);
  };
  const space = () => {
    while (at < text.length && " \t\n\r".includes(text[at])) at += 1;
  };
  const value = (): Lossless => {
    space();
    const char = text[at];
    if (char === "{") {
      at += 1;
      const out: { [key: string]: Lossless } = {};
      space();
      if (text[at] === "}") {
        at += 1;
        return out;
      }
      for (;;) {
        space();
        if (text[at] !== '"') fail("expected a key");
        const key = string();
        space();
        if (text[at] !== ":") fail("expected ':'");
        at += 1;
        out[key] = value();
        space();
        if (text[at] === ",") {
          at += 1;
          continue;
        }
        if (text[at] === "}") {
          at += 1;
          return out;
        }
        fail("expected ',' or '}'");
      }
    }
    if (char === "[") {
      at += 1;
      const out: Lossless[] = [];
      space();
      if (text[at] === "]") {
        at += 1;
        return out;
      }
      for (;;) {
        out.push(value());
        space();
        if (text[at] === ",") {
          at += 1;
          continue;
        }
        if (text[at] === "]") {
          at += 1;
          return out;
        }
        fail("expected ',' or ']'");
      }
    }
    if (char === '"') return string();
    if (text.startsWith("true", at)) {
      at += 4;
      return true;
    }
    if (text.startsWith("false", at)) {
      at += 5;
      return false;
    }
    if (text.startsWith("null", at)) {
      at += 4;
      return null;
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at, at + 64));
    if (!match) fail("unexpected token");
    at += match![0].length;
    return new Lexeme(match![0]);
  };
  const string = (): string => {
    const start = at;
    at += 1;
    while (text[at] !== '"') {
      if (text[at] === "\\") at += 1;
      at += 1;
      if (at >= text.length) fail("unterminated string");
    }
    at += 1;
    return JSON.parse(text.slice(start, at)) as string;
  };
  const out = value();
  space();
  if (at !== text.length) fail("trailing data");
  return out;
}

/**
 * Python's `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`.
 * Keys sort by code point; strings escape exactly what Python escapes (JSON.stringify and
 * Python agree on that set, and neither escapes U+2028); numbers print their lexeme.
 */
export function canonical(value: Lossless): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Lexeme) return value.text;
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort((a, b) => {
    const left = Array.from(a, (c) => c.codePointAt(0)!);
    const right = Array.from(b, (c) => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return left.length - right.length;
  });
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

/** `audit.compute_event_hash`: sha256 over `(prev_hash or "") + canonical_json(document)`. */
export function eventHash(prevHash: string | null, document: Lossless): string {
  return createHash("sha256")
    .update((prevHash ?? "") + canonical(document), "utf8")
    .digest("hex");
}

/** The hashed document of a served audit item (plan A8/A9): the API's `Z` becomes `+00:00`. */
export function hashedDocument(item: { [key: string]: Lossless }): Lossless {
  const createdAt = item.created_at as string;
  return {
    tenant_id: item.tenant_id,
    seq: item.seq,
    event_type: item.event_type,
    actor_type: item.actor_type,
    actor_id: item.actor_id,
    payload: item.payload,
    created_at: createdAt.endsWith("Z") ? `${createdAt.slice(0, -1)}+00:00` : createdAt,
  };
}
