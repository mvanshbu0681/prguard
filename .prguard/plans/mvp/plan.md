# Plan: PR Guard MVP

Builds [spec.md](spec.md). Two new apps, one SQLite file, one GitHub App. The website in `apps/web`
is not touched.

## Intent

A TypeScript API receives GitHub webhooks, acknowledges PRs instantly, and queues durable jobs in
SQLite. Workers turn each job into a review: diff and code snapshot in, summary and ranked line
comments out, posted as one GitHub review. A separate Next.js dashboard reads the same data through
the API. Everything model-related goes through roles, so models and providers change in config.

## Technical context

| Area | Choice |
|---|---|
| Runtime | Node 24, TypeScript run directly by Node's type stripping (`node src/index.ts`, no build step). Erasable syntax only, relative imports with `.ts` extensions. |
| Workspace | Root `package.json` with npm workspaces `apps/api`, `apps/dashboard`. `apps/web` stays outside with its own lockfile. |
| HTTP | Hono 4 on `@hono/node-server`, port 8000. |
| GitHub | `octokit` 5 (`App`, installation clients, webhook signature verification, retry and throttling built in). |
| LLM | `ai` 7 with `@ai-sdk/groq` and `@ai-sdk/google`. zod 4 schemas. |
| DB | SQLite via `better-sqlite3` + `drizzle-orm`, WAL mode, migrations applied at boot. |
| Snapshot | Repo tarball from the GitHub API extracted with `tar`, no git binary needed. |
| Webhook relay | `smee-client`, started by the API when `WEBHOOK_PROXY_URL` is set. |
| Logs | `pino`. |
| Dashboard | Next.js 16, React 19, Tailwind 4, TanStack Query (polling), `react-markdown` + `remark-gfm`. Port 3001. |
| Packaging | One Dockerfile per app and a root `docker-compose.yml`. |

Measured on our key: Groq Developer tier gives 250K tokens/min on `openai/gpt-oss-120b` and
`openai/gpt-oss-20b`. Groq rejects JSON-schema output combined with tools (tested:
`json mode cannot be combined with tool/function calling`), which shapes the reviewer loop below.

## Layout

```
package.json                  workspaces
docker-compose.yml
.env.example
apps/api/
  Dockerfile  drizzle.config.ts  package.json  tsconfig.json
  src/
    index.ts                  boot: config, migrate, reconcile, http, workers, relay
    config.ts                 env parsed once with zod; the only reader of process.env
    log.ts
    contracts.ts              response types shared with the dashboard (type-only)
    db/
      schema.ts  client.ts  migrations/
      repos/                  users, sessions, installations, repositories, pulls, reviews,
                              findings, jobs, llm-calls, deliveries  (the only code that queries)
    github/
      app.ts                  App + installation clients
      webhooks.ts             route + handlers
      reconcile.ts            installations and repos from GitHub into the DB
      pr.ts                   files, compare, reactions, check runs, post review
      snapshot.ts             tarball download + extract, cached per sha
    queue/
      queue.ts                enqueue, claim, heartbeat, cancel, recover
      worker.ts               pool of N loops, job-type registry
    llm/
      models.ts               role -> provider:model, provider registry (groq, google)
      call.ts                 structured call, tool loop, limiter, retries, usage log, budget
    review/
      run.ts                  review_pr job
      diff.ts                 patch parsing, numbered rendering, commentable lines, chunks
      noise.ts                lockfiles, generated, binaries, docs-only detection
      context.ts              brief + rules + PR text, each capped
      summarize.ts            summary + walkthrough (fast role, no tools)
      tools.ts                read_file, search_code, list_files (sandboxed to snapshot)
      findings.ts             Finding schema, anchor, dedupe, fingerprint, rank, cap
      publish.ts              review body, inline comments, suggestions, 422 fallback
      reviewers/
        define.ts             defineReviewer + types
        general.ts            the MVP reviewer
        index.ts              registry
    brief/
      index-repo.ts           index_repo job
    http/
      server.ts  session.ts
      routes/                 auth, me, reviews, repos, installations
apps/dashboard/
  Dockerfile  next.config.ts  package.json
  app/
    api/[...path]/route.ts    runtime proxy to the API (same-origin cookies)
    login/  (app)/reviews/  (app)/reviews/[id]/  (app)/repos/  (app)/repos/[id]/  (app)/settings/
  components/  lib/
```

