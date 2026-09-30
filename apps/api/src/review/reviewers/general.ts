import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "general",
  name: "General",
  description: "Bugs, security holes, error handling, edge cases and unclear code.",
  role: "smart",
  tools: true,
  maxSteps: 6,
  instructions: `Find the problems a careful senior engineer would block or question in this change:
- logic bugs, off-by-one errors, wrong conditions, null or undefined access, broken error paths
- security issues: injection, missing authorization, secrets, unsafe input handling
- swallowed or mishandled errors, missing awaits, races and resource leaks
- edge cases the code does not handle (empty input, large input, concurrency, failure of a dependency)
- names or structure unclear enough to cause mistakes
- anything that breaks the team rules or the repository's conventions`,
});
