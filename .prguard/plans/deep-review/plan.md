# Plan: Deep review

Builds [spec.md](spec.md) on branch `manaskhandelwal/deep-review` (cut from `manaskhandelwal/staging-work`,
PR #7). `apps/web` is not touched.

## Intent

The review pipeline grows from "summary + one reviewer" into a staged engine: triage routes files to
specialist reviewers, impact analysis gives them the code around the change, rule-based checks run
beside them, a verifier re-checks what they found, and learnings filter what the team already
rejected. Each run records a trace. Around the pipeline: fix tracking on later pushes, `@prguard`
commands as durable jobs, priority and risk on every PR. GitHub output is rebuilt around image
badges. The dashboard reads all of it through new fields and three new surfaces (Queue, Insights,
Learnings panel) plus a trace on the review page.

## Technical context

Unchanged stack (Node 24 type stripping, Hono, octokit 5, `ai` 7 with Groq, SQLite + Drizzle, Next.js
16 dashboard). Additions:

| Area | Choice |
|---|---|
| Supply chain | `@socketsecurity/sdk` 4.x in `apps/api`: `new SocketSdk(key)`, `batchPackageFetch({ components: [{ purl }] }, { alerts: true })`. Return shape read from the SDK's types when the slice is built. |
| Badge generation | `playwright-core` (root dev dependency) drives the local Chrome; `npm run badges`. Output published to `prguard-sandbox/prguard-assets`, tag `v1`. |
| Badge metadata | The generator also writes `apps/api/src/review/badges.json` (name, width, height, alt), read at boot. |
| GitHub API | Existing REST calls plus: review comments of a review, edit a review comment, reply in a thread, issue comments, reactions on comments, GraphQL `reviewThreads { isOutdated }` and `minimizeComment` (checked live: works with current permissions). |
| Diagrams | Mermaid `flowchart LR` in a fenced block (GitHub renders it); built from structured data, never from model text. |

Measured: Groq dev tier, 250K tokens/min per model. `REVIEW_TOKEN_BUDGET` default rises from 200K to
400K; `REVIEW_PARALLELISM` from 3 to 4.

## Layout

New and changed files in `apps/api/src` (`*` = new):

```
config.ts                    ASSET_BASE_URL, SOCKET_DEV_API_KEY, feature switches
review/
  badges.ts *  badges.json * image tags from the manifest, text fallback
  codify.ts *                wraps code terms in backticks
  agent-prompt.ts *          "Prompt for AI agents" text for a finding
  flow.ts *                  Mermaid from the summary's flow data
  publish.ts                 new comment and body layouts
  summarize.ts               + flow, change type, business impact
  triage.ts *                per-file risk and reviewer routing
  impact.ts *                changed symbols and their references
  verify.ts *                verification pass
  risk.ts *  priority.ts *   ranking
  tracking.ts *              comment ids, fix detection, Fixed marking
  trace.ts *                 trace recorder
  findings.ts                + learnings suppression, details, verified, evidence
  reviewing.ts               prompt rules (backticks, scope per reviewer)
  run.ts                     new pipeline order
  reviewers/
    define.ts                model reviewers and checks
    index.ts                 registry of 12 plugins
    general.ts security.ts* reliability.ts* breaking.ts* performance.ts* data.ts*
    slop.ts* rules.ts* docs.ts* tests.ts*
  checks/ *
    secrets.ts  manifests.ts  supply-chain.ts
integrations/socket.ts *     SDK client and PURL lookups
learnings/ *
  learn.ts                   learning text from a finding and a reason
  apply.ts                   prompt section and suppression
commands/ *
  events.ts                  issue_comment and pull_request_review_comment handlers
  parse.ts  run.ts           mention parsing, pr_command job
  answer.ts  fix.ts  ignore.ts  replies.ts  reactions.ts
github/pr.ts                 new REST and GraphQL helpers
db/schema.ts  db/repos/learnings.ts *  db/repos/findings.ts  db/repos/pulls.ts  db/repos/reviews.ts
db/migrations/0001… *        one per schema-changing slice
http/routes/queue.ts * insights.ts * learnings (inside repos.ts)  reviews.ts  serialize.ts
contracts.ts                 new fields and types
```

Dashboard (`apps/dashboard`):

```
app/globals.css              severity hues from the badges; priority, risk and reviewer tokens
app/(app)/queue/page.tsx *   app/(app)/insights/page.tsx *
app/(app)/reviews/page.tsx   priority column and filter
app/(app)/reviews/[id]/page.tsx  priority and risk header, trace section, scroll to finding
components/ui/pills.tsx *    PriorityPill, RiskPill, ReviewerPill, FindingStatus
components/reviews/finding-card.tsx  reviewers, verified, evidence, status, details, copy prompt
components/reviews/trace.tsx *   components/queue/* *   components/insights/* *
components/repo/learnings-panel.tsx *   components/repo/reviewers-panel.tsx
components/top-bar.tsx       nav: Queue, Reviews, Repositories, Insights, Settings
lib/queries.ts               queue, insights, learnings queries
```

Root: `scripts/badges/*`, `assets/badges/*`, `package.json` (`badges` script), `.env.example`, `README.md`.

## Data model

All additive; each schema-changing slice runs `npm run db:generate -w apps/api` and the migration is
applied at boot (OP-1). Existing rows get defaults, so old reviews still load (EC-23).

| Table | New columns |
|---|---|
| `reviews` | `triage` json `[]`, `impact` json `[]`, `trace` json `{}`, `since` json `null` (`{fixed,new,open}`), `risk` text, `risk_score` int, `risk_reasons` json `[]`, `priority` text, `priority_reason` text, `flow` json `null` |
| `pull_requests` | `labels` json `[]`, `risk`, `risk_score`, `risk_reasons`, `priority`, `priority_reason` (copied from the latest completed review, read by the Queue) |
| `findings` | `details` json `null` (`{title, body}`), `verified` bool `false`, `evidence` text, `status` text `'open'` (`open`, `fixed`, `dismissed`), `snippet` text, `github_comment_id` int, `github_node_id` text, `github_comment_url` text, `fixed_in_sha` text, `fixed_at` int, `dismissed_by` text, `dismissed_at` int, `learning_id` int |
| `llm_calls` | `tools` json `[]` (e.g. `read_file app/models.py`) |
| `learnings` (new) | `id`, `repository_id`, `text`, `source` (`command`, `reaction`, `reply`, `manual`), `path`, `category`, `fingerprint`, `title`, `finding_id`, `author`, `url`, `enabled` bool, `created_at` |

## Interfaces

**Plugins** (`reviewers/define.ts`):

```ts
type Applies = FileKind[] | ((path: string) => boolean);
type ModelReviewer = { kind: "model"; id; name; description; badge: string; role: Role; tools: boolean;
  maxSteps?: number; instructions: string; appliesTo: Applies;
  needs?: { impact?: "optional" | "required"; rules?: true; testsInRepo?: true } };
type Check = { kind: "check"; id; name; description; badge: string; appliesTo: Applies;
  run(input: CheckInput): Promise<RawFinding[]> };   // CheckInput: files, snapshot, repo, meta
```

`defineReviewer` and `defineCheck` keep "one file plus one registry line". `badge` names the reviewer
image (`rev-<badge>`); Secrets uses `security`.

| Plugin | Label | Kind | Role, tools, steps | Applies to | Needs |
|---|---|---|---|---|---|
| `general` | Bug | model | smart, yes, 4 | source | impact optional |
| `security` | Security | model | smart, yes, 3 | source, config | impact optional |
| `reliability` | Reliability | model | smart, no | source | |
| `breaking` | Breaking change | model | smart, yes, 3 | source | impact required (runs only when a changed symbol has references outside the PR's files) |
| `performance` | Performance | model | fast, no | source | |
| `data` | Data | model | smart, no | schema, model, migration, SQL paths | |
| `slop` | AI slop | model | smart, yes, 3 | source | |
| `rules` | Team rules | model | fast, no | source, test, config | rules (runs when org or repo rules, learnings or a brief exist) |
| `docs` | Docs drift | model | fast, yes, 3 | source, config | |
| `tests` | Test gap | model | fast, yes, 2 | source | testsInRepo (runs only when the snapshot has test files) |
| `secrets` | Secrets | check | | every added line except docs, `.env.example`, fixtures | |
| `supply-chain` | Supply chain | check | | `package.json`, `package-lock.json`, `requirements*.txt`, `pyproject.toml`, `go.mod` | `SOCKET_DEV_API_KEY` |

**Raw finding** gains `details: { title, body } | null`. **Finding** gains `details`, `verified`,
`evidence`, `fromCheck`. Test gap keeps at most one finding per review (highest severity).

**New modules**

```ts
triage({ files, reviewers, context, meta }): Promise<{ routes: Map<string, string[]>; files: TriageFile[]; fallback: boolean }>
impact({ files, snapshot }): ImpactSymbol[]            // { name, path, line, refs, files, samples[] }
renderImpact(symbols): string                           // "## Impact" prompt section
verify({ findings, files, snapshot, context, meta }): Promise<{ findings; rejected: { finding, reason }[] }>
assessRisk({ prFiles, impact, deps, openFindings }): { level, score, reasons: string[] }
decidePriority({ signals, labels, findings, previous }): { priority: "p0"|"p1"|"p2"|"p3"; reason }
recordCommentIds(gh, r, prNumber, githubReviewId, rows): Promise<void>
detectFixes({ gh, r, pr, snapshot, headSha, meta }): Promise<{ fixed: FindingRow[]; checked: number }>
learnFrom({ finding, reason, source, author, url }): Promise<Learning>
learningsSection(repoId): string;  suppress(findings, learnings): { kept; suppressed }
codify(text, terms): string;  codeTerms(files): Set<string>
agentPrompt(finding): string;  flowMermaid(flow): string | null
badge(name, opts?): string    // <img src="{ASSET_BASE_URL}/{name}.png" width height alt>, or text when unset
```

**GitHub helpers** (`github/pr.ts`): `listReviewCommentsOf(reviewId)`, `listPullComments(number)` (with
reaction counts), `updateReviewComment(id, body)`, `replyInThread(number, commentId, body)`,
`createIssueComment(number, body)`, `reactToComment(kind, id, content)`, `reviewThreads(number)`
(GraphQL: `isOutdated`, first comment `databaseId`), `minimizeComment(nodeId)`.

**Jobs**: `pr_command` (key `cmd:<commentId>`), `pr_reply` (key `reply:<commentId>`),
`sweep_reactions` (key `sweep:<repoId>:<number>`). `review_pr` accepts trigger `command` (full scope,
like `manual`).

**HTTP** (all behind sign-in, scoped to visible repos):

| Route | Returns |
|---|---|
| `GET /api/queue` | `QueueItem[]`: repo, PR, priority and reason, risk and reasons, open counts by severity, fixed, latest review |
| `GET /api/insights?repo=&days=30` | `Insights`: reviews, median minutes to review, median tokens, per reviewer posted, fixed, dismissed, open, by severity, verification counts |
| `GET /api/repos/:id/learnings` | `Learning[]` |
| `POST /api/repos/:id/learnings` | admin; `{ text }` creates a manual learning |
| `PATCH /api/repos/:id/learnings/:lid` | admin; `{ enabled?, text? }` |
| `DELETE /api/repos/:id/learnings/:lid` | admin |
| `GET /api/reviews?priority=p0` | new filter on the existing list |
| `GET /api/reviews/:id` | gains `priority`, `priorityReason`, `risk`, `riskReasons`, `since`, `triage`, `impact`, `trace`, `calls[]`; findings gain `reviewers[]`, `verified`, `evidence`, `details`, `status`, `agentPrompt`, `fingerprint` |

## Key mechanics

**Pipeline order** (`run.ts`), inside the existing job with its takeover, cancellation and budget:

1. Fetch the PR, resolve scope, classify files (unchanged). Manifests count as config, not docs (EC-8).
2. Sweep 👎 reactions on this PR's open findings (learnings created before reviewing).
3. Snapshot at head whenever there is code or a manifest to look at.
4. In parallel:
   - summary (`fast`): summary, key changes, flow, change type, business impact, impact area;
   - triage (`fast`), then impact (no model), then model reviewers per routed file set and chunk;
   - checks (secrets, supply chain);
   - fix detection for earlier open findings (only when the PR has earlier reviews).
5. Findings: anchor, confidence floor, dedupe, drop repeats, suppress by learnings, verify
   (model findings of medium and above, grouped by file), then caps and placement.
6. Risk, then priority.
7. Publish the review, store comment ids and snippets, mark fixed findings on GitHub, complete the
   check run with open counts, save the trace.

**Budget.** Triage, verification and fix checks record usage like any call. Verification is skipped
(findings stay unverified) when the remaining budget is below its estimate.

**Prompt rules** added to every model prompt: put identifiers, paths, commands, config keys and
literal values in single backticks; report only issues inside this reviewer's scope; do not report
team-rule violations (except Team rules). Team rules and learnings go only to Team rules and to the
suppression step, the brief goes to everyone.

**Backticks** (`codify`). Code terms come from the diff: tokens with an underscore, an inner capital
(`camelCase`), a dot between identifiers (`db.get`), a trailing `()`, or a path of a changed file.
Occurrences outside existing code spans, fences and links are wrapped. Plain English words never
qualify because they have none of these shapes.

**Triage.** One structured `fast` call. Input: each file with kind, `+/-` counts, hunk headers and its
first added lines, plus the candidate reviewers (after `appliesTo`) with descriptions. Output per file:
`risk` and `reviewers`. Bug and Team rules are always kept for source files; unknown names are
ignored (EC-1); a failed call or a file missing from the answer falls back to all candidates.
Switch: `TRIAGE=off`.

**Impact.** For each changed file, definitions touching changed lines are found with per-language
patterns (TS/JS `function x`, `const x = (`, `x(…) {` methods, `class X`, `export`; Python `def`,
`class`; Go `func (…) X(`, `func X(`, `type X`; Java methods and classes). Up to 15 symbols, skipping
short and common names (EC-2). One pass over the snapshot with a combined word-boundary regex
collects references outside the definition: count, files, first 5 samples. Symbols over 200 references
keep only counts.

**Verification.** Per file, one `smart` agent call with the repo tools and ±30 lines around each
finding; answer tool `submit_verdicts` `[{ index, verdict: confirmed | rejected | unsure, evidence }]`.
The prompt allows `rejected` only with cited code that shows the finding is wrong. Rejected findings go
to the trace; confirmed ones get `verified` and `evidence`; unsure and missing verdicts stay unverified
(EC-3). Switch: `VERIFY=off`.

**Secrets** (no model). Added lines only. Patterns: AWS `AKIA…`, GitHub `gh[pousr]_…` and
`github_pat_…`, Slack `xox…`, Stripe `sk_live_`/`rk_live_`, Google `AIza…`, private key headers, Groq
`gsk_…`, OpenAI `sk-…`, Socket `sktsec_…`, and a generic `secret|token|password|api_key|signing_key =
"…"` rule with Shannon entropy at least 3.5 and 16+ characters. Placeholders and fixture paths are
skipped (EC-4). The finding names the kind of secret only, never the value (AC-5); logs never print
matched text.

**Supply chain.** Parse added lines of manifests (npm `"name": "range"` resolved against the head
`package.json` blocks; `requirements*.txt` `name==|>=|~= version`; `pyproject.toml` dependency strings;
`go.mod` `module vX`). Ranges use their lowest version (EC-6), removals are ignored (EC-7). One
`batchPackageFetch` for all PURLs (`pkg:npm/%40scope/name@v`, `pkg:pypi/name@v`,
`pkg:golang/module@v`). Artifacts are merged per name and version. Severity: any alert with action
`error` is Critical, `warn` is High, otherwise CVEs by type (`criticalCVE` Critical, `cve` High,
`mediumCVE` Medium, `mildCVE` Low); other `monitor` and all `ignore` alerts are dropped. The finding
sits on the manifest line, links to `socket.dev`, and folds "What Socket found" (alert list and supply
chain score). Unknown packages give nothing (EC-5). No key or an SDK error: the check records
"skipped" in the trace (AC-7).

**Risk** (no model). Points: lines changed (200+: 10, 500+: 20), sensitive areas touched (auth,
payments, data and migrations, security config, infra: 20 each, max 40), blast radius from impact
(5+ references: 10, 20+: 20, 50+: 30), new dependencies (5 each, max 15; malware 50), removed guards
(3+ deleted `if`/`assert`/`raise`/`throw`/`require`/`authorize`/`validate` lines: 10), open findings
on the PR (critical 30 each max 40, high 10 each max 30, medium 3 each max 9). Tests or docs only:
halved. Low under 30, Medium under 60, else High. Reasons: the top 3 contributors as short phrases
with backticks ("6 callers of `Invoice.status`", "touches payments").

**Priority.** Summary adds `change_type` (feature, fix, hotfix, security, refactor, perf, docs, test,
chore, deps), `business_impact` (high, medium, low) and `impact_area`. Rules: high P1, medium P2, low
P3; hotfix or security raises to P0 when impact is high, else P1; docs, test and chore stay P3;
labels `hotfix|urgent|p0|critical` force P0 and `p1|high` force at least P1; a critical finding raises
to at least P1; malware or a secret forces P0. Incremental reviews keep the PR's priority unless these
raise it. `labeled` and `unlabeled` events store labels and re-rank without a model call. No summary:
rules alone (EC-21).

**Fix tracking.** After a review is posted, its comments are listed and matched to inline findings by
path and body, storing comment id, node id, URL, and the finding's code lines (`snippet`). On a later
review of the PR, GraphQL gives each thread's `isOutdated`. Outdated threads of open findings are
candidates. For each, the current code is located in the head snapshot by matching the snippet (±15
lines), or marked deleted. One `fast` structured call per 10 candidates answers `fixed` with a reason
(EC-15). Fixed findings: status `fixed`, `fixed_in_sha`; the comment body gains a Fixed badge line and
the comment is minimized as `RESOLVED`; failures are logged only (EC-17). Counts: fixed in this push,
new in this review, open on the PR. They go into the body ("Since the last review") and the check run
title. A push with nothing new still updates comments and the check run. Switch: `TRACK_FIXES=off`.

**Commands.** `issue_comment` (on PRs) and `pull_request_review_comment`, `created` only (EC-14),
authors of type `Bot` ignored (EC-9). A mention is `@prguard` or `@<app slug>`. The handler adds 👀 to
the comment and enqueues `pr_command`; the delivery id and the comment-id job key make it run once
(EC-25). Dispatch: `help` (also an empty mention, EC-12); `review` (`triggerReview`, trigger `command`,
supersedes like a push, EC-13); `explain`, `fix`, `ignore` need a PR Guard thread (the root comment id
maps to a finding), otherwise a usage reply (EC-11); anything else is a question. Answers use a
`smart` agent with the repo tools on a head snapshot, the brief, the latest summary, and the finding or
file window; answer tool `reply { body }`, codified. `fix` validates the suggestion with the existing
`fitSuggestion` against the finding's range; if the thread is outdated it asks for a comment on the new
lines. Closed PRs: `review` and `fix` reply that the PR is closed (EC-10). Switch: `COMMANDS=off`.

**Learnings.** `learnFrom` asks `fast` for one sentence (at most 25 words) general enough for similar
code but not wider than the finding's category and path, with a deterministic fallback. Sources:
`ignore` (with the reason), 👎 (swept on push, on close and on re-run), a reply classified as
`intentional` or `disagree` by one `fast` call (other intents get no response), and manual entries.
Prompts get the 30 most recent enabled learnings (EC-18). Suppression drops a finding with the same
fingerprint, or the same category and a title similarity of at least 0.5 on the same path (or any
path for repo-wide learnings). Critical check findings are never suppressed (EC-19).

**GitHub layouts.** As in the approved preview (`assets/badges/preview.png`). Line comment: badges row
(severity, up to 2 reviewer badges (EC-26), Verified), bold title, body, suggestion, `<details>`
Evidence, `<details>` extra section (details title), `<details>` "Prompt for AI agents" with a fenced
block, then the "View in PR Guard" image link to `/reviews/<id>#f-<fingerprint>`. Review body: logo,
priority and risk badges; summary; reasons line; severity count badges (`sev-<s>-<n>`, `-many` above
20, EC-22); "Since the last review" status badges when present; findings table; folded key changes,
change flow, nits, skipped files; limits note; "Open full review" image link. Size guard: drop folded
sections, then trim the table, under 60,000 characters (EC-24). `ASSET_BASE_URL` empty: badges become
bold text labels (AC-22).

**Trace.** A small recorder collects steps (`fetch`, `triage`, `impact`, `review`, `checks`,
`verify`, `learnings`, `fixes`, `publish`) with status, duration and a one-line detail, plus the
findings funnel (raw, anchored, confident, unique, fresh, suppressed, rejected, posted) and the
rejected and suppressed lists. `agent()` records the tools each call used into `llm_calls.tools`.

## Fixtures

Live checks run against PRs in `prguard-sandbox`. Existing branches are reopened as fresh PRs; new ones
are created by scripts kept in the scratchpad, not committed (OP-2). Fixture PRs only add text;
nothing in the sandbox installs dependencies (no CI).

| Id | Repo and branch | What it holds |
|---|---|---|
| F1 | `acme-billing` `feat/refunds` (existing) | The 5 core planted bugs (ownership check on `create_refund`, float money, refund above balance, status transition, swallowed error); repo rule "never use `print` for logging". |
| F2 | `acme-store` `feat/discount-codes` (existing) | 7 planted bugs incl. the swallowed `try/catch` and the unclear name. |
| F3 | `acme-store` `feat/gift-cards` (new) | Re-implements the existing money formatter; a placeholder `return true`; reads `GIFT_CARD_PROVIDER_URL` missing from `.env.example` and README; logic change with no test change (the base gets a `tests/` folder if it has none). |
| F4 | `acme-store` `feat/order-history` (new) | Query inside a loop; an exported function gains a required parameter while 2 callers in other files are not updated. |
| F5 | `acme-billing` `feat/ledger-migration` (new) | A migration that drops a column; a money column as `Float`; a committed high-entropy `PAYMENT_SIGNING_SECRET`. |
| F6 | `acme-store` `chore/deps` (new), `acme-billing` `chore/requests-pin` (new), `acme-gateway` `chore/go-deps` (new) | `toga-ai` 1.0.922 and `@whalent/agent` 0.3.482; `requests==2.19.0`; `github.com/Kaleidora/dnsub-scanning-tool`. |
| F7 | `acme-gateway` (new Go repo) `feat/rate-limit` | 4 planted bugs: map written from goroutines without a lock, ignored error, `defer` in a loop, off-by-one slice bound. |
| F8 | `acme-ledger` (new Java repo) `feat/transfers` | 4 planted bugs: `BigDecimal.equals` for amounts, unclosed stream, missing null check, `int` overflow on cents. |
| F9 | `acme-store` `hotfix/checkout-crash` (new), label `hotfix` | A one-line fix; must rank P0. |

## Dashboard

Same shell, tokens and components. New copy is labels only.

| Surface | Content |
|---|---|
| Top bar | Queue, Reviews, Repositories, Insights, Settings. |
| `/queue` | Columns P0 Urgent, P1 High priority, P2 Normal, P3 Low priority, plus Waiting when non-empty. Card: repo, `#n` title, author avatar, risk pill, open severity pills, fixed count, age. Click opens the latest review. Polls like the reviews list. |
| `/reviews` | New Priority column (priority pill, risk pill) and a priority filter. |
| `/reviews/[id]` | Header gains priority and risk pills with reasons. Finding cards: reviewer pills, Verified, Evidence, details fold, status, copy prompt. Section "Trace" (collapsed): steps with duration, triage table, impact list, calls per reviewer with tools. Hash `#f-<fingerprint>` scrolls to the card. |
| `/repos/[id]` | Learnings panel beside Rules; Reviewers panel shows all 12 with their pill. |
| `/insights` | Repo select; three stat tiles (reviews, median time to review, median tokens); findings by reviewer (bars split fixed, dismissed, open); by severity; verification confirmed and rejected. Bars are plain elements, no chart library. |

## Project rules check

No constitution in this repo; the user's rules and how the plan holds them:

- No tests, no CI: none added. Each slice is checked by typecheck plus a live run on a fixture PR.
- Groq and Gemini only: no provider added; Socket is a package lookup, not a model.
- SQLite behind the repository layer: `learnings` gets `db/repos/learnings.ts`; routes never query.
- Dashboard: simple, clean, short labels, no explanatory text, no em-dashes in new copy.
- `apps/web` untouched.

## Operational commitments

- **OP-1** Generate a Drizzle migration in every slice that changes `schema.ts`; applied at boot.
- **OP-2** Create the fixture repos and branches F3 to F9 in `prguard-sandbox` when a slice first needs
  them; scripts live in the scratchpad.
- **OP-3** Badge images: generated, published to `prguard-assets` and tagged `v1` (done before this
  plan). A later change to any badge is published under a new tag and `ASSET_BASE_URL` moves with it.
- **OP-4** Add `ASSET_BASE_URL`, `SOCKET_DEV_API_KEY` and the feature switches to `.env.example`.
- **OP-5** Stop the old Docker stack before the first live check, so only one process consumes
  webhooks; slices run the API locally (`npm run dev -w apps/api`) with the smee relay.
- **OP-6** Final run: `docker compose up --build` on a fresh volume.

## Slices

Eight stages, cut into 37 commit-sized slices in [tasks.md](tasks.md). Each leaves both apps running.

1. **GitHub output.** Badge generator and assets, image badges and the line-comment layout, the review
   body, backticks, change-flow diagram. *Kill switch:* `ASSET_BASE_URL=` posts text labels; the
   diagram is skipped when the summary has no flow.
2. **Plugins and reviewers.** Plugins v2, then Security, Reliability, Performance, Data, AI slop, Docs
   drift, Test gap. *Kill switch:* every plugin is switched off per repo in the dashboard.
3. **Engine.** Triage, impact, Breaking change, verification, Secrets, Supply chain, dashboard pills.
   *Kill switch:* `TRIAGE=off`, `VERIFY=off`, unset `SOCKET_DEV_API_KEY`, per-repo toggles.
4. **Ranking.** Risk, then priority with labels. *Kill switch:* none needed; both are read-only labels.
   Columns stay if rolled back.
5. **Across pushes.** Comment ids, fix detection, Fixed marking, since-last counts. *Kill switch:*
   `TRACK_FIXES=off`. Edits already made to GitHub comments are not reverted.
6. **Learnings and commands.** Learnings and the panel, command plumbing with `help` and `review`,
   questions and `explain`, `fix`, `ignore`, reply learning, 👎 learning. *Kill switch:* `COMMANDS=off`;
   learnings can be switched off one by one.
7. **Dashboard.** Finding cards, trace, Queue, Insights. *Kill switch:* not needed; read-only views.
8. **Wrap-up.** README and env, Go and Java runs, clean-volume Docker run. *Kill switch:* not
   applicable.

Migrations are additive and not reversed; rolling back code leaves unused columns, which is harmless.

## Open items

None blocking. Socket's exact response fields are read from the SDK types in slice 19. The review
URL in buttons points at `DASHBOARD_URL` (`localhost:3001`) until a deploy.
