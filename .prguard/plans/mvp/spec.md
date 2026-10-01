# Spec: PR Guard MVP

An AI pull-request reviewer shipped as a GitHub App. A team installs it on an org, it learns each
repo once, then reviews every pull request and every new push with comments on the exact lines,
ranked by severity. A human stays the approver; PR Guard only advises. A dashboard shows reviews as
they run and what they found.

Hackathon scope. No tests, no CI, no deployment. Built to be extended with more reviewers later.

## Users and stories

| # | Priority | Story |
|---|---|---|
| US-1 | P1 | As a developer, I open a PR and within seconds see PR Guard has started, then get a review with a summary and line comments. |
| US-2 | P1 | As a developer, I push more commits and get a review of only what changed, without repeats. |
| US-3 | P1 | As a team lead, I sign in with GitHub, install PR Guard on my org and see my repos. |
| US-4 | P1 | As a team lead, I watch reviews run live and open any review to see its findings. |
| US-5 | P2 | As a team lead, I set rules (org-wide and per repo) the reviewer enforces. |
| US-6 | P2 | As a team lead, I read and correct PR Guard's understanding of each repo (the brief). |
| US-7 | P2 | As the builder, I add a new reviewer by writing one file. |

## Functional requirements

- **FR-1 GitHub App.** Webhooks are verified by signature, deduplicated by delivery id, and
  answered fast. Installation state is reconciled from GitHub on every boot, so events missed while
  offline do not matter.
- **FR-2 Accounts.** Sign in with GitHub through the App's own OAuth; the first sign-in creates the
  account. Installing the App runs the same flow and lands on the dashboard. A user sees only the
  installations GitHub says they can access.
- **FR-3 Queue.** Work runs as durable jobs in SQLite, claimed by a configurable number of concurrent
  workers. Jobs survive restarts, retry transient failures, and a newer push on the same PR cancels
  the older job. The worker can run in its own process.
- **FR-4 Repo brief.** When a repo is connected, PR Guard reads a budgeted sample of it and writes a
  markdown brief: what it is, stack, structure, conventions, gotchas. Editable and rescannable.
- **FR-5 Review.** For each non-draft PR open, reopen, ready-for-review and push: fetch the diff and a
  snapshot of the code, drop noise, pack the rest into token-budgeted chunks, run the summary and the
  enabled reviewers (in parallel), then anchor, dedupe, rank and cap findings and post one GitHub
  review.
- **FR-6 Reviewers are plugins.** One file per reviewer: id, name, description, model role, scope,
  prompt. Findings share one schema. The MVP ships one general reviewer.
- **FR-7 Model roles.** Code asks for a role (`fast`, `smart`), never a model. Roles map to
  `provider:model` in config. Providers: Groq (default) and Google Gemini. No others.
- **FR-8 Budget.** Every LLM call is rate-limited, retried on 429, logged with tokens and latency,
  and counted against a per-review token budget.
- **FR-9 Dashboard.** A separate Next.js app: sign in, reviews (live), review detail, repositories,
  repository detail (brief, rules, reviewers), settings (org rules). Copy is short and never explains
  internals.

## Acceptance criteria

- **AC-1** Opening a non-draft PR on a connected repo adds a 👀 reaction to the PR and an in-progress
  `PR Guard` check run within 5 seconds of the webhook arriving.
- **AC-2** The same PR then receives one GitHub review (event `COMMENT`) whose body has a summary and
  a file walkthrough, plus inline comments anchored to lines inside the PR diff.
- **AC-3** An inline comment whose fix is mechanical carries a GitHub `suggestion` block.
- **AC-4** Each finding has a severity (`critical`, `high`, `medium`, `low`, `nit`). Inline comments
  are ordered and capped by severity; nits are capped separately; overflow goes to the review body.
- **AC-5** Duplicate findings (same file, overlapping lines, same issue) from different reviewers or
  chunks are posted once.
- **AC-6** A push to a reviewed PR produces a review covering only the new commits, with no finding
  repeated from an earlier review of that PR. With nothing new to say, it posts no review and the
  check run says so.
- **AC-7** PR Guard never approves or requests changes, and its check run never concludes `failure`,
  so it can never block a merge.
- **AC-8** On completion the 👀 reaction is removed and the check run completes with a title such as
  `3 findings · 1 high` and a link to the review in the dashboard.
- **AC-9** Signing in with GitHub creates the account and shows the user's installations and repos;
  installing the App from the dashboard returns to the dashboard with the new org listed.
