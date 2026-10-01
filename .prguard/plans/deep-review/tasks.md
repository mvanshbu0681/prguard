# Tasks: Deep review

From [plan.md](plan.md). One slice is one commit, in order. Every slice leaves the API and the
dashboard running. No tests: each Verify note is a typecheck plus a live check on a fixture PR
(fixtures F1 to F9 in [plan.md](plan.md#fixtures)).

Checks used below:
- **typecheck**: `npm run typecheck` (API and dashboard, `tsc --noEmit`).
- **migrate**: `npm run db:generate -w apps/api` writes the next `0001…` file; the API applies it at boot.
- **live**: API `npm run dev -w apps/api` (smee relay, `DEV_LOGIN=1`), dashboard `npm run dev -w apps/dashboard`.
  Fixture PRs are opened with the scratchpad scripts (`open-pr.mjs <repo> <branch>`, `wait.mjs`), GitHub
  output read with `gh api`, visuals checked in Chrome (GitHub light and dark, dashboard on :3001).
- **grep-emoji**: `rg "🛑|🔴|🟠|🟡|💬" apps/api/src` finds nothing.

Rules for every slice: short, literal UI copy; no em-dashes in new copy or comments; code in backticks
in every model prompt; `db/repos/*` is the only DB access; no new provider.

## Stage 1: GitHub output

### 1. Badge generator and images

`chore: badge generator and published badge images`

- Commit what is already on disk: `scripts/badges/{catalog,html,preview,render}.ts`,
  `assets/badges/img/*.png`, `assets/badges/img/manifest.json`, `assets/badges/preview.png`, root
  `package.json` (`"type": "module"`, `badges` script), `playwright-core` dev dependency, lockfile.
- `render.ts` also writes the manifest to `apps/api/src/review/badges.json`.
- `scripts/badges/README.md` (5 lines): run `npm run badges`, publish to `prguard-assets` under a new
  tag, move `ASSET_BASE_URL`.

Runs OP-3.

**Verify:** `npm run badges` prints `199 badges`; `apps/api/src/review/badges.json` has 199 entries;
`curl -I https://cdn.jsdelivr.net/gh/prguard-sandbox/prguard-assets@v1/img/sev-high.png` is 200.

### 2. Image badges and the new line comment

`feat(api): image badges and the new line-comment layout`

- `config.ts`: `ASSET_BASE_URL` (default the jsDelivr `@v1/img` URL; empty string allowed).
- `review/badges.ts`: loads `badges.json` once; `badge(name)` returns
  `<img src="{base}/{name}.png" width="{w}" height="{h}" alt="{alt}">`; with an empty base returns
  `**{ALT}**`; `sevBadge(s, n?)` (`sev-<s>-<n>`, `-many` above 20), `reviewerBadge(id)`, `statusBadge`,
  `priorityBadge`, `riskBadge`, `link(url, html)`.
- `review/agent-prompt.ts`: `agentPrompt(f)`: "In `path` lines a-b: title. Problem: body. Fix: apply
  this change … / make the smallest change that resolves it, keeping the file's style."
- `review/publish.ts` `commentBody(f, reviewUrl)`: badge row (severity, reviewer badges from
  `f.reviewer.split("+")` up to 2, Verified when `f.verified`), blank line, `**title**`, body,
  suggestion block, `<details><summary>Evidence</summary>` when `f.evidence`,
  `<details><summary>{details.title}</summary>` when `f.details`, `<details><summary>Prompt for AI
  agents</summary>` with a fenced block, then the "View in PR Guard" image linked to
  `{reviewUrl}#f-{fingerprint}`. Remove the `LABEL` emoji map; the body "not attached" list uses the
  same badges.
- Dashboard `finding-card.tsx`: `id="f-{fingerprint}"` on the card (API adds `fingerprint` to
  `FindingItem`); review page scrolls to `location.hash` once findings render.
- Stop the old Docker stack (`docker compose down`) so only the local API consumes webhooks.

Satisfies AC-19, AC-22. Runs OP-5.

**Verify:** typecheck; grep-emoji clean. Live on F1: every line comment starts with a severity and a
reviewer image, has "Prompt for AI agents" folded, and its button opens `/reviews/<id>#f-…` scrolled to
that card. Images render in GitHub light and dark. Restart with `ASSET_BASE_URL=` and re-run: same
comments with bold text labels and no `<img>`.

### 3. Review body with badges and a findings table

`feat(api): review body with badges, a findings table and buttons`

- `publish.ts` `reviewBody`: header row `logo`; summary; severity count badges or "No issues found.";
  findings table `| | Finding | Where |` with `sevBadge`, title, and `[path:line](blob link at head)`
  for inline and body findings; body-only findings keep their text under "Not attached to a line";
  `<details>` Key changes (table), Nits (hidden ones listed), Skipped files; note as a quote line;
  "Open full review" image linked to the review URL. Heading line for incremental reviews stays as
  small text ("New commits `a..b`").
- Size guard: build sections in order, drop folded sections from the end, then trim table rows with
  "and N more", staying under 60,000 characters.
- Check run summary: the same header, summary and table, without the button.

Satisfies AC-20, EC-22, EC-24.

**Verify:** typecheck. Live on F1 and F2: the body matches the approved preview order; table links open
the right lines; nits appear folded. A PR with 25 low findings shows the `20+` badge. Force a long body
(temporarily lower the limit to 3,000 in a local edit, not committed): folded sections drop first and
the markdown still renders.

### 4. Code in backticks

`feat(api): code terms in backticks in everything PR Guard writes`

- `review/codify.ts`: `codeTerms(files)` collects tokens from added and context lines with an
  underscore, an inner capital, a dot between identifiers, or a trailing `()`, plus changed file paths;
  `codify(text, terms)` wraps occurrences outside code spans, fences and links.
- Prompt rule appended in `reviewing.ts`, `summarize.ts` and the brief prompt: "Put identifiers, file
  paths, commands, config keys and literal values in single backticks."
- Apply `codify` to finding titles and bodies (in `processFindings`), summary and key changes (in
  `run.ts`). Dashboard already renders markdown and `InlineCode`; no change there.

Satisfies AC-23.

**Verify:** typecheck. Live on F1: `create_refund`, `db.get` and `get_owned_invoice` are in backticks
in comments, summary and key changes, on GitHub and on the review page; no plain word like "refund"
got wrapped.

### 5. Change-flow diagram

`feat(api): change-flow diagram in the review body`

- `summarize.ts` schema: `flow: { nodes: [{ id, label }] (max 8), edges: [{ from, to, label? }] }`;
  prompt: "the main path the change adds or alters, as steps".
- `review/flow.ts`: `flowMermaid(flow)` returns `flowchart LR` with `n1["label"]` nodes, escaped
  quotes, brackets and pipes; null when fewer than 2 connected nodes. Store on `reviews.flow`
  (migrate).
- `reviewBody`: `<details><summary>How the change flows</summary>` with a fenced `mermaid` block.

Satisfies AC-21, EC-20. Runs OP-1.

**Verify:** typecheck; migrate. Live on F1: the folded diagram renders on GitHub with the refund path
steps. A docs-only PR has no diagram. Feed `flowMermaid` a label with `"` `[` `|` in a node REPL: the
output renders when pasted into a GitHub comment preview.

## Stage 2: Plugins and reviewers

### 6. Reviewer plugins v2, Bug and Team rules

`feat(api): reviewer plugins with file scopes, badges and a Team rules reviewer`

- `reviewers/define.ts`: `ModelReviewer` and `Check` types, `defineReviewer`, `defineCheck`, `Applies`,
  `needs`; registry exports `reviewers`, `modelReviewers`, `checks`, `enabledPlugins(disabled)`.
- `run.ts`: per model reviewer, filter files by `appliesTo`, pack its own chunks, build tasks
  `reviewer x chunk`; the budget estimate per task is unchanged. Checks slot added (empty until 18).
- `general.ts`: name "Bug", badge `general`, instructions narrowed to logic errors, wrong conditions,
  null paths, error paths and unhandled edge cases; "not security, performance or team rules".
- `rules.ts` (new): Team rules, `fast`, no tools, instructions "report only violations of the team
  rules and the brief's Conventions; quote the rule broken"; `needs.rules`.
- `context.ts`: `buildContext(pr, repo, { rules })`; only Team rules gets the rules section.
- Raw finding and `Finding` gain `details`; `findings.details` column (migrate); `commentBody` folds it.
- `REVIEW_PARALLELISM` 4; `REVIEW_TOKEN_BUDGET` default 400000.

Satisfies AC-15, EC-26. Runs OP-1.

**Verify:** typecheck; migrate. Set the repo rule "never use `print` for logging" on `acme-billing`.
Live on F1: the `print` finding carries the Team rules badge only; Bug findings carry the Bug badge; a
finding merged from two reviewers shows two reviewer badges.

### 7. Security reviewer

`feat(api): Security reviewer`

- `reviewers/security.ts`: smart, tools, 3 steps, source and config; instructions: missing
  authentication or authorization (object access by id, compare with neighbouring endpoints using the
  tools), injection (SQL, shell, template, path), SSRF, open redirect, unsafe deserialization, XSS,
  sensitive data in logs or responses, insecure defaults, trusting client values; "secrets are handled
  by another check".

Satisfies AC-8.

**Verify:** typecheck. Live on F1: a Security finding on the `create_refund` ownership line.

### 8. Reliability reviewer

`feat(api): Reliability reviewer`

- `reviewers/reliability.ts`: smart, no tools, source; instructions: swallowed or over-broad exception
  handling, missing `await`, multi-step writes without a transaction, check-then-act races,
  non-idempotent retries, leaked files, connections or streams, network calls without timeouts,
  retries without backoff, partial failure leaving inconsistent state.

Satisfies AC-9.

**Verify:** typecheck. Live on F2: a Reliability finding on the swallowed `try/catch`.

### 9. Performance reviewer

`feat(api): Performance reviewer`

- Create fixture F4 (`acme-store` `feat/order-history`).
- `reviewers/performance.ts`: fast, no tools, source; instructions: queries or network calls inside
  loops, unbounded reads without limits, loading whole tables or files, repeated expensive work,
  quadratic loops over growing collections, blocking I/O on request paths, heavy recomputation in UI
  renders; "only when the input can realistically be large".

Satisfies AC-10. Runs OP-2 (F4).

**Verify:** typecheck. Live on F4: a Performance finding on the query in the loop.

### 10. Data reviewer

`feat(api): Data reviewer for schema and migration files`

- Create fixture F5 (`acme-billing` `feat/ledger-migration`).
- `reviewers/data.ts`: smart, no tools; `appliesTo` paths matching `migrations?/`, `alembic/`,
  `schema`, `models?`, `entities`, `prisma`, `*.sql`; instructions: destructive migrations without a
  data step, NOT NULL without default or backfill, money as float, timestamps without timezone,
  precision loss, missing index for new queries or foreign keys, missing unique constraints the code
  relies on, schema and model out of sync.

Satisfies AC-11. Runs OP-2 (F5).

**Verify:** typecheck. Live on F5: Data findings on the dropped column and the `Float` money column.
The trace (from slice 14 on) or the logs show Data received only schema, model and migration files.

### 11. AI slop reviewer

`feat(api): AI slop reviewer`

- Create fixture F3 (`acme-store` `feat/gift-cards`), adding `tests/` to the base if missing.
- `reviewers/slop.ts`: smart, tools, 3 steps, source; instructions: imports or APIs that do not exist
  (check with the tools), new functions duplicating an existing helper (search, name its path),
  placeholder logic (hard-coded returns, stubs on main paths, fake data outside tests), dead or
  unreachable code, unused parameters, comments that restate code, checks that cannot fail, style
  that ignores the brief's conventions; severity usually low or medium, high for placeholders on a
  main path.

Satisfies AC-12. Runs OP-2 (F3).

**Verify:** typecheck. Live on F3: an AI slop finding naming the existing money formatter's path, and
one on the placeholder `return true`.

### 12. Docs drift reviewer

`feat(api): Docs drift reviewer`

- `reviewers/docs.ts`: fast, tools, 3 steps, source and config; instructions: new or renamed env vars,
  config keys, CLI flags, routes or public API that README, docs or `.env.example` do not describe or
  describe differently (search them); docstrings describing old behavior; anchor on the code line.

Satisfies AC-13.

**Verify:** typecheck. Live on F3: a Docs drift finding on the line reading `GIFT_CARD_PROVIDER_URL`.

### 13. Test gap reviewer

`feat(api): Test gap reviewer`

- `reviewers/tests.ts`: fast, tools, 2 steps, source, `needs.testsInRepo`; instructions: only when
  behavior changes in source and no test covering it changes; find existing tests with the tools;
  body names the untested behavior; `details` = "Suggested tests" with 3 to 5 cases (input, expected).
- `run.ts`: skip it when the snapshot has no test files (`fileKind === "test"` walk, capped); keep only
  its highest-severity finding.

Satisfies AC-14.

**Verify:** typecheck. Live on F3: one Test gap finding with a folded "Suggested tests" list. Live on a
PR in `pg-scratch` (no tests): no Test gap call in `llm_calls`.

## Stage 3: Engine

### 14. Trace and triage

`feat(api): triage routes each file to the reviewers that matter`

- `review/trace.ts`: `Tracer` with `step(key, fn)` (status, ms, detail) and `funnel`; saved to
  `reviews.trace` at the end of every run, including failures.
- `review/triage.ts`: one `structured` fast call (schema `files: [{ path, risk, reviewers[] }]`);
  input per file: kind, `+/-`, hunk headers, first 6 added lines, candidate reviewers with
  descriptions. Bug and Team rules always kept for source files; unknown names dropped; missing files
  and failures fall back to all candidates.
- `reviews.triage` column (migrate). `run.ts` uses the routes when building per-reviewer file sets.
- `TRIAGE=off` switch in config.

Satisfies AC-1, EC-1. Runs OP-1.

**Verify:** typecheck; migrate. Live on F1: `reviews.triage` has every file with a risk and reviewers;
`llm_calls` shows a reviewer never received a file it was not routed (compare purposes and chunk
files in the log line "reviewer task"). With a bad `MODEL_FAST` for one run (typo), triage fails and
the review still completes with all candidates.

### 15. Impact analysis

`feat(api): impact analysis from the head snapshot`

- `review/impact.ts`: definition patterns for TS/JS, Python, Go, Java; symbols whose definition spans a
  changed line; skip names under 4 characters and a common-name list; one combined word-boundary pass
  over the snapshot (skip dirs as in `tools.ts`, 6000 files max); refs, files, 5 samples; over 200 refs
  keep counts only.
- `renderImpact`: "## Impact" section: symbol, defined at `path:line`, N references in M files, samples.
- `reviews.impact` column (migrate); Bug and Security get the section (`needs.impact`).
- Trace step `impact` with "N symbols, M references".

Satisfies EC-2. Runs OP-1.

**Verify:** typecheck; migrate. Live on F4: `reviews.impact` lists the changed exported function with
its reference count and the two caller files; the Bug prompt (debug log) contains the section; a
symbol named `get` is absent.

### 16. Breaking change reviewer

`feat(api): Breaking change reviewer`

- `reviewers/breaking.ts`: smart, tools, 3 steps, source, `needs.impact: "required"`; instructions:
  changed signatures, return shapes, renamed or removed exports, changed defaults that callers rely on;
  name each caller not updated as `path:line`, confirmed with the tools; API response and schema
  changes readers depend on.
- `run.ts`: run it only when a changed symbol has references outside the PR's files.

Satisfies AC-2.

**Verify:** typecheck. Live on F4: a Breaking change finding naming a caller file and line that the PR
did not update. Live on F1: no Breaking change call (no outside references).

### 17. Verification

`feat(api): verify findings before posting`

- `review/verify.ts`: group model findings of severity medium and up by file; one `agent` call each
  (smart, repo tools, 3 steps) with ±30 lines per finding; answer tool `submit_verdicts`; `rejected`
  needs cited code, else counts as `unsure`.
- `findings.verified`, `findings.evidence` columns (migrate); `Finding` gains both; `commentBody` shows
  the Verified badge and folded Evidence (codified).
- `run.ts` order: dedupe, repeats, then verify, then caps. Rejected go to the trace with the reason.
  Skip when the budget left is below the estimate. `VERIFY=off` switch.

Satisfies AC-3, AC-4, EC-3. Runs OP-1.

**Verify:** typecheck; migrate. Live on F1: all 5 planted bugs posted; each confirmed one has Verified
and Evidence on GitHub; `reviews.trace` lists any rejected finding with its reason. Kill the network
for the verifier (temporarily point it at a bad model in a local edit, not committed): findings post
unverified.

### 18. Secrets check

`feat(api): secret detection on added lines`

- `checks/secrets.ts` (`defineCheck`, badge `security`): patterns listed in the plan; generic rule with
  Shannon entropy at least 3.5; skip placeholders, `.env.example`, docs, `fixtures`/`testdata` paths;
  title "A `<kind>` is committed in `path`", body "Rotate it now; deleting it from the code does not
  remove it from history." Never includes the value; log lines carry only kind and path.
- `run.ts`: checks run in parallel with the model reviewers; their findings skip verification and are
  `fromCheck`.

Satisfies AC-5, EC-4.

**Verify:** typecheck. Live on F5: a Critical Security finding on the secret's line. `rg` for the
secret value in the review body, comments (`gh api`), `data/prguard.db` (`sqlite3 … "select body from
findings"`) and the API log finds nothing. A line `API_KEY = "your-api-key"` in the same PR is not
flagged.

### 19. Supply chain check with Socket

`feat(api): supply-chain check through Socket`

- Add `@socketsecurity/sdk` to `apps/api`; read its types for `batchPackageFetch` results.
- `integrations/socket.ts`: client from `SOCKET_DEV_API_KEY`; `lookup(purls)` returns merged
  `{ purl, name, version, ecosystem, score, alerts[] }`.
- `checks/manifests.ts`: parsers for `package.json` (added lines resolved against the head file's
  dependency blocks), `requirements*.txt`, `pyproject.toml`, `go.mod`; lowest version of a range;
  removed lines ignored.
- `checks/supply-chain.ts`: severity mapping from the plan; one finding per package on its manifest
  line; link to `https://socket.dev/<npm|pypi|go>/package/<name>`; `details` "What Socket found".
- `noise.ts`: `requirements*.txt` and other manifests are config, not docs.
- `config.ts` `SOCKET_DEV_API_KEY`; trace step `checks` with "N packages, M flagged" or "skipped".
- Create F6 and the `acme-gateway` repo (Go module with a `go.mod`).

Satisfies AC-6, AC-7, EC-5, EC-6, EC-7, EC-8. Runs OP-2 (F6), OP-4 (the key in `.env.example`).

**Verify:** typecheck. Live on F6: Critical Supply chain findings on the `toga-ai` and `@whalent/agent`
lines in `package.json` and the module line in `go.mod`, each linking to socket.dev (link opens); a
`requests` finding listing its CVEs; the requirements-only PR is not "documentation only". Unset the
key and re-run: review completes, trace says "skipped", no note on GitHub.

### 20. Dashboard pills and palette

`feat(dashboard): badge palette, reviewer pills and all plugins in the Reviewers panel`

- `globals.css`: severity hues set to the badge colors; tokens for priority (p0 to p3), risk (low,
  medium, high) and the 11 reviewer hues.
- `components/ui/pills.tsx`: `ReviewerPill` (dark chip, colored Lucide icon, label), `PriorityPill`,
  `RiskPill`, `FindingStatus`; icons match the badge catalog.
- `ReviewersPanel`: each plugin row shows its `ReviewerPill` and description; API `ReviewerInfo` gains
  `badge` and `kind`.
- `FindingCard`: reviewer pills replace the reviewer text (up to 2).

Satisfies AC-16, AC-41.

**Verify:** typecheck. Dashboard: the `acme-billing` Reviewers panel lists 12 plugins; switching off
AI slop and re-running F3 shows no AI slop call in `llm_calls` and no AI slop step in the trace.
Severity pills match the GitHub badge hues side by side.

## Stage 4: Ranking

### 21. Risk

`feat: risk level with reasons on reviews and PRs`

- `review/risk.ts`: scoring from the plan; reasons as short codified phrases.
- Columns `risk`, `risk_score`, `risk_reasons` on `reviews` and `pull_requests` (migrate).
- GitHub: `riskBadge` in the header row, reasons line under the summary.
- API: `ReviewListItem.risk`, `ReviewDetail.riskReasons`. Dashboard: `RiskPill` and reasons in the
  review header; null risk shows nothing.

Satisfies AC-17, EC-23. Runs OP-1.

**Verify:** typecheck; migrate. Live on F1: High risk with reasons naming payments and a caller count;
a docs-only PR is Low. An old review from before the migration loads without errors.

### 22. Priority

`feat: PR priority from business impact, labels and findings`

- `summarize.ts` schema: `change_type`, `business_impact`, `impact_area`.
- `review/priority.ts`: rules from the plan; reason "`impact_area`; extra" codified.
- `pull_requests.labels` from webhooks and the live PR; `labeled`/`unlabeled` events store labels and
  re-rank from the latest review's stored signals (no model call).
- Columns `priority`, `priority_reason` on `reviews` and `pull_requests` (migrate).
- GitHub header gets `priorityBadge`. API `?priority=` filter. Dashboard: `PriorityPill` in the review
  header; reviews list column "Priority" (priority pill, risk pill) and a priority `Select`.
- Create F9.

Satisfies AC-18, AC-36, EC-21. Runs OP-1, OP-2 (F9).

**Verify:** typecheck; migrate. Live: F1 is P1 or P0 with a reason; F9 (label `hotfix`) is P0; F6
(malware) is P0; adding label `urgent` to F2 moves it to P0 in the dashboard within one poll. Filter
"P0" shows only P0 reviews.

## Stage 5: Across pushes

### 23. Findings linked to their GitHub comments

`feat: store each finding's GitHub comment and code snippet`

- Columns `status`, `snippet`, `github_comment_id`, `github_node_id`, `github_comment_url`,
  `fixed_in_sha`, `fixed_at`, `dismissed_by`, `dismissed_at`, `learning_id` (migrate).
- `github/pr.ts` `listReviewCommentsOf`; `review/tracking.ts` `recordCommentIds` matches by path and
  body after posting (also after a 422 fallback, where nothing matches).
- `snippet` = the finding's lines from the head file at publish.
- Dashboard `FindingCard`: status pill (Open) and a "Comment" link to `github_comment_url`.

Satisfies AC-37 (status part; completed in slice 32). Runs OP-1.

**Verify:** typecheck; migrate. Live on F1: every inline finding row has a comment id, node id, URL
and snippet; the card's Comment link opens that exact comment.

### 24. Fix detection

`feat: mark findings fixed when a later push fixes them`

- `github/pr.ts` `reviewThreads` (GraphQL `isOutdated`), `updateReviewComment`, `minimizeComment`.
- `tracking.ts` `detectFixes`: outdated threads of open findings; locate the snippet in the head
  snapshot (±15 lines) or mark deleted; `fast` structured `[{ index, fixed, reason }]` per 10.
- Fixed: status and sha saved; comment body prefixed with the Fixed badge line "Fixed in `abc1234`";
  minimized as `RESOLVED`; errors logged.
- `reviews.since` `{ fixed, new, open }` (migrate); body line "Since the last review" with status
  badges; check run title "N open · 1 high" (or "All fixed"); silent pushes still mark fixes and update
  the check run. `TRACK_FIXES=off` switch.

Satisfies AC-24, AC-33, AC-34, EC-15, EC-16, EC-17. Runs OP-1.

**Verify:** typecheck; migrate. Live on F1: push a commit that fixes the ownership check and only
reformats the float line. The ownership comment shows Fixed and is collapsed; the float finding stays
open; the new check run title counts open findings; the body's since line shows 1 fixed. Force-push
the branch: detection still runs on outdated threads. Delete a comment by hand, then fix its code: the
dashboard shows Fixed and the log records the failed edit.

## Stage 6: Learnings and commands

### 25. Learnings

`feat: per-repo learnings with a dashboard panel`

- `learnings` table and `db/repos/learnings.ts` (migrate).
- `learnings/apply.ts`: prompt section of the 30 most recent enabled learnings (Team rules and
  verification prompts), `suppress()` in `processFindings` after repeats; critical check findings
  exempt; suppressed ones go to the trace.
- `learnings/learn.ts`: `learnFrom` with the `fast` sentence and a deterministic fallback.
- Routes `GET/POST /api/repos/:id/learnings`, `PATCH/DELETE /api/repos/:id/learnings/:lid` (admin for
  writes). Dashboard `LearningsPanel` on the repo page: list (text, source, author, date, link), add
  box, switch, delete; read-only for non-admins.

Satisfies AC-32, AC-40, EC-18, EC-19. Runs OP-1.

**Verify:** typecheck; migrate. Add a manual learning on `acme-billing` ("Float money columns in
`app/models.py` are intentional legacy") and re-run F1: the float finding is not posted and the trace
lists it as suppressed. Add a learning matching the F5 secret: the secret is still posted. As a
non-admin (dev login without admin), the panel has no add box.

### 26. Commands: plumbing, help and review

`feat(api): @prguard commands with help and review`

- `commands/events.ts`: `issue_comment` and `pull_request_review_comment` handlers (`created`, PR
  only, not bots); `commands/parse.ts` (mention `@prguard` or `@<slug>`, command word, args); 👀 on
  the comment, then enqueue `pr_command` (key `cmd:<commentId>`).
- `commands/run.ts`: job handler; `help` (and empty mention) replies with the command list; `review`
  calls `triggerReview(…, "command")`; closed PR replies "This pull request is closed." for `review`
  and `fix`. `resolveScope` treats `command` like `manual`.
- `github/pr.ts`: `createIssueComment`, `replyInThread`, `reactToComment`. `COMMANDS=off` switch.

Satisfies AC-25, EC-9, EC-10, EC-12, EC-13, EC-14, EC-25.

**Verify:** typecheck. Live on an open fixture PR: `@prguard review` gets 👀 within 5 s and a new
review runs, superseding one in progress; `@prguard` alone and `@prguard help` list commands; a
comment by the bot itself is ignored; redelivering the webhook from the App page does not reply twice;
`@prguard review` on a closed PR gets the closed reply.

### 27. Questions and explain

`feat(api): answer questions and explain findings`

- `commands/answer.ts`: `smart` agent on the head snapshot with tools (4 steps), answer tool
  `reply { body }` (at most 250 words, codified); context: brief, PR title and body, latest summary,
  and either the thread's finding with its code window or the PR's changed files.
- Dispatch: `explain` in a PR Guard thread; any other text as a question, in the thread or the
  conversation; `explain`, `fix`, `ignore` outside a PR Guard thread get a usage reply.

Satisfies AC-26, AC-28, EC-11.

**Verify:** typecheck. Live on F1: `@prguard explain` in the ownership thread replies in the thread
citing `path:line`; "@prguard where is the refund total computed?" in the conversation gets an answer
in the conversation naming the function; `@prguard explain` in the conversation gets the usage reply.

### 28. Fix command

`feat(api): @prguard fix replies with a suggestion`

- `commands/fix.ts`: agent returns replacement code for the finding's line range; validated with
  `fitSuggestion` against the current diff; reply `suggestion` block plus one line; outdated thread
  replies "The code under this comment changed. Ask on the new lines."

Satisfies AC-27.

**Verify:** typecheck. Live on F1: `@prguard fix` in the float-money thread replies with a suggestion;
"Commit suggestion" on GitHub produces valid Python (checked with the scratchpad suggestion script).

### 29. Ignore command

`feat(api): @prguard ignore dismisses the finding and saves a learning`

- `commands/ignore.ts`: status `dismissed`, `dismissed_by`, learning from the finding and reason
  (source `command`), reply with the Learning saved badge and the learning text, minimize the comment
  as `RESOLVED`, refresh the latest check run title.

Satisfies AC-29.

**Verify:** typecheck. Live on F1: `@prguard ignore float is fine for legacy rows` in the float thread:
reply with the badge; comment collapsed; learning in the repo panel with source "command" and a link;
check run open count drops by one.

### 30. Learning from replies

`feat(api): learn from replies that say the code is intentional`

- `commands/replies.ts`: review-comment replies without a mention in a PR Guard thread enqueue
  `pr_reply`; one `fast` call classifies `intentional | disagree | question | thanks | other`; the first
  two dismiss, learn (source `reply`) and reply "Noted. I'll remember this for `repo`." with the badge.

Satisfies AC-31.

**Verify:** typecheck. Live on F2: reply "this is on purpose, the error is logged upstream" in a thread:
learning saved and one-line acknowledgment; reply "thanks!" in another thread: no response.

### 31. Learning from 👎

`feat(api): learn from 👎 on PR Guard comments`

- `commands/reactions.ts` `sweepReactions(pr)`: `listPullComments` reaction counts; open findings with
  a 👎 are dismissed with a learning (source `reaction`) and minimized. Called at the start of each
  review and by a `sweep_reactions` job on `pull_request` `closed`.

Satisfies AC-30.

**Verify:** typecheck. Live on F2: 👎 one PR Guard comment, then push: the finding is dismissed and the
learning exists. 👎 another, then close the PR: same within a minute. Re-run from the dashboard after a
third 👎: same.

## Stage 7: Dashboard

### 32. Finding cards in full

`feat(dashboard): verified findings, evidence, status and the agent prompt`

- API `FindingItem`: `reviewers[]`, `verified`, `evidence`, `details`, `status`, `agentPrompt`.
- `FindingCard`: Verified mark beside the severity, Evidence and details as `Collapsible`s, status
  pill (Open, Fixed, Dismissed), "Copy prompt" button (copies `agentPrompt`, shows "Copied").
- Findings list keeps severity order; fixed and dismissed sink to the end.

Satisfies AC-37.

**Verify:** typecheck. On the F1 review page: Verified cards show Evidence; the fixed finding from slice
24 shows Fixed; Copy prompt puts the same text as GitHub's "Prompt for AI agents" on the clipboard.

### 33. Review trace

`feat: review trace on the review page`

- `llm_calls.tools` (migrate); `agent()` records `toolName` plus the first argument for each call.
- API `ReviewDetail`: `trace`, `triage`, `impact`, `since`, `calls[]` (purpose, model, tokens, ms, ok,
  tools).
- `components/reviews/trace.tsx`: collapsed "Trace" section: step rows (label, detail, duration);
  triage table (file, risk, reviewers as pills); impact list; reviewer calls grouped by reviewer with
  tools as `InlineCode`; funnel as one line of numbers; rejected and suppressed lists.

Satisfies AC-38. Runs OP-1.

**Verify:** typecheck; migrate. F1 review page: every step appears with a duration; the Security row
lists `search_code` or `read_file` calls; rejected and suppressed entries match `reviews.trace`. An old
review shows no Trace section.

### 34. Queue

`feat: Queue page ranking open PRs by priority and risk`

- `http/routes/queue.ts`: open, non-draft PRs in visible repos with priority, reasons, risk, open
  severity counts, fixed count, latest review.
- `app/(app)/queue/page.tsx` and `components/queue/*`: four columns plus Waiting; cards as in the plan;
  sort by risk then age; polls every 5 s while any review is active, else 30 s. Top bar gains Queue.

Satisfies AC-35.

**Verify:** typecheck. With F1, F2, F4, F6, F9 open: F9 and F6 in P0, cards show risk and counts; open a
new fixture PR and see it in Waiting, then move to its column when the review completes, without a
reload. A user without access to `acme-billing` does not see its PRs (dev route with a limited user).

### 35. Insights

`feat: Insights page with review and reviewer metrics`

- `http/routes/insights.ts`: aggregates over the last `days` (default 30) for visible repos or one:
  reviews, median minutes from review creation to finish, median tokens, per reviewer posted, fixed,
  dismissed, open, by severity, verification confirmed, rejected, unverified.
- `app/(app)/insights/page.tsx`, `components/insights/*`: repo `Select`, three stat tiles, reviewer
  bars split by fixed, dismissed and open, severity bars, verification line. Top bar gains Insights.

Satisfies AC-39.

**Verify:** typecheck. Numbers match SQL run by hand on `data/prguard.db` for `acme-billing` (reviews
count, fixed count for Security); switching the repo updates every figure.

## Stage 8: Wrap-up

### 36. Docs, env and other languages

`docs: reviewers, commands and settings; Go and Java checked`

- `.env.example`: `ASSET_BASE_URL`, `SOCKET_DEV_API_KEY`, `TRIAGE`, `VERIFY`, `TRACK_FIXES`,
  `COMMANDS`. README: reviewer table, commands, learnings, badges and how to regenerate them.
- Create `acme-gateway` F7 (Go) and `acme-ledger` with F8 (Java); run both.

Satisfies AC-42. Runs OP-2 (F7, F8), OP-4.

**Verify:** F7 and F8 each get findings on at least 2 of their 4 planted lines; both repos got a brief
automatically.

### 37. Clean Docker run and build notes

`chore: clean-volume Docker run and build notes for deep review`

- `docker compose up --build` on a fresh volume (`docker volume rm prguard_prguard-data`), with
  `API_NODE_ENV=development DEV_LOGIN=1`.
- `SUMMARY.md` and `GAPS.md` in this plan folder.

Satisfies AC-43. Runs OP-6.

**Verify:** in Docker: F1 end to end (badges, verified findings, risk, priority), F6 Socket findings,
`@prguard explain` reply, a fix push marked Fixed, Queue and Insights populated, dashboard reachable
on :3001.

## Deferred

- Maven, Cargo and RubyGems manifests for Supply chain: Socket supports them, but no fixture repo needs
  them and the user asked for npm, PyPI and Go.
- Resolving review threads (instead of collapsing comments): needs the Contents write permission, which
  the App does not have and the user did not ask to add.
- Mermaid rendering in the dashboard: it would add a large client library for a view GitHub already
  renders.
