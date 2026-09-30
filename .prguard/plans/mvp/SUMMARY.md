# SUMMARY: PR Guard MVP

All 21 slices in [tasks.md](tasks.md) are built, one commit each, on `manaskhandelwal/staging-work`.
Every slice was checked with `tsc --noEmit` and a live run against the `prguard-sandbox` org
(real webhooks through smee, real Groq calls, real GitHub reviews). No tests were written.

## What exists

- `apps/api`: Hono API on Node 24 (TypeScript run directly), SQLite through Drizzle with a
  repository layer (`src/db/repos/*`), durable job queue with N workers, GitHub App webhooks and
  boot reconcile, review pipeline (summary, plugin reviewers with read-only repo tools, chunking,
  budget, anchoring, dedupe, ranking, caps, suggestions, incremental reviews, cancellation), repo
  briefs, sign-in and the dashboard API.
- `apps/dashboard`: Next.js 16 dashboard (sign-in, live reviews, review detail, repositories,
  repo brief / rules / reviewers, settings) behind a same-origin proxy to the API.
- `docker-compose.yml`: API (with the webhook relay) and dashboard; `.env.example`; README.

## Spec ids closed

| Slice | Ids | Evidence from the live runs |
|---|---|---|
| 1 | OP-1 | API boots, migrations applied; regenerated as one `0000_init.sql` in slice 21 |
| 3 | EC-9 | Redelivered webhook logged "duplicate webhook ignored" |
| 4 | AC-1, OP-2 | 👀 and the in-progress check run appeared ~3 s after the webhook |
| 5 | AC-7, AC-8, AC-16, EC-2, EC-3, EC-11 | Summary reviews; docs-only PR got a summary; check runs never `failure` |
| 6 | AC-2, AC-15, EC-7, EC-13, EC-16 | Inline comments on the exact planted lines; a throwaway reviewer file ran with one registry line |
| 7 | AC-3, AC-4, AC-5, EC-8 | Suggestion blocks; `general+security` duplicates merged; ordered by severity |
| 8 | AC-19, EC-4 | 45K-char PR split into chunks; a low budget produced a partial review listing skipped files |
| 9 | AC-6, EC-5, EC-6 | Push reviewed only new lines; merge from main → "No new changes"; force-push → full review |
| 10 | AC-18, AC-21, EC-1, EC-14, EC-15 | Two pushes 1.5 s apart → first check run "Superseded"; draft ignored until ready; closed PR → "Cancelled" |
| 11 | AC-17, EC-10 | Three PRs reviewed concurrently; API killed mid-review, jobs resumed after restart |
| 12 | AC-10 (brief), EC-12 | Briefs written for every repo at boot and on a clean Docker volume |
| 14, 15 | AC-9 | Real GitHub OAuth through Chrome created the account and listed the org and repos |
| 16 | AC-11 | Reviews list moved Reviewing → Completed without a reload |
| 17 | AC-12 | Detail with line links, usage, Re-run started a new review |
| 18 | AC-10 (dashboard) | Brief rescan and edit from the repo page |
| 19 | AC-13 | Repo rule "never console.log" produced a `rules` finding; org rules saved |
| 20 | AC-14 | Reviewer switched off → summary-only review |
| 21 | AC-20, OP-3 | `docker compose up --build` on a clean volume reviewed the Python refunds PR end to end |

Planted-bug hit rate: `acme-billing/feat/refunds` 5 of 5 core bugs on the exact lines;
`acme-store/feat/discount-codes` 5 of 7 (missed the swallowed `try/catch` and the unclear name).

## Deviations from the plan

See [GAPS.md](GAPS.md). The main ones: the queue serializes jobs per PR, incremental findings must
touch new lines, the reviewer tool loop answers through a `submit_findings` tool, the repo detail
page was committed panel by panel, and publishing is idempotent across crashes.

## Not closed

- AC-16 is closed by configuration only: the Google provider resolves, but no Gemini key was
  available to make a real call.
- The 422 fallback (EC-8) is implemented but never triggered by GitHub during the runs.
