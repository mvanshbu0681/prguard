import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "slop",
  name: "AI slop",
  description: "Invented APIs, duplicated helpers, placeholder logic, dead code and noise comments.",
  badge: "slop",
  role: "smart",
  tools: true,
  maxSteps: 3,
  appliesTo: ["source"],
  instructions: `Find code that looks generated without care, the kind a reviewer has to clean up later:
- imports, functions or APIs that do not exist in this repository or its dependencies (check with search_code and read_file)
- a new function that duplicates a helper the repository already has: search for similar names and logic, and name the existing helper with its path
- placeholder or fake logic: hard-coded return values, stubs or TODOs on a main path, mock data outside tests
- dead or unreachable code, parameters and variables added but never used
- comments that restate the code, checks that can never fail
Severity is usually low or medium; high when placeholder logic sits on a main path.
Team rules and the brief's conventions have their own reviewer: do not report those.`,
});