## Data model (SQLite)

| Table | Key columns |
|---|---|
| `users` | id, github_id (unique), login, name, avatar_url |
| `sessions` | id (random token), user_id, expires_at |
| `user_installations` | user_id, installation_id |
| `installations` | id (GitHub id), account_login, account_type, avatar_url, rules, suspended, deleted_at |
| `repositories` | id (GitHub id), installation_id, full_name, default_branch, private, enabled, rules, reviewers (json of disabled ids), brief, brief_status, brief_sha, brief_updated_at, removed_at |
| `pull_requests` | id, repository_id, number (unique pair), title, author_login, author_avatar, url, state, draft, head_sha, base_ref, last_reviewed_sha |
| `reviews` | id, pull_request_id, repository_id, head_sha, base_sha, kind (full, incremental), trigger, status (queued, running, completed, failed, cancelled, skipped), stage, summary, walkthrough (json), files_reviewed, files_skipped (json), partial, tokens_in, tokens_out, llm_calls, github_review_id, check_run_id, reaction_id, error, started_at, finished_at |
| `findings` | id, review_id, pull_request_id, reviewer, path, line, start_line, severity, category, title, body, suggestion, confidence, fingerprint, placement (inline, body, hidden) |
| `jobs` | id, type, key, payload (json), status, attempts, max_attempts, run_after, cancel_requested, heartbeat_at, error |
| `llm_calls` | id, review_id, repository_id, purpose, provider, model, tokens_in, tokens_out, ms, ok, error |
| `webhook_deliveries` | id (delivery guid), event, action, received_at |

The schema grows slice by slice. Nothing is deployed, so the migration folder is regenerated as a
single initial migration before the PR (OP-1).

## Interfaces

**Webhooks** (`POST /api/webhooks`): `installation` (created, deleted, suspend, unsuspend),
`installation_repositories` (added, removed), `pull_request` (opened, reopened, synchronize,
ready_for_review, converted_to_draft, closed, edited). Signature checked, delivery id stored, 200
returned before any slow work.

