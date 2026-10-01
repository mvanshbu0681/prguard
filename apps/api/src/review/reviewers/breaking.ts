import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "breaking",
  name: "Breaking change",
  description: "Changed signatures, exports and shapes whose callers were not updated.",
  badge: "breaking",
  role: "smart",
  tools: true,
  maxSteps: 3,
  appliesTo: ["source"],
  needs: { impact: "required" },
  instructions: `Use the Impact section: it lists code elsewhere in the repository that uses what this change touches.
Find changes that break those callers:
- a function or method whose parameters, return value or thrown errors changed while existing callers still use the old form
- a renamed, moved or removed export, class, field or constant that other files still reference
- a changed default or meaning that existing callers rely on
- a changed API response shape or database column that readers depend on
Confirm each caller with read_file before reporting. In the body, name every caller not updated as \`path:line\`. Anchor the finding on the changed definition.`,
});
