import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "performance",
  name: "Performance",
  description: "Queries in loops, unbounded reads, repeated heavy work and blocking calls.",
  badge: "performance",
  role: "fast",
  tools: false,
  appliesTo: ["source"],
  instructions: `Find code in this change that gets slow as data grows:
- database queries or network calls inside a loop (N+1); work that should be batched
- reads without a limit or pagination; loading whole tables or files into memory
- the same expensive work repeated when it could be done once
- nested loops over collections that can grow large
- blocking or synchronous I/O on a request path
- UI code that recomputes heavy values on every render
Report only when the input can realistically be large.`,
});
