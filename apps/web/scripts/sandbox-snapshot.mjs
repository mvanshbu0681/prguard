#!/usr/bin/env node
// Builds src/sandbox/snapshot.json, the only source of the live numbers on the
// landing page. It reads what PR Guard actually posted on the public
// prguard-sandbox repositories through the GitHub API (`gh api`, so it uses
// your gh login), counts it, and keeps the handful of real reviews, comments
// and commands the sections show. Nothing in the output is typed by hand:
// rerun it to refresh the page.
//
//   node apps/web/scripts/sandbox-snapshot.mjs
//
// Needs the GitHub CLI, logged in. Takes a minute or two (about 5 calls a PR).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "prguard-sandbox";
const BOT = "pr-guard-beta[bot]";
const CHECK = "PR Guard";
const SKIP_REPOS = new Set(["prguard-assets"]); // badge images, no pull requests
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "sandbox", "snapshot.json");

// The reviews, findings and command threads the sections show, picked by hand
// from the sandbox and looked up here, so every title, line and link is the
// one on GitHub.
const SHOWCASE_REVIEW = { repo: "acme-billing", pr: 26 };
const WALKTHROUGH_REVIEW = { repo: "acme-billing", pr: 3 };
const COMMANDS_PR = { repo: "acme-billing", pr: 6 };
const FIXED_PR = { repo: "acme-billing", pr: 6 };
const FEATURED = [
  { repo: "acme-billing", pr: 26, title: "Money stored as float in `LedgerEntry`" },
  { repo: "acme-ledger", pr: 1, title: "Missing authorization on account access" },
  { repo: "acme-gateway", pr: 2, title: "Counts map accessed without synchronization" },
  { repo: "acme-billing", pr: 3, title: "Missing ownership check on refund creation" },
  { repo: "acme-billing", pr: 26, title: "Destructive drop of `invoices.notes` column" },
  { repo: "acme-store", pr: 4, title: "Client‑controlled redemption amount trusted without verification" },
  { repo: "acme-billing", pr: 26, title: "A secret is committed in `app/services/ledger.py`" },
  { repo: "acme-ledger", pr: 1, title: "Non‑atomic debit/credit can leave inconsistent state" },
  { repo: "acme-billing", pr: 3, title: "Swallows commit failures and returns success" },
];
// One finding from each code check, for the Checks step of "How it works".
const CHECK_EXAMPLES = [
  { check: "Secrets", repo: "acme-billing", pr: 26, title: "A secret is committed in `app/services/ledger.py`" },
  { check: "Supply chain", repo: "acme-store", pr: 9, title: "`toga-ai@1.0.922` is known malware" },
];

function gh(endpoint, { paginate = false } = {}) {
  const args = ["api", ...(paginate ? ["--paginate", "--slurp"] : []), endpoint];
  const out = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const data = JSON.parse(out);
  return paginate ? data.flat() : data;
}

const badges = (body, kind) =>
  [...(body ?? "").matchAll(new RegExp(`/img/${kind}-([a-z0-9-]+)\\.png"[^>]*alt="([^"]*)"`, "g"))].map((m) => ({ id: m[1], alt: m[2] }));
const titleOf = (body) => (body ?? "").match(/\n\*\*(.+?)\*\*\n/)?.[1] ?? null;
const firstParagraph = (body) => {
  const after = (body ?? "").split(/\n\*\*.+?\*\*\n/)[1] ?? "";
  return after.trim().split(/\n\s*\n/)[0]?.trim() ?? "";
};
const block = (body, fence) => (body ?? "").match(new RegExp("```" + fence + "\\n([\\s\\S]*?)\\n```"))?.[1] ?? null;
const evidenceOf = (body) => (body ?? "").match(/<summary>Evidence<\/summary>\s*([\s\S]*?)\s*<\/details>/)?.[1]?.trim() ?? null;
const seconds = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

const repos = gh(`orgs/${ORG}/repos?per_page=100`, { paginate: true })
  .filter((r) => !SKIP_REPOS.has(r.name) && !r.private)
  .map((r) => r.name)
  .sort();

const prs = [];
for (const repo of repos) {
  for (const p of gh(`repos/${ORG}/${repo}/pulls?state=all&per_page=100`, { paginate: true })) {
    const n = p.number;
    process.stderr.write(`${repo}#${n} `);
    const reviews = gh(`repos/${ORG}/${repo}/pulls/${n}/reviews?per_page=100`, { paginate: true });
    const comments = gh(`repos/${ORG}/${repo}/pulls/${n}/comments?per_page=100`, { paginate: true });
    const issueComments = gh(`repos/${ORG}/${repo}/issues/${n}/comments?per_page=100`, { paginate: true });
    const checks = gh(`repos/${ORG}/${repo}/commits/${p.head.sha}/check-runs?per_page=100`).check_runs.filter((c) => c.name === CHECK);
    prs.push({ repo, n, pr: p, reviews, comments, issueComments, checks });
  }
}
process.stderr.write("\n");

