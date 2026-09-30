# prguard

PR Guard is an AI pull-request reviewer shipped as a GitHub App. Install it on an org and it
reviews every pull request and every new push: a summary, then comments on the exact lines,
ranked by severity. It only comments, so a human stays the approver. A dashboard shows reviews
as they run.

| Path             | What                                                        |
| ---------------- | ----------------------------------------------------------- |
| `apps/api`       | Webhooks, review queue and workers, dashboard API (Node, Hono, SQLite) |
| `apps/dashboard` | The dashboard (Next.js)                                     |
| `apps/web`       | Marketing website (Next.js)                                 |

## Run it

1. Create a GitHub App with these repository permissions: Pull requests (read and write),
   Issues (read and write), Checks (read and write), Contents (read-only), Metadata (read-only).
   Subscribe to the Pull request event. Callback URL: `<dashboard>/api/auth/callback`, with
   "Request user authorization during installation" on. Webhook URL: `<api>/api/webhooks`, or a
   [smee.io](https://smee.io) channel for local work.
2. `cp .env.example .env`, fill it in, and save the App's private key as `github-app.pem`.
3. `docker compose up --build`, then open http://localhost:3001.

Without Docker: `npm install`, then `npm run dev:api` and `npm run dev:dashboard`.

## Reviewers

A reviewer is one file in `apps/api/src/review/reviewers/` plus one line in its `index.ts`. It
gets the diff chunk, the repository brief and the team rules, and returns findings in a shared
shape; ranking, dedupe, line anchoring and posting are handled for it.

Models are picked by role (`MODEL_FAST`, `MODEL_SMART`) as `provider:model`, with Groq and
Google Gemini supported.
