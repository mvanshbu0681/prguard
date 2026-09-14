# prguard — evidence-based merge gate

An AI pull-request reviewer that proves its claims: every blocking finding is backed by a
generated repro test that passes at the base commit and fails at the head commit.

- Spec: `docs/specs/2026-09-14-pr-reviewer-v1-spec.md`
- Plan: `docs/plans/2026-09-14-pr-reviewer-v1-plan.md`

## Setup

```
uv sync
cp .env.example .env
```

## Database

Postgres-first schema, run on SQLite locally and in the whole test suite; `DATABASE_URL` is
the only switch (spec §5, §11.2 assumption 1). Migration `0001` creates all twelve tables and
seeds the `default` tenant that requests without `X-Tenant-Id` resolve to.

```
uv run alembic upgrade head
```

## VERIFY

The definition of done (spec §9). It passes with no network access and with the Docker daemon
stopped; tests that need either are marked `requires_network` / `requires_docker` and are
deselected by default.

```
uv run pytest -q && uv run ruff check src tests && uv run mypy src
```