- **AC-10** Connecting a repo (install, repo added, or boot reconcile) produces a brief without
  manual action. The brief is shown, editable and rescannable in the dashboard.
- **AC-11** Reviews list shows running reviews updating live (status and stage) without a reload.
- **AC-12** Review detail shows summary, findings grouped by severity with links to the lines on
  GitHub, the reviewed commit, duration and token usage, and a Re-run button that works.
- **AC-13** Org rules and repo rules saved in the dashboard are applied by every reviewer on the next
  review.
- **AC-14** Reviewers can be toggled per repo; a disabled reviewer does not run.
- **AC-15** Adding a reviewer is one new file plus one line in the registry; it then appears in the
  dashboard and runs.
- **AC-16** Model roles are set by environment variables; switching a role to `google:<model>` works
  without code changes.
- **AC-17** Several PRs opened together are reviewed concurrently, up to the configured worker count.
- **AC-18** A push while a review is running cancels the running review and starts a new one; the
  cancelled review's check run is closed as superseded.
- **AC-19** Every LLM call is recorded with purpose, model, tokens in/out and latency; a review stops
  spending once its token budget is used and says it reviewed partially.
- **AC-20** `docker compose up --build` starts the API (with its webhook relay) and the dashboard;
  the whole flow works against the sandbox org.
- **AC-21** A disabled repo is not reviewed.

## Edge cases

- **EC-1** Draft PRs are not reviewed until marked ready for review.
- **EC-2** A docs-only or lockfile-only PR gets a summary with no deep review.
- **EC-3** A PR with nothing reviewable (only binaries, deletions, generated files) gets a short
  review saying so.
- **EC-4** A large PR (hundreds of files, or a 30k+ character diff) is chunked; files beyond the
  budget are listed as not reviewed, highest-value files first.
- **EC-5** A force-push (last reviewed commit no longer an ancestor) falls back to a full review.
- **EC-6** A merge from the base branch into the PR branch does not cause a review of the base
  branch's changes.
- **EC-7** A model returns a line outside the diff: the finding snaps to a nearby diff line in the
  same hunk or moves to the review body. It is never dropped silently and never breaks the post.
- **EC-8** GitHub rejects the review (422): it is retried with all findings in the body.
- **EC-9** A duplicate webhook delivery is ignored.
- **EC-10** A job interrupted by a crash or restart is picked up again after restart.
- **EC-11** Groq returns 429 or a transient error: the call waits and retries; a persistent failure
  fails the review with a short message, and the check run is closed as neutral.
- **EC-12** The brief is not ready when a PR arrives: the review runs without it.
- **EC-13** The model returns malformed output: one repair attempt, then the chunk is skipped and the
  review notes partial coverage.
- **EC-14** The App is uninstalled or a repo is removed: its pending jobs are cancelled and it
  disappears from the dashboard.
- **EC-15** A PR is closed while its review is queued: the job is cancelled.
- **EC-16** A file path from the model that escapes the snapshot (`../`) is refused by the tools.

## Does not change

- `apps/web` (the marketing website) is untouched: no file inside it is modified.
- `main` is untouched; work lands on `staging` through a PR.
- The GitHub App's registered settings (permissions, events, URLs) stay as configured.

## Assumptions

- Groq Developer tier: 250K tokens/min on `openai/gpt-oss-120b` and `openai/gpt-oss-20b` (measured).
  Defaults: `smart = groq:openai/gpt-oss-120b`, `fast = groq:openai/gpt-oss-20b`.
- Webhooks reach localhost through the smee.io channel in `.env`.
- Sandbox org `prguard-sandbox` has the App installed on all repositories.
- One machine. SQLite in WAL mode; API and worker may be separate processes on the same volume.

## Challenge round

- **Weakest assumption:** that small open models anchor findings to correct line numbers. Mitigation:
  the diff is shown with explicit new-file line numbers, and every finding is validated against the
  diff before posting (EC-7).
- **Ignored risk:** noise. A reviewer that posts 30 low-value comments gets uninstalled. Mitigation:
  confidence floor, nit cap, inline cap, and no repeats across pushes (AC-4, AC-5, AC-6).
- **Alternative considered:** reviewing with the full repo cloned and an agent roaming freely. Costlier
  and slower on small models; the MVP gives the reviewer a brief plus three read-only tools
  (read file, search, list) with a step cap instead.
