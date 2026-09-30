import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "tests",
  name: "Test gap",
  description: "Changed behavior with no test covering it, with the tests to add.",
  badge: "tests",
  role: "fast",
  tools: true,
  maxSteps: 2,
  appliesTo: ["source"],
  needs: { testsInRepo: true },
  instructions: `Report at most one finding: the most important behavior this change adds or alters in source code that no test in this pull request covers.
- Use the tools to find the existing tests for this code and follow their conventions.
- Skip it when the pull request already changes or adds tests for this behavior, or the change is trivial.
- Anchor it on the changed function. The title reads "No test covers <behavior>". The body names the untested behavior in one or two sentences; bugs belong to other reviewers.
- details: { title: "Suggested tests", body: 3 to 5 markdown bullets, each an input and the expected result }.
Severity low; medium when the change touches money, access control or deleting data.`,
});
