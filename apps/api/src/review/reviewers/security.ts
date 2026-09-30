import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "security",
  name: "Security",
  description: "Missing access checks, injection, SSRF, unsafe input and data exposure.",
  badge: "security",
  role: "smart",
  tools: true,
  maxSteps: 3,
  appliesTo: ["source", "config"],
  needs: { impact: "optional" },
  instructions: `Find security problems an attacker could use in this change:
- missing authentication or authorization, especially on new endpoints and on loading an object by id without checking who owns it; compare with how the neighbouring endpoints check access (use the tools)
- injection: SQL, shell, template, path traversal; SSRF; open redirects; unsafe deserialization; unescaped output (XSS)
- sensitive data written to logs or returned in responses; weak or home-made crypto; insecure defaults (CORS \`*\`, debug on, TLS checks off)
- trusting values the client controls: prices, roles, user ids, totals
Hard-coded secrets are covered by a separate check: do not report them.`,
});
