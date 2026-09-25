// OWNER: t6 (wave 2).
//
// Byte-exact TypeScript port of the backend's `audit.canonical_json` (plan A8):
//
//   json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
//
// This is the one place the chain's tamper-evidence lives or dies (dashboard-blueprint
// §3c, brand-gaps §2 ruling 14): one byte of drift here — a key-sort tiebreak, a control
// escape, a float formatted the JavaScript way instead of Python's `repr()` — and the
// page loads showing `chain.verified = false` on a chain that is perfectly fine. The most
// self-refuting failure this product can produce, so every rule below is load-bearing:
//
//   - keys sort recursively, by Unicode CODE POINT (not UTF-16 code unit — matters only
//     for keys that differ inside an astral character, which none of ours do, but Python
//     compares code points and JS's default `<` compares code units, so it is done
//     explicitly rather than assumed away)
//   - no whitespace anywhere (`separators=(",", ":")`)
//   - non-ASCII is emitted raw (`ensure_ascii=False`): café, 東京, an astral emoji, all pass
//     through untouched; only U+0000–U+001F are ever \u-escaped (plus the six short forms)
//   - integers print exactly as their lexeme (Python `int` is arbitrary precision; a JS
//     `number` only survives intact up to 2**53, so anything bigger — and the "-0" integer
//     lexeme, whose Python meaning is plain `0` — arrives here as a LosslessNumber)
//   - floats print in Python's `repr()` form, not JavaScript's `Number#toString()` form:
//     shortest round-trip digits, `1.0` / `100.0` (never bare `1` / `100`), `-0.0`, and
//     scientific notation exactly when the normalised exponent is < -4 or >= 16
//     (`1e-05`, `1.5e-07`, `1e+16` — Python's own switch points, verified against the
//     backend's own `compute_event_hash` in web/public/fixtures/audit/vectors.json)
//
// Every number that can carry a lexeme (LosslessNumber) MUST have come from
// `parseLosslessJson` (src/api/lossless.ts) — never from `JSON.parse`, which has already
// thrown the lexeme away by the time this module sees the value.
import { isLosslessNumber, LosslessNumber } from "@/api/lossless";

// ---------------------------------------------------------------------------
// String escaping — the exact set json.dumps(..., ensure_ascii=False) escapes.
// ---------------------------------------------------------------------------

const SHORT_ESCAPES: Record<string, string> = {
  '"': '\\"',
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/** Python's `json.encoder.py_encode_basestring` with `ensure_ascii=False`: escape `"`,
 *  `\`, the six short forms, and every other C0 control character as `\u00xx` (lowercase
 *  hex, zero-padded to 4). Everything else — including U+2028/U+2029, which neither
 *  Python nor a spec-conformant `JSON.stringify` escapes — passes through raw. Iterating
 *  by code point (not UTF-16 code unit) keeps an astral character's surrogate pair intact
 *  as one unit; none of them are ever in the control-character range this touches. */
function escapeString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const short = SHORT_ESCAPES[ch];
    if (short !== undefined) {
      out += short;
      continue;
    }
    const codePoint = ch.codePointAt(0)!;
    if (codePoint < 0x20) {
      out += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    } else {
      out += ch;
    }
  }
  return `${out}"`;
}

// ---------------------------------------------------------------------------
// Key sort — recursive, by Unicode code point (Python `sorted(keys)` semantics).
// ---------------------------------------------------------------------------

function codePoints(s: string): number[] {
  return Array.from(s, (ch) => ch.codePointAt(0)!);
}

