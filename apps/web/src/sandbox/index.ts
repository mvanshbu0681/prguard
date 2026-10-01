// The live record: what PR Guard posted on the public prguard-sandbox pull
// requests, read from the GitHub API by scripts/sandbox-snapshot.mjs into
// ./snapshot.json. Rerun the script to refresh every count on the page.
import snapshot from "./snapshot.json";

export * from "./facts";

export type Severity = "critical" | "high" | "medium" | "low" | "nit";

export interface SandboxFinding {
  repo: string;
  pr: number;
  url: string;
  path: string;
  line: number | null;
  title: string | null;
  severity: Severity | null;
  reviewers: string[];
  verified: boolean;
  suggestion: string | null;
  evidence: string | null;
  summary: string;
  postedAt: string;
}

export interface Badge {
  id: string;
  alt: string;
}

export interface Snapshot {
  generatedAt: string;
  org: string;
  orgUrl: string;
  bot: string;
  repos: string[];
  totals: {
    pullRequests: number;
    pullRequestsReviewed: number;
    reviews: number;
    reviewStates: Record<string, number>;
    findings: number;
    replies: number;
    verified: number;
    withSuggestion: number;
    withEvidence: number;
    checkRuns: number;
    checkConclusions: Record<string, number>;
    medianSecondsToFirstReview: number;
    /** pull requests the median is taken over: those opened after currentFrom */
    reviewTimingN: number;
    currentFrom: string;
    firstReviewAt: string;
    lastReviewAt: string;
  };
  bySeverity: Record<string, number>;
  byReviewer: Record<string, number>;
  byPriority: Record<string, number>;
  byRisk: Record<string, number>;
  reviewsByHour: { hour: string; count: number }[];
  showcase: {
    repo: string;
    pr: number;
    title: string;
    url: string;
    reviewUrl: string;
    postedAt: string;
    priority: Badge | null;
    risk: Badge | null;
    reasons: string | null;
    severityCounts: { severity: Severity; count: number }[];
    findings: SandboxFinding[];
    check: { conclusion: string; title: string | null } | null;
  };
  walkthrough: {
    repo: string;
    pr: number;
    title: string;
    url: string;
    author: string;
    baseSha: string;
    headSha: string;
    files: { path: string; additions: number; deletions: number }[];
    postedAt: string | null;
    findings: SandboxFinding[];
    reviewerCounts: Record<string, number>;
    check: { conclusion: string; title: string | null } | null;
  };
  commands: {
    repo: string;
    pr: number;
    url: string;
    asked: { command: string; on: string; url: string; answerUrl: string | null; answeredInSeconds: number | null }[];
  };
  fixed: { repo: string; pr: number; url: string; checkTitle: string | null };
  featured: SandboxFinding[];
  /** Planted bugs named in a finding title, per review of a seeded test change (plan.md F1 to F8). */
  planted: {
    caught: number;
    planted: number;
    reviews: number;
    changes: number;
    runs: { fixture: string; change: string; repo: string; pr: number; caught: number; of: number; missed: string[] | null; scored: "title" | "hand" }[];
  };
  checkExamples: (SandboxFinding & { check: string })[];
  topByReviewer: Record<string, { repo: string; pr: number; url: string; title: string; severity: Severity | null; verified: boolean }[]>;
  severityByReviewer: Record<string, Record<string, number>>;
}

export const sandbox = snapshot as Snapshot;

/** "prguard-sandbox/acme-billing#26" style labels. */
export const prLabel = (repo: string, pr: number, withOrg = false) => `${withOrg ? `${sandbox.org}/` : ""}${repo}#${pr}`;

/** "1 October 2026", the day the snapshot was read. */
export const snapshotDate = () =>
  new Date(sandbox.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Findings that list a reviewer among their badges (a merged finding lists every reviewer that raised it). */
export const findingsBy = (...names: string[]) => sandbox.featured.filter((f) => f.reviewers.some((r) => names.includes(r)));

/** Check runs that concluded `failure`: the code has no such conclusion, and the record shows none. */
export const failedChecks = () => sandbox.totals.checkConclusions.failure ?? 0;

/** Reviews that approved or requested changes: PR Guard only comments. */
export const blockingReviews = () =>
  Object.entries(sandbox.totals.reviewStates)
    .filter(([state]) => state !== "COMMENTED")
    .reduce((n, [, c]) => n + c, 0);