**Dashboard API** (session cookie `pg_session`, scoped to the user's installations):

| Route | Purpose |
|---|---|
| `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout` | GitHub sign-in; the callback also completes an install |
| `GET /api/auth/dev?login=` | local sign-in for Playwright, only when `DEV_LOGIN=1` |
| `GET /api/me` | user, installations, install URL |
| `GET /api/reviews?repo=&status=` | recent reviews |
| `GET /api/reviews/:id`, `POST /api/reviews/:id/rerun` | detail with findings and usage; re-run |
| `GET /api/repos`, `GET /api/repos/:id`, `PATCH /api/repos/:id` | list, detail, update enabled / rules / reviewers / brief |
| `POST /api/repos/:id/rescan` | queue a new brief |
| `PATCH /api/installations/:id` | org rules |
| `GET /api/reviewers` | registry: id, name, description |

**Jobs:** `review_pr` (key `pr:<repo>:<number>`), `index_repo` (key `repo:<id>`). A new job with a key
already queued cancels the queued one; a running one gets `cancel_requested`, checked between stages.

**Reviewer plugin:**

```ts
export default defineReviewer({
  id: "general",
  name: "General",
  description: "Bugs, security, edge cases, readability.",
  role: "smart",
  tools: true,
  instructions: `...`,
})
```

The runner calls every enabled reviewer once per chunk, in parallel, and expects findings in the
shared schema: path, line, end line, severity, category, title, body, suggestion, confidence.

**LLM calls:** `structured({ purpose, role, system, prompt, schema })` for no-tool calls (summary,
brief) uses JSON-schema output. `agent({ purpose, role, system, prompt, tools, schema })` for
reviewers runs a tool loop where the final answer is a `submit_findings` tool whose input is the
findings schema; the loop stops when it is called or at the step cap, and a capped run gets one
forced `submit_findings` call. Both validate with zod, repair once, and log to `llm_calls`.

## Key mechanics

- **Instant ack.** The webhook handler upserts the PR, creates the review row and job, then, without
  awaiting, adds 👀 and creates the check run (`in_progress`, details URL to the dashboard review).
- **Diff.** PR files come from the API with patches. Each patch is rendered with new-file line
  numbers on every kept line, which is what the model cites. Commentable lines are the RIGHT-side
  lines inside hunks of the PR diff.
- **Noise.** Removed files, binary or patch-less files, lockfiles, minified and generated paths
  (`dist/`, `build/`, `vendor/`, `*.min.*`, `*.map`) are skipped and listed. Docs-only PRs get the
  summary only.
- **Chunks.** Tokens are estimated at 3.5 chars/token. Files are ordered source, tests, config,
  docs, then packed whole into chunks of `CHUNK_TOKENS` (12K); a file larger than a chunk is split at
  hunk boundaries. At most `MAX_CHUNKS` (8); the rest are listed as not reviewed.
- **Incremental.** With a `last_reviewed_sha`, compare it to head. If the compare says the old commit
  is not an ancestor, review fully. Otherwise keep only files in the PR diff, and only lines that are
  added both in the compare and in the PR diff, so base-branch merges add nothing.
- **Context.** Brief (capped 3K tokens), org + repo rules (capped 1.5K), PR title and body (capped 1K).
- **Findings.** Drop confidence below 0.5. Anchor: exact line if commentable, else nearest commentable
  line within 3 in the same hunk, else placed in the body. Dedupe on path + overlapping lines + similar
  title. Skip fingerprints already posted on this PR. Rank by severity then confidence. Inline cap 15,
  nit cap 3, overflow to the body, excess nits counted as hidden.
- **Publish.** Review event `COMMENT` at the head commit, suggestion blocks where given. On 422, retry
  with everything in the body. Incremental with nothing new posts no review. Then remove 👀, complete
  the check run (`success` without high or critical findings, `neutral` otherwise or on failure,
  never `failure`), set `last_reviewed_sha`.
- **Budget.** `REVIEW_TOKEN_BUDGET` (200K). Chunks are dispatched in priority order; once the budget
  is spent the rest are skipped and the review is marked partial. An in-process limiter caps
  concurrent LLM calls (`LLM_CONCURRENCY`, 6); 429s retry with backoff honouring `retry-after`.
- **Brief.** From the default branch snapshot: filtered file tree (up to 400 paths), manifests,
  README / CONTRIBUTING / AGENTS docs, entry points, and a sample of each top-level source folder,
  within 60K tokens. If more is needed, the fast role summarises each folder first and the smart role
  writes the brief from those notes. Sections: what it is, stack, structure, conventions, watch-outs.
- **Queue.** `WORKER_CONCURRENCY` loops (4). Claim is one atomic `UPDATE ... RETURNING`. Heartbeat
  every 10s; at boot, running jobs with a stale heartbeat go back to queued. Transient failures retry
  up to 3 times with backoff. `ROLE=all|api|worker` lets the worker run as its own process.
- **Snapshot.** Tarball per `(repo, sha)` extracted to `DATA_DIR/snapshots`, written to a temp folder
  then renamed so concurrent jobs share it safely; only the newest few per repo are kept. Tools
  resolve paths inside the snapshot and refuse anything outside it.

## Dashboard

Dark, dense, quiet. Palette values taken from the website's tokens (graphite ink ladder, cyan
signal, the severity ramp) and copied into the dashboard, so the two feel related without sharing
files. Inter for text, a mono for code and SHAs. Top bar: PR Guard, Reviews, Repositories, Settings,
avatar. Copy is short labels, no explanations of internals; errors are one line.