function compareByCodePoint(a: string, b: string): number {
  const left = codePoints(a);
  const right = codePoints(b);
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

// ---------------------------------------------------------------------------
// Numbers — integers as-is, floats in Python repr form.
// ---------------------------------------------------------------------------

/** A JSON number lexeme is a float (has to go through Python's `float()`/`repr()`) iff
 *  it contains a decimal point or an exponent marker; anything else is a JSON int, which
 *  Python parses to an arbitrary-precision `int` and prints back unchanged. */
function isFloatLexeme(lexeme: string): boolean {
  return lexeme.includes(".") || lexeme.includes("e") || lexeme.includes("E");
}

const EXPONENTIAL = /^(\d)(?:\.(\d+))?e([+-]\d+)$/;

/** Python `repr()` of a finite `double`, from its shortest round-trip decimal digits.
 *  `Number#toExponential()` with no argument is specified (ECMA-262 21.1.3.6) to produce
 *  exactly that digit string — the same shortest-round-trip guarantee Python's own
 *  `repr()` relies on (both ultimately rest on "the unique decimal that reads back to
 *  this IEEE-754 double") — so the digits agree with Python bit for bit; only the
 *  formatting (scientific vs. fixed, the exponent's zero-padding, the mandatory `.0`)
 *  differs, and that is reproduced here from plan A8's spec:
 *    scientific when the normalised exponent is < -4 or >= 16 ("1e-05", "1.5e-07",
 *    "1e+16"); otherwise fixed, with at least one digit after the decimal point ("1.0");
 *    "-0.0" for negative zero. */
function pythonFloatRepr(value: number): string {
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const match = EXPONENTIAL.exec(magnitude.toExponential());
  if (!match) throw new Error(`canonicalJson: could not decompose float ${value}`);
  const digits = match[1] + (match[2] ?? "");
  const exponent = Number.parseInt(match[3], 10);
  const sign = negative ? "-" : "";

  if (exponent < -4 || exponent >= 16) {
    const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits[0];
    const expSign = exponent < 0 ? "-" : "+";
    const expDigits = String(Math.abs(exponent)).padStart(2, "0");
    return `${sign}${mantissa}e${expSign}${expDigits}`;
  }

  if (exponent < 0) {
    // -4 <= exponent <= -1: 0.000<digits>
    return `${sign}0.${"0".repeat(-exponent - 1)}${digits}`;
  }

  // 0 <= exponent <= 15: place the point after (exponent + 1) integer digits.
  const intLen = exponent + 1;
  const intPart = digits.length >= intLen ? digits.slice(0, intLen) : digits.padEnd(intLen, "0");
  const fracPart = digits.slice(intLen);
  return `${sign}${intPart}.${fracPart === "" ? "0" : fracPart}`;
}

function formatNumber(value: number | LosslessNumber): string {
  if (typeof value === "number") {
    // Only ever a safe-integer lexeme (src/api/lossless.ts parseNumberLexeme): plain
    // JS integer formatting is exact and matches Python's `int` printing.
    return String(value);
  }
  const lexeme = value.toString();
  if (!isFloatLexeme(lexeme)) {
    // A big-integer lexeme, or the special "-0" integer case (parseNumberLexeme routes
    // it here specifically because Python's int("-0") is plain 0).
    return lexeme === "-0" ? "0" : lexeme;
  }
  return pythonFloatRepr(Number(lexeme));
}

// ---------------------------------------------------------------------------
// canonicalJson
// ---------------------------------------------------------------------------

/** `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`,
 *  byte-exact, including Python's float `repr()` for any `LosslessNumber` in the tree.
 *  `value` should come from `parseLosslessJson` (or be built from such a value) — a
 *  plain `JSON.parse`d float has already lost the information this function needs. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return escapeString(value);
  if (typeof value === "number") return formatNumber(value);
  if (isLosslessNumber(value)) return formatNumber(value as LosslessNumber);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort(compareByCodePoint);
    return `{${keys.map((key) => `${escapeString(key)}:${canonicalJson(obj[key])}`).join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported value of type ${typeof value}`);
}

// ---------------------------------------------------------------------------
// auditHashDocument — the exact document the backend hashes (plan A8).
// ---------------------------------------------------------------------------

/** The fields `audit.compute_event_hash` hashes, in API form: `created_at` still carries
 *  the `Z` the API serialises (fixture-resolver's `AuditHashDocument` is the same shape —
 *  imported by audit-hasher.ts — this local copy keeps canonical-json.ts free of a
 *  same-wave read-only import edge). */
export interface AuditHashInput {
  tenant_id: string;
  seq: number | LosslessNumber;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/** `{ tenant_id, seq, event_type, actor_type, actor_id, payload, created_at }`, with a
 *  trailing `Z` on `created_at` converted to `+00:00` — `isoformat()` never writes `Z`,
 *  so the API's `Z` has to become that before the document matches what the backend
 *  actually hashed. Pass the result to `canonicalJson` (or `eventHash`). */
export function auditHashDocument(item: AuditHashInput): Record<string, unknown> {
  const createdAt = item.created_at.endsWith("Z") ? `${item.created_at.slice(0, -1)}+00:00` : item.created_at;
  return {
    tenant_id: item.tenant_id,
    seq: item.seq,
    event_type: item.event_type,
    actor_type: item.actor_type,
    actor_id: item.actor_id,
    payload: item.payload,
    created_at: createdAt,
  };
}
