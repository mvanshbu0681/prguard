# Tasks: PR Guard MVP

From [plan.md](plan.md). One slice is one commit. Slices run in order; each leaves the API and, from
slice 14, the dashboard running. No tests: every Verify note is a typecheck plus a manual run against
the `prguard-sandbox` org.

Checks used below:
- `npm run typecheck -w apps/api` / `-w apps/dashboard` (`tsc --noEmit`)
- `npm run dev -w apps/api` (API on :8000 with the smee relay), `npm run dev -w apps/dashboard` (:3001)

## Backend: the platform

### 1. API skeleton

`feat(api): boot the API with config, SQLite and a health check`

- Root `package.json` with workspaces `apps/api`, `apps/dashboard`; `.gitignore` adds `data/`.
- `apps/api`: `package.json` (type module, `dev` = `node --watch --env-file=../../.env src/index.ts`),
  `tsconfig.json` (noEmit, erasableSyntaxOnly, allowImportingTsExtensions, strict).
- `config.ts` (zod; paths from the repo root; private key from path or inline), `log.ts`.
- `db/client.ts` (WAL, migrate at boot), `db/schema.ts` with `installations`, `repositories`,
  `webhook_deliveries`, their `db/repos/*`, `drizzle.config.ts`, first migration (OP-1).
- `http/server.ts` with `GET /api/health`; `index.ts`.

Runs OP-1.

**Verify:** typecheck clean; API starts, `data/prguard.db` exists, `curl :8000/api/health` is ok.

### 2. Installation sync

`feat(api): sync installations and repos from GitHub at boot`

- `github/app.ts` (App, installation clients), `github/reconcile.ts` (all installations and their
  repos upserted; ones gone from GitHub marked deleted / removed).

**Verify:** typecheck clean; boot log lists `prguard-sandbox` and its repos; rows in the DB.

### 3. Webhooks

`feat(api): receive GitHub webhooks through the smee relay`

- `POST /api/webhooks`: signature check, delivery dedupe, 200 before slow work.
- `installation` (created, deleted, suspend, unsuspend) and `installation_repositories` (added,
  removed) handlers.
- `index.ts` starts smee when `WEBHOOK_PROXY_URL` is set.

Satisfies EC-9.

**Verify:** typecheck clean. Create a sandbox repo: the added event lands and the repo row appears.
Redeliver a webhook twice from the App's Advanced page: the second is ignored.

## Backend: reviews

### 4. Instant acknowledgment

`feat(api): acknowledge new PRs with a reaction and a check run`

- Schema + repos: `pull_requests`, `reviews`, `jobs`.
- `queue/queue.ts` (enqueue with key, atomic claim, heartbeat, finish, fail) and `queue/worker.ts`
  (`WORKER_CONCURRENCY` loops, job registry, wake on enqueue).
- `pull_request` handler for opened / reopened / ready_for_review / synchronize on non-draft PRs:
  upsert PR, create review + job, then ack without awaiting (👀, `PR Guard` check run in progress
  linking to the dashboard review).
- `github/pr.ts`: reactions and check runs. The `review_pr` job, for now, completes the check run and
  removes 👀.
- Create the sandbox repos with seeded code (OP-2).

Satisfies AC-1. Runs OP-2.

**Verify:** typecheck clean. Open a PR on the TypeScript sandbox repo: 👀 and an in-progress check
run within seconds, then the check run completes and 👀 is removed.

### 5. Summary review

`feat(api): post a summary review with the fast model`

- `llm/models.ts` (roles from `MODEL_FAST`, `MODEL_SMART`; providers `groq`, `google`).
- `llm/call.ts` `structured()`: limiter, retries honouring `retry-after`, one repair on bad output,
  usage in `llm_calls` (schema + repo) and totals on the review.
- `github/pr.ts`: list PR files, post review. `review/noise.ts`, `review/diff.ts` (patch parse,
  numbered rendering), `review/summarize.ts` (summary + walkthrough).
- `review/run.ts` and `review/publish.ts`: fetch, filter, summarise, publish a `COMMENT` review;
  docs-only and nothing-reviewable paths; completion never concludes `failure`; failures close the
  check run as neutral with a short message.

Satisfies AC-7, AC-8, AC-16, EC-2, EC-3, EC-11.

