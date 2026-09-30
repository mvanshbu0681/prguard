import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "general",
  name: "Bug",
  description: "Logic errors, wrong conditions, null paths, broken error paths and unhandled edge cases.",
  badge: "general",
  role: "smart",
  tools: true,
  maxSteps: 4,
  appliesTo: ["source"],
  needs: { impact: "optional" },
  instructions: `Find the bugs a careful senior engineer would block in this change:
- logic errors, wrong conditions, off-by-one errors, wrong return values
- null or undefined access, missing cases in a switch or match, wrong types at runtime
- broken error paths: an error that is lost, returned as success, or leaves state half-changed
- edge cases the code does not handle: empty input, zero, negative, very large, missing optional values
- data changed in a way callers do not expect (see the Impact section when present)
Security, performance, reliability and team rules have their own reviewers: do not report those.`,
});
