# prguard — evidence-based merge gate

An AI pull-request reviewer that proves its claims: every blocking finding is backed by a
generated repro test that passes at the base commit and fails at the head commit.

## Layout

| Path        | What                                            |
| ----------- | ----------------------------------------------- |
| `apps/api`  | Python backend (FastAPI, `uv`) — see its README |
| `apps/web`  | Next.js frontend (`npm`) — see its README       |
| `docs`      | Specs, plans, design notes, run logs            |

Each app is self-contained; run its commands from inside its folder:

```
cd apps/api && uv sync && uv run pytest -q
cd apps/web && npm install && npm run dev
```
