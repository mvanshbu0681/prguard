# Spec: Deep review

PR Guard today runs one general reviewer and posts plain markdown. This feature makes it review
deeper and show it: specialist reviewers routed by a triage step, repo-aware impact analysis, a
verification pass, rule-based secret and supply-chain checks (Socket), priority and risk ranking,
fix tracking across pushes, `@prguard` commands, and learnings from team feedback. GitHub output moves
to image badges (hosted at `prguard-sandbox/prguard-assets`, style A) and a structured layout. The
dashboard gains a Queue, Insights, a review trace and a Learnings panel.

Same constraints as the MVP: no tests of any kind, no CI, no deployment. Groq only (`gpt-oss-20b` for
`fast`, `gpt-oss-120b` for `smart`); Gemini stays optional. Advisory only.

## Users and stories

| # | Priority | Story |
|---|---|---|
| US-1 | P1 | As a developer, I get findings from specialist reviewers that checked the code around my change, not only the diff. |
| US-2 | P1 | As a developer, I read a review on GitHub that is easy to scan: badges, a short summary, a findings table, and copy-ready fixes. |
| US-3 | P1 | As a developer, I push a fix and see PR Guard mark the finding fixed. |
| US-4 | P1 | As a developer, I talk to PR Guard in the PR: ask a question, ask for a fix, tell it to ignore something. |
| US-5 | P1 | As a team lead, I see open PRs ranked by priority and risk, and why. |
| US-6 | P1 | As a team lead, I am warned when a PR adds a malicious or vulnerable dependency or commits a secret. |
| US-7 | P2 | As a team lead, I see what PR Guard learned from my team and can edit it. |
| US-8 | P2 | As a team lead, I see how each review ran and how useful each reviewer is. |

## Functional requirements

- **FR-1 Reviewer plugins v2.** A plugin is either a model reviewer (prompt, role, tools) or a check
  (code, no model). Each declares the files it applies to and its badge. Both are toggled per repo.
- **FR-2 Reviewers.** Model reviewers: Bug (the current general reviewer, narrowed), Security,
  Reliability, Breaking change, Performance, Data, AI slop, Team rules, Docs drift, Test gap. Checks:
  Secrets, Supply chain.
- **FR-3 Triage.** Before reviewing, one `fast` call gives each file a risk level and picks which
  applicable reviewers see it.
- **FR-4 Impact analysis.** Symbols defined in changed code are looked up in the head snapshot; their
  definition and call sites go into the prompt of reviewers that ask for impact.
- **FR-5 Verification.** Model findings of severity medium or higher are re-checked against the code
  before posting. Rejected findings are not posted; confirmed ones carry evidence.
- **FR-6 Supply chain.** Dependencies added or changed in npm, PyPI and Go manifests are looked up
  through the Socket SDK (`@socketsecurity/sdk`, key `SOCKET_DEV_API_KEY`). Nothing is installed.
- **FR-7 Priority and risk.** Each review sets PR priority (P0 to P3, business impact) and risk (low,
  medium, high, from code signals), each with a short reason.
- **FR-8 Fix tracking.** On each push, earlier findings whose lines changed are checked; fixed ones are
  marked on GitHub and in the dashboard.
- **FR-9 Commands.** `@prguard` in a PR comment or a review thread: `review`, `explain`, `fix`,
  `ignore`, `help`, or any question.
- **FR-10 Learnings.** `ignore`, a 👎 on a PR Guard comment, or a reply saying the code is intentional
  becomes a per-repo learning. Learnings go into every prompt and suppress matching findings.
- **FR-11 GitHub output.** Image badges from `ASSET_BASE_URL`, new line-comment and review layouts, a
  change-flow diagram, "Prompt for AI agents", buttons into the dashboard. Code in backticks everywhere.
- **FR-12 Dashboard.** Queue page, Insights page, review trace, Learnings panel, priority and risk on
  reviews, badge colors shared with GitHub. Copy stays short and never explains internals.

## Acceptance criteria

