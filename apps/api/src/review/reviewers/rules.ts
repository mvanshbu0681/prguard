import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "rules",
  name: "Team rules",
  description: "The organization's and repository's rules, and the conventions in the repo brief.",
  badge: "rules",
  role: "fast",
  tools: false,
  appliesTo: ["source", "test", "config"],
  needs: { rules: true },
  instructions: `Report only code in this change that breaks one of the team rules, or a convention stated in the repository brief's "Conventions" section.
- Quote the rule or convention that is broken in the body.
- Use category "rules".
- Do not report anything that no rule or convention covers: other reviewers handle bugs, security and style.`,
});
