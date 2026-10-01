import { isManifest } from "../checks/manifests.ts";
import { fileKind } from "../noise.ts";
import { defineReviewer } from "./define.ts";

export default defineReviewer({
  id: "docs",
  name: "Docs drift",
  description: "New or changed env vars, config, flags and routes the docs do not describe.",
  badge: "docs",
  role: "fast",
  tools: true,
  maxSteps: 3,
  // Dependency manifests are the Supply chain check's: a new package is not documentation drift.
  appliesTo: (path) => ["source", "config"].includes(fileKind(path)) && !isManifest(path),
  instructions: `Find places where this change makes the documentation wrong or incomplete:
- a new or renamed environment variable, config key, CLI flag, route or public API that the README, the docs folder or \`.env.example\` does not mention, or describes differently (search them with the tools before reporting)
- a docstring or comment on a changed function that still describes the old behavior
Anchor the finding on the code line that introduced the drift, and name the file that should change. Severity low or medium.
Logging, code style and team rules belong to other reviewers: do not report those.`,
});