const isBot = (x) => x.user?.login === BOT;
const findingOf = (repo, n, c) => ({
  repo,
  pr: n,
  url: c.html_url,
  path: c.path,
  line: c.line ?? c.original_line ?? null,
  title: titleOf(c.body),
  severity: badges(c.body, "sev")[0]?.id ?? null,
  reviewers: badges(c.body, "rev").map((b) => b.alt),
  verified: /\/img\/verified\.png/.test(c.body ?? ""),
  suggestion: block(c.body, "suggestion"),
  evidence: evidenceOf(c.body),
  summary: firstParagraph(c.body),
  postedAt: c.created_at,
});

const botReviews = prs.flatMap(({ repo, n, reviews }) => reviews.filter(isBot).map((r) => ({ repo, n, r })));
const findings = prs.flatMap(({ repo, n, comments }) => comments.filter((c) => isBot(c) && !c.in_reply_to_id).map((c) => findingOf(repo, n, c)));
const botReplies = prs.flatMap(({ comments }) => comments.filter((c) => isBot(c) && c.in_reply_to_id));
// PRs opened from the same branch share a head commit and so its check runs:
// count each check run once.
const checkRuns = [...new Map(prs.flatMap(({ checks }) => checks).map((c) => [c.id, c])).values()];
// From opening the pull request to PR Guard's first review on it, queue included.
const secondsToFirstReview = prs
  .map(({ pr, reviews }) => ({ pr, first: reviews.filter(isBot).map((r) => r.submitted_at).sort()[0] }))
  .filter(({ first }) => first)
  .map(({ pr, first }) => seconds(pr.created_at, first));
const reviewTimes = botReviews.map(({ r }) => r.submitted_at).sort();
const byHour = tally(reviewTimes.map((t) => t.slice(0, 13) + ":00Z"));

const find = ({ repo, pr }) => {
  const hit = prs.find((p) => p.repo === repo && p.n === pr);
  if (!hit) throw new Error(`${repo}#${pr} is not in the sandbox`);
  return hit;
};

function showcase({ repo, pr }) {
  const p = find({ repo, pr });
  const review = p.reviews.filter(isBot).at(-1);
  const body = review.body ?? "";
  const reasons = body.match(/\n(\*\*[^\n]+\*\*[^\n]*)\n/)?.[1] ?? null;
  return {
    repo,
    pr,
    title: p.pr.title,
    url: p.pr.html_url,
    reviewUrl: review.html_url,
    postedAt: review.submitted_at,
    priority: badges(body, "priority")[0] ?? null,
    risk: badges(body, "risk")[0] ?? null,
    reasons,
    severityCounts: badges(body, "sev")
      .filter((b) => /-\d+$/.test(b.id))
      .map((b) => ({ severity: b.id.replace(/-\d+$/, ""), count: Number(b.id.match(/-(\d+)$/)[1]) })),
    findings: p.comments.filter((c) => isBot(c) && !c.in_reply_to_id && c.created_at >= review.submitted_at.slice(0, 17)).map((c) => findingOf(repo, pr, c)),
    check: p.checks[0] ? { conclusion: p.checks[0].conclusion, title: p.checks[0].output?.title ?? null } : null,
  };
}

function walkthrough({ repo, pr }) {
  const p = find({ repo, pr });
  const files = gh(`repos/${ORG}/${repo}/pulls/${pr}/files?per_page=100`, { paginate: true });
  const review = p.reviews.filter(isBot)[0];
  const posted = p.comments.filter((c) => isBot(c) && !c.in_reply_to_id).map((c) => findingOf(repo, pr, c));
  return {
    repo,
    pr,
    title: p.pr.title,
    url: p.pr.html_url,
    author: p.pr.user.login,
    baseSha: p.pr.base.sha,
    headSha: p.pr.head.sha,
    files: files.map((f) => ({ path: f.filename, additions: f.additions, deletions: f.deletions })),
    postedAt: review?.submitted_at ?? null,
    findings: posted,
    reviewerCounts: tally(posted.flatMap((f) => f.reviewers)),
    check: p.checks[0] ? { conclusion: p.checks[0].conclusion, title: p.checks[0].output?.title ?? null } : null,
  };
}