**Verify:** typecheck clean. A code PR gets a review with summary and walkthrough and a completed
check run. A docs-only PR gets a summary only. `llm_calls` has rows with tokens. With
`MODEL_FAST=google:<model>` the Google provider is resolved.

### 6. Line comments

`feat(api): run the general reviewer and post line comments`

- `github/snapshot.ts` (tarball per sha, temp dir then rename, prune old ones).
- `review/tools.ts`: `read_file`, `search_code`, `list_files`, confined to the snapshot.
- `review/reviewers/{define,general,index}.ts`: plugin shape, general reviewer, registry.
- `llm/call.ts` `agent()`: tool loop ending in `submit_findings`, forced final call at the step cap,
  zod validation and one repair.
- `review/diff.ts` commentable lines; `review/findings.ts` anchoring (exact, nearby in hunk, else
  body); `findings` schema + repo; inline comments in `publish.ts`.

Satisfies AC-2, AC-15, EC-7, EC-13, EC-16.

**Verify:** typecheck clean. A PR with planted bugs (off-by-one, unsanitised SQL, swallowed error)
gets inline comments on the right lines. A `read_file("../../x")` call is refused in the logs.
Registering a throwaway second reviewer file makes it run with no other change.

### 7. Findings quality

`feat(api): rank, dedupe and cap findings with suggestion blocks`

- Confidence floor 0.5, dedupe (path + overlapping lines + similar title), rank by severity then
  confidence, inline cap 15, nit cap 3, overflow in the body, hidden nits counted.
- Suggestion blocks; on 422 retry with everything in the body.

Satisfies AC-3, AC-4, AC-5, EC-8.

**Verify:** typecheck clean. Re-run the planted-bugs PR with two reviewers registered: overlapping
findings are posted once, ordered by severity, with at least one suggestion block. Forcing a bad
line in a comment triggers the body-only retry.

### 8. Large PRs

`feat(api): chunk large PRs within a token budget`

- Priority ordering (source, tests, config, docs), whole-file packing into `CHUNK_TOKENS`, hunk
  splitting, `MAX_CHUNKS`, chunks × reviewers in parallel.
- `REVIEW_TOKEN_BUDGET`: stop dispatching when spent, mark the review partial, list what was not
  reviewed.

Satisfies AC-19, EC-4.

**Verify:** typecheck clean. A ~40k-char PR is split into several chunks reviewed in parallel;
lowering the budget produces a partial review listing the skipped files.

### 9. New pushes

`feat(api): review only new commits on push`

- Compare `last_reviewed_sha...head`; full review when not an ancestor; keep only lines added in
  both compare and PR diff.
- Fingerprints: skip findings already posted on this PR; nothing new posts no review and says so on
  the check run.

Satisfies AC-6, EC-5, EC-6.

**Verify:** typecheck clean. Push a fix to the planted-bugs PR: only the new commit is reviewed,
nothing repeated. Force-push: full review. Merge main into the branch: no base changes reviewed.

### 10. PR lifecycle

`feat(api): cancel superseded reviews and follow the PR lifecycle`

- A new job for the same PR cancels a queued one and flags a running one; the running review stops
  between stages and closes its check run as superseded.
- Drafts ignored until ready; `converted_to_draft` and `closed` cancel pending work; closed / merged
  state stored; disabled repos skipped; uninstall and repo removal cancel their jobs.

Satisfies AC-18, AC-21, EC-1, EC-14, EC-15.

**Verify:** typecheck clean. Push twice quickly: the first review is cancelled and says superseded.
A draft PR is ignored until marked ready. Closing a PR with a queued review cancels it.

### 11. Resilience and concurrency

`feat(api): recover interrupted jobs and retry transient failures`

- Boot recovery of running jobs with a stale heartbeat; transient failures retry with backoff up to
  3 attempts; `ROLE=all|api|worker`.

Satisfies AC-17, EC-10.

**Verify:** typecheck clean. Open three PRs at once: three jobs run at the same time. Kill the API
mid-review and restart: the job completes.

### 12. Repo brief

`feat(api): write a repo brief when a repo is connected`

- `brief/index-repo.ts`: default-branch snapshot, filtered tree, key files, folder samples, map step
  for large repos, smart-role brief; status and sha stored.
