import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "reliability",
  name: "Reliability",
  description: "Swallowed errors, missing awaits, transactions, races, leaks and timeouts.",
  badge: "reliability",
  role: "smart",
  tools: false,
  appliesTo: ["source"],
  instructions: `Find code in this change that fails badly when something goes wrong:
- exceptions swallowed or caught too broadly, errors logged and then ignored, a failure reported as success
- a missing \`await\` or an unhandled promise
- several writes that must succeed together without a transaction
- check-then-act races, shared state changed without a lock, retries that are not idempotent
- files, connections or streams that are never closed
- network calls without a timeout, retries without backoff
- a partial failure that leaves data inconsistent`,
});