Fixture PRs `F1` to `F9` are defined in [plan.md](plan.md#fixtures). "Posted" means visible on GitHub.

### Reviewers and engine

- **AC-1** Every review records triage: per file, a risk level and the reviewers it was sent to. A
  model reviewer receives only files routed to it. If the triage call fails, every applicable reviewer
  receives every applicable file and the review still completes.
- **AC-2** On F4, the review's recorded impact lists the changed exported function with its reference
  count, and the Breaking change reviewer posts a finding that names a caller the PR did not update.
- **AC-3** Model findings of severity medium or higher are verified before posting. A rejected finding
  is not posted and is listed with its reason in the trace. A confirmed finding shows the Verified badge
  and an Evidence section on GitHub and in the dashboard.
- **AC-4** On F1 (refunds), the 5 core planted bugs are still posted after verification.
- **AC-5** On F5, a committed high-entropy secret gets a Critical finding with the Security badge on its
  exact line. The secret value appears nowhere in the comment, the review body, the dashboard or the logs.
- **AC-6** On F6, `toga-ai@1.0.922` and `@whalent/agent@0.3.482` in `package.json` and the malicious Go
  module in `go.mod` each get a Critical Supply chain finding on the line that adds them, linking to the
  package on socket.dev. `requests==2.19.0` in `requirements.txt` gets a finding for its known CVEs.
- **AC-7** With `SOCKET_DEV_API_KEY` unset, or Socket failing, the review completes; the trace says the
  supply-chain check was skipped and GitHub shows no error.
- **AC-8** Security reviewer: on F1 it reports the missing ownership check on `create_refund`.
- **AC-9** Reliability reviewer: on F2 it reports the swallowed `try/catch` that the MVP missed.
- **AC-10** Performance reviewer: on F4 it reports the query inside a loop.
- **AC-11** Data reviewer: on F5 it reports the destructive migration and the money column stored as a
  float; it does not run on files that are not schema, model, migration or SQL files.
- **AC-12** AI slop reviewer: on F3 it reports the function that re-implements an existing helper and
  names that helper's path, and reports the placeholder return.
- **AC-13** Docs drift reviewer: on F3 it reports the new environment variable that `.env.example` and
  the README do not mention.
- **AC-14** Test gap reviewer: on F3 it posts one finding with suggested test cases in a folded
  section. In a repository without test files it does not run.
- **AC-15** Team rules reviewer: a repo rule ("never use `print` for logging") produces a Team rules
  finding on F1; the other reviewers no longer report rule violations.
- **AC-16** All 12 plugins appear in the repo's Reviewers panel with their name and description; a
  switched-off plugin does not run and does not appear in the trace.

### Ranking

- **AC-17** Every completed review has a risk level with up to 3 reasons (e.g. "6 callers of
  `Invoice.status`"), shown as a badge and a reasons line on GitHub, and in the dashboard.
- **AC-18** Every completed full review sets a priority P0 to P3 with a one-line reason. A PR labelled
  `hotfix`, `urgent` or `p0` is P0 (F9). A malware finding makes the PR P0. An incremental review keeps
  the PR's priority unless a new critical finding or a label raises it.

### GitHub output

- **AC-19** A line comment reads, top to bottom: severity badge, reviewer badge(s), Verified badge when
  verified; bold title; body; suggestion block when present; folded Evidence; folded "Prompt for AI
  agents" with a copy-ready instruction; a "View in PR Guard" button that opens the dashboard at that
  finding. No emoji labels remain anywhere in PR Guard's GitHub output.
- **AC-20** A review body reads: logo, priority and risk badges; summary; reasons line; severity count
  badges (or "No issues found."); a findings table (severity badge, title, linked `path:line`); folded
  key changes, nits and skipped files; limits note when present; an "Open full review" button.
- **AC-21** A full review with at least two connected steps includes a folded "How the change flows"
  Mermaid diagram that renders on GitHub.
- **AC-22** All images come from `ASSET_BASE_URL`, carry alt text and explicit width and height, and
  render in GitHub light and dark. With `ASSET_BASE_URL` empty, the same content is posted with plain
  text labels instead of images.
- **AC-23** Identifiers, paths, commands and literal values are in single backticks in titles, bodies,
  evidence, summaries, key changes and reasons, on GitHub and in the dashboard. On F1, `create_refund`
  and `db.get` are in backticks.
- **AC-24** The check run title counts the PR's open findings (e.g. "3 open · 1 high") and its summary
  mirrors the review header and findings table.

### In the PR

- **AC-25** `@prguard review` in the PR conversation gets 👀 on the comment within 5 seconds and starts
  a full review.
- **AC-26** `@prguard explain` as a reply in a PR Guard thread gets a reply in that thread that explains
  the finding and cites code by path and line.
- **AC-27** `@prguard fix` as a reply in a PR Guard thread gets a reply with a suggestion block that
  commits cleanly over the finding's lines.
- **AC-28** Any other text after `@prguard` is answered as a question, in the thread or conversation it
  was asked in, using the PR and repository as context. `@prguard help` lists the commands.
- **AC-29** `@prguard ignore <reason>` in a PR Guard thread dismisses the finding, saves a learning, and
  replies with the Learning saved badge; the finding's comment is collapsed as resolved. Only someone
  with write access can do this; anyone else is told so.
- **AC-30** A 👎 by a person with write access on a PR Guard line comment dismisses the finding and
  saves a learning. It is picked up on the PR's next push, when the PR closes, and when a review is
  re-run.
- **AC-31** A reply in a PR Guard thread, without a mention, from someone with write access, saying the
  code is intentional saves a learning and gets a one-line acknowledgment. Other replies without a
  mention get no response.
- **AC-32** Learnings apply: on a PR that repeats a dismissed pattern in the same repository, the
  finding is not posted, and the trace shows it suppressed by that learning.
- **AC-33** A push that fixes a flagged issue marks that finding fixed: its GitHub comment gains the
  Fixed badge and is collapsed as resolved, and the new review's "Since the last review" line and check
  run title show the fixed and open counts.
- **AC-34** A push that edits flagged lines without fixing the issue leaves the finding open.

### Dashboard

- **AC-35** A Queue page shows open, non-draft PRs of the user's repositories in four columns (P0
  Urgent, P1 High priority, P2 Normal, P3 Low priority), ordered by risk then age. Each card shows the
  repository, number and title, author, risk, open findings by severity, fixed count and age. PRs not
  yet ranked appear in a Waiting group. It refreshes while reviews run.
- **AC-36** The reviews list shows priority and risk for each review and can be filtered by priority.
- **AC-37** The review page shows priority and risk with reasons, reviewer badges on each finding,
  Verified with evidence, each finding's status (open, fixed, dismissed), and a copy button for the
  agent prompt. Opening `/reviews/<id>#f-<fingerprint>` scrolls to that finding.
- **AC-38** The review page has a trace: triage per file, impact symbols, each reviewer's model calls
  (model, tokens, duration, tools used), checks, verification kept and rejected, learnings suppressed,
  fix detection, and publishing, each with duration.
- **AC-39** An Insights page shows, for the last 30 days and optionally one repository: reviews, median
  time from push to review, tokens per review, findings by reviewer and severity, fix rate and dismiss
  rate per reviewer, and verification confirmed versus rejected.
- **AC-40** The repo page has a Learnings panel: each learning with its source (command, 👎, reply or
  manual), author, date and link; admins can add, switch off and delete; others read only.
- **AC-41** Severity colors in the dashboard match the badges. New pages and panels follow the existing
  look: the same tokens, components and density, short labels, no explanatory paragraphs, no em-dashes.

### Languages and platform

- **AC-42** F7 (Go) and F8 (Java) are reviewed with findings on the exact planted lines, at least half of
  the planted bugs each.
- **AC-43** `docker compose up --build` on a clean volume runs the whole flow, including Socket lookups
  and commands through the webhook relay.

## Edge cases

- **EC-1** Triage names a file or reviewer that does not exist: ignored. Triage returns nothing for a
  file: that file goes to every applicable reviewer.
- **EC-2** Impact skips symbols shorter than 4 characters or on a common-name list (`get`, `run`, `init`,
  `main`, `handler`, `data`, ...). A symbol with more than 200 references is reported as a count only.
- **EC-3** The verifier fails or returns no verdict for a finding: the finding is posted unverified.
- **EC-4** Placeholders (`xxx`, `changeme`, `your-api-key`, `example`, repeated characters) and files
  such as `.env.example` or test fixtures are not reported as secrets.
- **EC-5** Socket does not know a package or version: no finding for it.
- **EC-6** A version range (`^1.2.0`, `>=1.2`) is looked up at its lowest version; a line that cannot be
  parsed is skipped.
- **EC-7** Removed dependencies are not looked up.
- **EC-8** A PR that changes only a manifest still runs the supply-chain check; it is not treated as
  documentation only.
- **EC-9** Comments by bots, including PR Guard's own, never trigger commands or learnings.
- **EC-10** `@prguard review` or `fix` on a closed PR replies that the PR is closed; questions are
  still answered.
- **EC-11** `explain`, `fix` or `ignore` outside a PR Guard thread replies with how to use it.
- **EC-12** A mention with no text after it is treated as `help`.
- **EC-13** A command arriving while a review runs is handled without waiting for the review;
  `@prguard review` supersedes the running review like a push does.
- **EC-14** Edited or deleted comments are ignored; only new comments count.
- **EC-15** A flagged line that was deleted counts as fixed only if the fix check agrees.
- **EC-16** After a force-push, findings whose threads GitHub marks outdated are still checked.
- **EC-17** Editing or collapsing a comment fails (deleted, permissions): the finding is still marked
  fixed or dismissed in the dashboard, and the failure is logged.
- **EC-18** More than 30 learnings: the 30 most recent go into prompts; suppression uses all of them.
- **EC-19** Learnings never suppress Critical findings from checks (secrets, malware).
- **EC-20** Mermaid labels with quotes, brackets or pipes are escaped; fewer than 2 connected steps
  means no diagram.
- **EC-21** The summary call fails: priority comes from labels and findings alone, with the reason
  "Ranked from labels and findings."
- **EC-22** A count above 20 uses the "20+" badge.
- **EC-23** Reviews stored before this feature still load in the dashboard, with no priority, risk or
  trace shown.
- **EC-24** A comment or review body near GitHub's 65,536 character limit drops folded sections first,
  then truncates the findings table, and never breaks the markdown.
- **EC-25** The same webhook delivered twice runs a command once.
- **EC-26** Duplicate findings merged from two reviewers show both reviewer badges.

## Does not change

- `apps/web` is untouched apart from its `railway.json` (added at the user's request, 2026-10-01).
  `main` is untouched; work lands on `staging` through a PR.
- PR Guard never approves or requests changes, and its check run never concludes `failure`.
- The GitHub App keeps its current permissions. The only App change is the Issue comment event
  subscription, already done by the user.
- Incremental scope, takeover of the newest push, cancellation, crash recovery and the 422 fallback
  behave as today.
- Existing API fields keep their names and meaning; responses only gain fields.
- `MODEL_FAST` and `MODEL_SMART` defaults, and the Groq and Gemini providers.
- The dashboard's design system (tokens other than the severity hues, components, spacing, type scale),
  its routes, sign-in and access rules. `/reviews` stays the landing page.
- No tests and no CI. Deployment config is `docker-compose.yml` plus one `railway.json` per app and
  the README's Railway steps (added at the user's request, 2026-10-01).

## Cross-cutting axes

| Axis | Behavior |
|---|---|
| Access | Queue, Insights and learnings show only the user's visible repositories. Adding, switching off or deleting learnings needs repo admin, like rules. Commands are open to anyone who can comment on the PR; teaching a learning in the PR (`ignore`, 👎, an intentional reply) needs write access. |
| Theme | Badges read on GitHub light and dark (checked on the preview). Dashboard stays dark only, as today. |
| Languages | Reviews: TypeScript, Python, Go, Java checked live. Impact symbol patterns: TS/JS, Python, Go, Java. Supply chain: npm, PyPI, Go. |
| Failure | Every new step (triage, impact, verification, checks, fix tracking, commands) fails soft: the review or reply still goes out, and the trace records the failure. |
| Idempotency | Commands are jobs keyed by comment id, so redeliveries and retries do not reply twice. Fix marking and learnings are safe to repeat. |
| Cost | Per-review token budget still applies; triage and verification spend from it. Narrow reviewers use `fast`. |

Untouched: billing, i18n, mobile layout (the dashboard stays desktop-first as today).

## Assumptions

- Badge images are final (199, style A) and served from
  `https://cdn.jsdelivr.net/gh/prguard-sandbox/prguard-assets@v1/img`.
- `SOCKET_DEV_API_KEY` in `.env` works; Socket confirmed malware for `toga-ai@1.0.922`,
  `@whalent/agent@0.3.482`, `studiocode_eligibility@1.0.1` and the Go module
  `github.com/Kaleidora/dnsub-scanning-tool`, and CVEs for `requests==2.19.0`.
- The App subscribes to Issue comment, Pull request review comment and Pull request review thread
  events, and can collapse its own comments (`minimizeComment`) with current permissions. Resolving
  threads would need Contents write, so fixed findings are collapsed instead.
- The sandbox org installation covers all repositories, so new fixture repos are reviewed without setup.

## Challenge round

- **Weakest assumption:** that a verifier on the same model family catches false positives without
  dropping real bugs. Mitigation: it may reject only with cited code, "unsure" keeps the finding, and
  AC-4 holds recall on the known planted bugs.
- **Ignored risk:** more reviewers means more noise and more tokens. Mitigation: triage routing,
  `appliesTo`, shared dedupe, verification, learnings, and the existing inline and nit caps.
- **Alternative considered:** a tree-sitter code graph for impact analysis. More exact, but a native or
  WASM grammar per language; regex definitions plus word-boundary reference search covers the four
  target languages with no new dependency.