| Page | Content |
|---|---|
| `/login` | Wordmark, one line, Continue with GitHub |
| `/reviews` | Live table: status, repo, PR, author, kind, severity counts, time. Polls every 3s while anything runs |
| `/reviews/[id]` | PR header, stage while running, summary, findings by severity with GitHub line links and suggestions, usage line, Re-run |
| `/repos` | Grouped by org: enabled toggle, brief status, last review. Add repositories goes to GitHub |
| `/repos/[id]` | Brief (view, edit, rescan), rules, reviewer toggles, recent reviews |
| `/settings` | Org rules per installation, sign out |

## Project rules check

There is no constitution in this repo; these are the rules the user set, and how the plan holds them.

- No tests, no CI: the plan adds neither. Each slice is checked by typecheck plus a manual run against
  the sandbox org.
- Only Groq and Gemini: the provider registry holds exactly these two.
- SQLite behind a repository layer: only `db/repos/*` imports the DB client.
- Concise UI copy, no internals: user-facing errors are fixed short strings; details go to logs only.
- `apps/web` untouched.

## Operational commitments

- **OP-1** Generate the Drizzle migration; regenerate it as one initial migration before the PR.
- **OP-2** Create the sandbox repos in `prguard-sandbox` (a small TypeScript service and a small
  Python service) with seeded code, used by every slice's manual check.
- **OP-3** Write `.env.example` from the config schema.

## Slices

Each slice leaves both apps running. Kill switch for everything: uninstall the App, or stop the
worker (`ROLE=api`), and nothing gets posted. These nine stages are cut into 21 commit-sized slices
in [tasks.md](tasks.md).

1. **API boots and knows the org.** Workspace, config, DB, Hono, webhook route with signature and
   dedupe, boot reconcile and installation events, smee relay. *Kill switch:* stop the process.
2. **A PR gets a summary review.** Queue and workers, instant ack (👀 and check run), LLM layer with
   roles and usage log, PR files and noise filter, summary, publish and completion. *Kill switch:*
   `ROLE=api`.
3. **A PR gets line comments.** Snapshot, tools, reviewer plugin and registry, general reviewer,
   numbered diff and chunks, the tool loop with `submit_findings`, anchor, dedupe, rank, caps,
   suggestions, 422 fallback, budget and partial. *Kill switch:* disable the reviewer in config.
4. **Pushes and lifecycle.** Incremental reviews, force-push fallback, base-merge filtering, no
   repeats, cancel and superseded check runs, drafts, closed PRs, disabled repos, uninstall and
   removed repos, retries and crash recovery. *Kill switch:* `ROLE=api`.
5. **Repos get a brief.** `index_repo` job, triggers (install, added, reconcile, rescan), brief
   used in review context. *Kill switch:* briefs are optional; reviews run without one.
6. **Sign in and see repos.** OAuth sign-in and install callback, sessions, access scoping, dev
   sign-in, dashboard shell with API proxy, login page, repositories page with enable toggle. *Kill
   switch:* the dashboard is read-mostly; removing it does not affect reviews.
7. **Watch reviews.** Reviews list with live polling, review detail, re-run. *Kill switch:* as 6.
8. **Tune a repo.** Repo detail with brief edit and rescan, rules, reviewer toggles; settings with
   org rules; rules flow into prompts. *Kill switch:* clear the rules.
9. **One command to run it.** Dockerfiles, compose, `ROLE` split, `.env.example`, README.
   *Kill switch:* not applicable.

After the slices: `/verify` against the spec, then the end-to-end run in Docker with Playwright
and the sandbox org.

## Open items

None blocking. Gemini is wired but unverified until a key is provided (AC-16 is checked by config
and a dry call only).