- Triggers: installation created, repos added, boot reconcile for repos without a brief.
- `review/context.ts`: brief and PR text, each capped, fed to summary and reviewers. A missing brief
  never blocks a review.

Satisfies EC-12.

**Verify:** typecheck clean. Clear a repo's brief and restart: a brief is written. A new sandbox repo
gets one. A PR opened while a brief is running is reviewed anyway.

## Dashboard

### 13. Sign-in API

`feat(api): GitHub sign-in, sessions and the install callback`

- `users`, `sessions`, `user_installations`; `routes/auth.ts` (login, callback that also finishes an
  install, logout, dev sign-in behind `DEV_LOGIN=1`); `http/session.ts`; access scoping helper;
  `routes/me.ts`; `contracts.ts`.

**Verify:** typecheck clean. `/api/auth/login` in a browser round-trips through GitHub and sets the
cookie; `/api/me` returns the user and `prguard-sandbox`.

### 14. Dashboard shell

`feat(dashboard): dashboard shell with GitHub sign-in`

- Next.js 16 app on :3001, tokens and base styles, fonts, runtime API proxy route, auth guard, top
  bar, `/login`.

Satisfies AC-9.

**Verify:** typecheck clean. Sign in through Chrome: account created, landing on the dashboard with
the avatar in the top bar. Sign out works.

### 15. Repositories

`feat: repositories page with enable toggle`

- API `GET /api/repos`, `PATCH /api/repos/:id` (enabled). `/repos` grouped by org with enabled
  toggle, brief status, last review, and Add repositories going to GitHub's install page.

Satisfies AC-9.

**Verify:** both typechecks clean. Repos listed; a toggle persists; Add repositories returns to the
dashboard after GitHub.

### 16. Reviews list

`feat: live reviews list`

- API `GET /api/reviews` with repo and status filters. `/reviews` table polling every 3s while
  anything runs.

Satisfies AC-11.

**Verify:** both typechecks clean. Open a PR and watch it go from queued to completed without a
reload.

### 17. Review detail

`feat: review detail with re-run`

- API `GET /api/reviews/:id`, `POST /api/reviews/:id/rerun`. `/reviews/[id]`: stage, summary,
  findings by severity with GitHub line links and suggestions, commit, duration, usage, Re-run.

Satisfies AC-12.

**Verify:** both typechecks clean. Findings link to the right GitHub lines; Re-run starts a new
review.

### 18. Repo brief page

`feat: repo page with brief edit and rescan`

- API `GET /api/repos/:id`, `PATCH` brief, `POST /api/repos/:id/rescan`. `/repos/[id]` with brief
  view / edit / rescan and recent reviews.

Satisfies AC-10.

**Verify:** both typechecks clean. Edit the brief and save; Rescan regenerates it.

### 19. Rules

`feat: repo and org rules applied to every review`

- API `PATCH` repo rules, `PATCH /api/installations/:id` (org rules); `review/context.ts` adds rules
  (capped) to every prompt. Rules editor on `/repos/[id]`; `/settings` with org rules and sign out.

Satisfies AC-13.

**Verify:** both typechecks clean. Add a repo rule ("never use console.log; use the logger") and
open a PR that breaks it: the review flags it.

### 20. Reviewer toggles

`feat: turn reviewers on and off per repo`

- API `GET /api/reviewers`, `PATCH` repo reviewers; `review/run.ts` skips disabled ones. Toggles on
  `/repos/[id]`.

Satisfies AC-14.

**Verify:** both typechecks clean. Turn the general reviewer off: the next review is summary only.

## Packaging

### 21. Docker

`build: Dockerfiles and docker compose for the API and dashboard`

- `apps/api/Dockerfile`, `apps/dashboard/Dockerfile` (standalone output), `docker-compose.yml`
  (named volume for `/data`, key mounted read-only).
- `.env.example` from the config schema (OP-3). Regenerate the migration as one initial file
  (OP-1). Root README: what it is and how to run it.

Satisfies AC-20. Runs OP-1, OP-3.

**Verify:** `docker compose up --build` on a clean volume: API reconciles, relay connects,
dashboard signs in, a new PR is reviewed end to end.

---

## Deferred

None.
