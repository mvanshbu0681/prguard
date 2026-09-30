import type { RawFinding } from "../findings.ts";
import { defineCheck } from "../reviewers/define.ts";

const PROVIDERS: { kind: string; re: RegExp }[] = [
  { kind: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { kind: "GitHub token", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { kind: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "Stripe live key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "private key", re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { kind: "Groq API key", re: /\bgsk_[A-Za-z0-9]{40,}\b/ },
  { kind: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { kind: "Socket API key", re: /\bsktsec_[A-Za-z0-9_]{20,}\b/ },
];

/** `SOME_SECRET = "value"`: a secret-looking name assigned a long quoted literal. */
const ASSIGNED =
  /(?:secret|token|passwd|password|api[_-]?key|private[_-]?key|signing[_-]?key|access[_-]?key|client[_-]?secret)[\w-]*["']?\s*[:=]\s*["']([^"'\s]{16,})["']/i;

const PLACEHOLDER = /x{4,}|changeme|change[_-]?me|your[_-]|example|dummy|sample|placeholder|test|fake|redacted|<|>|\$\{|\{\{|\*{3,}/i;
const REPEATED = /(.)\1{5,}/;

/** Files where secret-looking strings are expected: examples, docs and fixtures. */
const SKIP = /(^|\/)\.env\.(example|sample|template)$|\.(md|mdx|rst|txt|adoc)$|(^|\/)(fixtures?|testdata|__fixtures__|mocks?|__mocks__)\//i;

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

function looksReal(value: string): boolean {
  return !PLACEHOLDER.test(value) && !REPEATED.test(value) && entropy(value) >= 3.5;
}

/** The kind of secret on a line and its value, or null. The value is only used to scrub it elsewhere. */
export function findSecret(line: string): { kind: string; value: string } | null {
  for (const p of PROVIDERS) {
    const m = p.re.exec(line);
    if (m && !PLACEHOLDER.test(m[0])) return { kind: p.kind, value: m[0] };
  }
  const assigned = ASSIGNED.exec(line);
  if (assigned && looksReal(assigned[1]!)) return { kind: "secret", value: assigned[1]! };
  return null;
}

/**
 * Removes secrets from text a model wrote or PR Guard stores: the exact values the Secrets check
 * found in this change, plus anything shaped like a known key or a `secret = "value"` assignment.
 */
export function redactSecrets(text: string, exact: Iterable<string> = []): string {
  let out = text;
  for (const value of exact) if (value.length >= 8) out = out.split(value).join("[redacted]");
  for (const p of PROVIDERS) out = out.replace(new RegExp(p.re.source, "g"), (m) => (PLACEHOLDER.test(m) ? m : "[redacted]"));
  return out.replace(new RegExp(ASSIGNED.source, "gi"), (m, value: string) => (looksReal(value) ? m.replace(value, "[redacted]") : m));
}

export default defineCheck({
  id: "secrets",
  name: "Secrets",
  description: "Keys, tokens and passwords committed in the code.",
  badge: "security",
  appliesTo: (path) => !SKIP.test(path),
  async run({ files }) {
    const findings: RawFinding[] = [];
    const sensitive: string[] = [];
    for (const file of files) {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.kind !== "add" || line.newNo === null) continue;
          const found = findSecret(line.text);
          if (!found) continue;
          const kind = found.kind;
          sensitive.push(found.value);
          findings.push({
            reviewer: "secrets",
            path: file.path,
            line: line.newNo,
            severity: "critical",
            category: "security",
            title: `A ${kind} is committed in \`${file.path}\``,
            body: "Rotate it now: deleting it from the code does not remove it from the git history. Load it from the environment or a secret manager instead.",
            confidence: 1,
            suggestion: null,
          });
        }
      }
    }
    return { findings, detail: `${findings.length} found`, sensitive };
  },
});
