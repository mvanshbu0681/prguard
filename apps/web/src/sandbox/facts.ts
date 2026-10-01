// What the landing page says about PR Guard that is not counted from GitHub.
// Two kinds, each with its source, so any line can be checked:
//
//   product  read from the code in apps/api (the GitHub App) and README.md
//   log      measured by the team on live reviews and written down in
//            .prguard/plans/deep-review/GAPS.md; the reviews it names are
//            public pull requests in the prguard-sandbox org
//
// Counts of what PR Guard posted (reviews, findings, commands, planted-bug
// recall) are not here: they come from ./snapshot.json, generated from the
// GitHub API by scripts/sandbox-snapshot.mjs.

export const APP_URL = "https://github.com/apps/pr-guard-beta"; // the GitHub App, "PR Guard Beta"
export const BOT = "pr-guard-beta[bot]";

export interface Reviewer {
  name: string;
  initials: string;
  kind: "model" | "check";
  looksFor: string;
}

/** apps/api/src/review/reviewers/index.ts, in its order; README.md "Reviewers" for what each looks for. */
export const REVIEWERS: Reviewer[] = [
  { name: "Bug", initials: "BG", kind: "model", looksFor: "Logic errors, wrong conditions, null paths, unhandled edge cases" },
  { name: "Security", initials: "SC", kind: "model", looksFor: "Missing access checks, injection, SSRF, unsafe input, data exposure" },
  { name: "Reliability", initials: "RL", kind: "model", looksFor: "Swallowed errors, missing awaits, transactions, races, leaks, timeouts" },
  { name: "Breaking change", initials: "BC", kind: "model", looksFor: "Changed signatures and exports whose callers were not updated" },
  { name: "Performance", initials: "PF", kind: "model", looksFor: "Queries in loops, unbounded reads, repeated heavy work" },
  { name: "Data", initials: "DT", kind: "model", looksFor: "Destructive migrations, money as float, missing indexes and constraints" },
  { name: "AI slop", initials: "AI", kind: "model", looksFor: "Invented APIs, duplicated helpers, placeholder logic, dead code" },
  { name: "Team rules", initials: "TR", kind: "model", looksFor: "The org's and repo's rules, and the brief's conventions" },
  { name: "Docs drift", initials: "DD", kind: "model", looksFor: "New env vars, config, flags or routes the docs do not describe" },
  { name: "Test gap", initials: "TG", kind: "model", looksFor: "Changed behavior with no test, with the tests to add" },
  { name: "Secrets", initials: "SE", kind: "check", looksFor: "Keys, tokens and passwords committed in the code" },
  { name: "Supply chain", initials: "SU", kind: "check", looksFor: "Malicious and vulnerable dependencies (npm, PyPI, Go), via Socket" },
];
export const MODEL_REVIEWERS = REVIEWERS.filter((r) => r.kind === "model").length; // 10
export const CODE_CHECKS = REVIEWERS.filter((r) => r.kind === "check").length; // 2

/** The avatar colours the page already used for its reviewer chips. */
export const AVATAR_COLORS = ["#1f2937", "#475569", "#334155", "#57534e"];
export const avatarColor = (name: string) => AVATAR_COLORS[Math.max(0, REVIEWERS.findIndex((r) => r.name === name)) % AVATAR_COLORS.length];
export const initialsOf = (name: string) => REVIEWERS.find((r) => r.name === name)?.initials ?? name.slice(0, 2).toUpperCase();

/** apps/api/src/commands/parse.ts and README.md "Commands". */
export const COMMANDS = [
  { command: "@prguard review", does: "Review the whole pull request again" },
  { command: "@prguard explain", does: "Explain a finding" },
  { command: "@prguard fix", does: "Reply with a committable suggestion" },
  { command: "@prguard ignore", does: "Dismiss a finding and remember why" },
] as const;

/**
 * The steps every review records in its trace, in order
 * (apps/dashboard/components/reviews/trace.tsx STEP_ORDER, apps/api/src/review/run.ts).
 */
export const TRACE_STEPS = ["fetch", "triage", "impact", "review", "checks", "verify", "learnings", "fixes", "publish"] as const;
export type TraceStep = (typeof TRACE_STEPS)[number];

/** apps/api/src/config.ts defaults and apps/api/src/review/engine.ts. */
export const DEFAULTS = {
  reviewParallelism: 4, // engine.ts REVIEW_PARALLELISM: reviewer tasks run 4 at a time
  verifyFrom: "medium", // verify.ts: findings of medium severity and up are re-checked
  learningsInPrompt: 30, // learnings/apply.ts: the 30 most recent enabled learnings
  reviewTokenBudget: 400_000, // REVIEW_TOKEN_BUDGET
} as const;

/**
 * One review, measured: GAPS.md, "Stage 3 checkpoint, F1 (`acme-billing#3`)".
 * The 7 posted findings and their 6 Verified badges can be seen on the pull request.
 */
export const WALKTHROUGH_LOG = {
  repo: "acme-billing",
  pr: 3,
  seconds: 24,
  files: 4,
  triageMs: 585,
  reviewersRun: 7,
  raw: 22,
  posted: 7,
  verified: 6,
  rejected: 1,
  tokens: 142_000,
  calls: 19,
} as const;
