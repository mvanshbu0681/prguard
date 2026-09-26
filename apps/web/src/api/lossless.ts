// OWNER: t2a (wave 1). Hand-written — not produced by `npm run api:gen`.
//
// Lossless JSON for the audit chain (plan A8). The backend hashes
// canonical_json(doc) with Python's number repr: `1.0`, `1e-05`, `1e+16`,
// `-0.0`. JSON.parse turns those into 1, 0.00001, 10000000000000000 and 0, and a
// verifier that re-serialises them shows a FALSE chain break. So audit data never
// passes through JSON.parse: the fixture resolver loads audit/events.json with
// parseLosslessJson and serves it with stringifyLosslessJson, and the audit hooks
// parse the response text with parseLosslessJson.
//
// Number policy: an integer lexeme that a JS number holds exactly (seq, counts,
// exit codes) becomes a plain number, so ordinary code keeps working; every other
// lexeme (a float in any notation, or an integer beyond 2^53) becomes a
// LosslessNumber, which remembers its lexeme and re-serialises to it byte for
// byte. `String(n)` gives the lexeme; numericValue(n) the (possibly rounded)
// number. Avoid `n.valueOf()`: it returns a bigint for big integers and throws
// on overflow.
import { LosslessNumber, isLosslessNumber, parse, stringify } from "lossless-json";

export { LosslessNumber, isLosslessNumber };

const INTEGER_LEXEME = /^-?(0|[1-9]\d*)$/;

export function parseNumberLexeme(lexeme: string): number | LosslessNumber {
  if (INTEGER_LEXEME.test(lexeme) && lexeme !== "-0") {
    const n = Number(lexeme);
    if (Number.isSafeInteger(n)) return n;
  }
  return new LosslessNumber(lexeme);
}

/** JSON.parse, except every non-integer number keeps its lexeme (see the number policy above). */
export function parseLosslessJson(text: string): unknown {
  return parse(text, null, parseNumberLexeme);
}

/** JSON.stringify that writes a LosslessNumber back as its original lexeme. */
export function stringifyLosslessJson(value: unknown): string {
  return stringify(value) ?? "null";
}

/** The numeric value of a plain number or a LosslessNumber (for display and
 *  arithmetic, never for hashing); null for anything else. */
export function numericValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (isLosslessNumber(value)) return Number(value.toString());
  return null;
}
