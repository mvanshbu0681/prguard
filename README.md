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

## VERIFY

The definition of done (spec §9). It passes with no network access and with the Docker daemon
stopped; tests that need either are marked `requires_network` / `requires_docker` and are
deselected by default.

```
uv run pytest -q && uv run ruff check src tests && uv run mypy src
```