function commands({ repo, pr }) {
  const p = find({ repo, pr });
  const thread = [
    ...p.issueComments.map((c) => ({ kind: "pr", c })),
    ...p.comments.map((c) => ({ kind: "line", c })),
  ].sort((a, b) => a.c.created_at.localeCompare(b.c.created_at));
  const asked = thread.filter(({ c }) => !isBot(c) && /@prguard\b/i.test(c.body ?? ""));
  return asked.map(({ kind, c }) => {
    const answer = thread.find(
      ({ kind: k, c: a }) =>
        isBot(a) && a.created_at >= c.created_at && (kind === "pr" ? k === "pr" : k === "line" && a.in_reply_to_id === (c.in_reply_to_id ?? c.id)),
    );
    return {
      command: (c.body ?? "").trim().split("\n")[0],
      on: kind === "pr" ? "pull request" : "line comment",
      url: c.html_url,
      answerUrl: answer?.c.html_url ?? null,
      answeredInSeconds: answer ? seconds(c.created_at, answer.c.created_at) : null,
    };
  });
}

function featured({ repo, pr, title }) {
  const f = findings.find((x) => x.repo === repo && x.pr === pr && x.title === title);
  if (!f) throw new Error(`no finding "${title}" on ${repo}#${pr}`);
  return f;
}

const fixedCheck = find(FIXED_PR).checks[0];

const snapshot = {
  generatedAt: new Date().toISOString(),
  generator: "apps/web/scripts/sandbox-snapshot.mjs",
  org: ORG,
  orgUrl: `https://github.com/${ORG}`,
  bot: BOT,
  repos,
  totals: {
    pullRequests: prs.length,
    pullRequestsReviewed: prs.filter(({ reviews }) => reviews.some(isBot)).length,
    reviews: botReviews.length,
    reviewStates: tally(botReviews.map(({ r }) => r.state)),
    findings: findings.length,
    replies: botReplies.length,
    verified: findings.filter((f) => f.verified).length,
    withSuggestion: findings.filter((f) => f.suggestion !== null).length,
    withEvidence: findings.filter((f) => f.evidence !== null).length,
    checkRuns: checkRuns.length,
    checkConclusions: tally(checkRuns.map((c) => c.conclusion)),
    medianSecondsToFirstReview: median(secondsToFirstReview),
    firstReviewAt: reviewTimes[0] ?? null,
    lastReviewAt: reviewTimes.at(-1) ?? null,
  },
  bySeverity: tally(findings.map((f) => f.severity ?? "unlabelled")),
  byReviewer: tally(findings.flatMap((f) => f.reviewers)),
  byPriority: tally(botReviews.map(({ r }) => badges(r.body, "priority")[0]?.alt).filter(Boolean)),
  byRisk: tally(botReviews.map(({ r }) => badges(r.body, "risk")[0]?.alt).filter(Boolean)),
  reviewsByHour: Object.entries(byHour).map(([hour, count]) => ({ hour, count })),
  showcase: showcase(SHOWCASE_REVIEW),
  walkthrough: walkthrough(WALKTHROUGH_REVIEW),
  commands: { repo: COMMANDS_PR.repo, pr: COMMANDS_PR.pr, url: find(COMMANDS_PR).pr.html_url, asked: commands(COMMANDS_PR) },
  fixed: { repo: FIXED_PR.repo, pr: FIXED_PR.pr, url: find(FIXED_PR).pr.html_url, checkTitle: fixedCheck?.output?.title ?? null },
  featured: FEATURED.map(featured),
  checkExamples: CHECK_EXAMPLES.map(({ check, ...f }) => ({ check, ...featured(f) })),
  // Per-reviewer lists for the review-team cards: highest severity first.
  topByReviewer: Object.fromEntries(
    ["Bug", "Reliability", "Security", "AI slop", "Test gap", "Team rules", "Data"].map((name) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3, nit: 4 };
      const seen = new Set();
      const list = findings
        .filter((f) => f.reviewers.includes(name) && f.title && !seen.has(f.title) && seen.add(f.title))
        .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || Number(b.verified) - Number(a.verified))
        .slice(0, 3)
        .map(({ repo, pr, url, title, severity, verified }) => ({ repo, pr, url, title, severity, verified }));
      return [name, list];
    }),
  ),
  severityByReviewer: Object.fromEntries(
    ["Security"].map((name) => [name, tally(findings.filter((f) => f.reviewers.includes(name)).map((f) => f.severity ?? "unlabelled"))]),
  ),
};

writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${snapshot.totals.pullRequestsReviewed} PRs, ${snapshot.totals.reviews} reviews, ${snapshot.totals.findings} findings`);
