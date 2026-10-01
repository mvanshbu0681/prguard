# prguard

PR Guard is an AI pull-request reviewer shipped as a GitHub App. Install it on an org and it
reviews every pull request and every new push: a summary, then comments on the exact lines,
ranked by severity. It only comments, so a human stays the approver. A dashboard shows reviews
as they run, a queue of open PRs by priority and risk, and how useful each reviewer is.

| Path             | What                                                        |
| ---------------- | ----------------------------------------------------------- |
| `apps/api`       | Webhooks, review queue and workers, dashboard API (Node, Hono, SQLite) |
| `apps/dashboard` | The dashboard (Next.js)                                     |
| `apps/web`       | Marketing website (Next.js)                                 |
| `scripts/badges` | Generates the badge images used in GitHub comments          |

## Run it

1. Create a GitHub App with these repository permissions: Pull requests (read and write),
   Issues (read and write), Checks (read and write), Contents (read-only), Metadata (read-only).
   Subscribe to the Pull request, Issue comment, Pull request review comment and Pull request
   review thread events. Callback URL: `<dashboard>/api/auth/callback`, with "Request user
   authorization during installation" on. Webhook URL: `<api>/api/webhooks`, or a
   [smee.io](https://smee.io) channel for local work.
2. `cp .env.example .env`, fill it in, and save the App's private key as `github-app.pem`.
3. `docker compose up --build`, then open http://localhost:3001.

Without Docker: `npm install`, then `npm run dev:api` and `npm run dev:dashboard`.

## Deploy on Railway

One Railway project, three services from this repository. Each service reads its config from a
`railway.json` (Settings, Config-as-code, set the path below); the volume, variables and domains are
set in Railway.

| Service | Root directory | Config file | Domain |
| --- | --- | --- | --- |
| `api` | `/` | `/apps/api/railway.json` | `api.<domain>` |
| `dashboard` | `/` | `/apps/dashboard/railway.json` | `app.<domain>` |
| `web` | `/apps/web` | `/apps/web/railway.json` | `<domain>` |

**api**

- Add a volume mounted at `/data`. The database and the review queue live there, so the API runs as
  a single replica.
- Variables: `PORT=8000`, `NODE_ENV=production`, `DATA_DIR=/data`,
  `DASHBOARD_URL=https://app.<domain>`, and from `.env`: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`,
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GROQ_API_KEY`,
  `SOCKET_DEV_API_KEY`. Paste the private key's contents as `GITHUB_PRIVATE_KEY`. Leave
  `WEBHOOK_PROXY_URL` and `DEV_LOGIN` unset.

**dashboard**

- Variables: `PORT=3001`, `API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000`. The browser only
  talks to the dashboard, which forwards `/api/*` to the API over the private network.

**web** needs no variables.

**Domains.** Add each custom domain on its service (target ports 8000, 3001 and the one Railway
detects for `web`), then create the CNAME record Railway shows at your DNS provider.

**GitHub App.** Set the Callback URL to `https://app.<domain>/api/auth/callback`, the Webhook URL
to `https://api.<domain>/api/webhooks` and the Homepage URL to `https://<domain>`. A GitHub App has
one webhook URL, so local work then needs a second App pointed at a smee.io channel.

## How a review runs

1. **Triage** (one fast call) rates each file's risk and picks the reviewers worth running on it.
2. **Impact analysis** finds the symbols the change touches in the head snapshot and every place
   that uses them, and gives reviewers those callers.
3. **Reviewers and checks** run side by side (see below), each on its own files.
4. **Findings** are anchored to diff lines, deduplicated across reviewers, filtered by the team's
   learnings, and **verified**: model findings of medium severity and up are re-checked against
   the code, and the ones the code disproves are dropped.
5. **Priority** (P0 to P3, business impact) and **risk** (code signals) are set, with reasons.
6. The review is posted with image badges, a findings table and a change-flow diagram. On later
   pushes, findings whose code changed are checked and marked fixed.

Every step is recorded in the review's trace on the dashboard.

## Reviewers

| Reviewer | Looks for | Kind |
| --- | --- | --- |
| Bug | Logic errors, wrong conditions, null paths, unhandled edge cases | model |
| Security | Missing access checks, injection, SSRF, unsafe input, data exposure | model |
| Reliability | Swallowed errors, missing awaits, transactions, races, leaks, timeouts | model |
| Breaking change | Changed signatures and exports whose callers were not updated | model |
| Performance | Queries in loops, unbounded reads, repeated heavy work | model |
| Data | Destructive migrations, money as float, missing indexes and constraints | model |
| AI slop | Invented APIs, duplicated helpers, placeholder logic, dead code | model |
| Team rules | The org's and repo's rules, and the brief's conventions | model |
| Docs drift | New env vars, config, flags or routes the docs do not describe | model |
| Test gap | Changed behavior with no test, with the tests to add | model |
| Secrets | Keys, tokens and passwords committed in the code | check |
| Supply chain | Malicious and vulnerable dependencies (npm, PyPI, Go), via [Socket](https://socket.dev) | check |

A reviewer is one file in `apps/api/src/review/reviewers/` plus one line in its `index.ts`:
`defineReviewer` for a model reviewer (instructions, role, tools, files it applies to) or
`defineCheck` for code that returns findings directly. Each can be switched off per repository.

Models are picked by role (`MODEL_FAST`, `MODEL_SMART`) as `provider:model`, with Groq and
Google Gemini supported.

## Commands

Comment on a pull request, or reply on one of PR Guard's line comments:

| Command | What it does |
| --- | --- |
| `@prguard review` | Review the whole pull request again |
| `@prguard explain` | Explain a finding (on its comment) |
| `@prguard fix` | Reply with a committable suggestion (on its comment) |
| `@prguard ignore <reason>` | Dismiss a finding and remember it for the repository (on its comment) |
| `@prguard <question>` | Ask anything about the pull request |

## Learnings

`@prguard ignore`, a 👎 on a PR Guard comment, or a reply saying the code is intentional becomes a
learning for that repository when it comes from someone with write access. Learnings go into every prompt and stop matching findings from being
posted again. They are listed, added and switched off on the repository page.

## Settings

| Variable | What |
| --- | --- |
| `SOCKET_DEV_API_KEY` | Socket key for the supply-chain check; without it the check is skipped |
| `ASSET_BASE_URL` | Where badge images are served from; empty posts text labels instead |
| `TRIAGE`, `VERIFY`, `TRACK_FIXES`, `COMMANDS` | Set to `off` to switch a step off |
| `REVIEW_TOKEN_BUDGET` | Tokens one review may spend (default 400000) |
| `REVIEW_CONCURRENCY` | Reviews that run at once (default 2); later PRs wait in the queue, oldest first, and their check reads "Queued" |
| `LLM_TOKENS_PER_MINUTE` | Tokens per minute each model may use (default 200000, under Groq's 250K); calls wait for room, and a rate limit waits for the provider's reset |

Badge images are generated by `npm run badges` (see `scripts/badges/README.md`) and published
to `prguard-sandbox/prguard-assets`, served through jsDelivr.
