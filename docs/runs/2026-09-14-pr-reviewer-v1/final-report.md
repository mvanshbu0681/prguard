# Final report — 2026-09-14-pr-reviewer-v1

## 1. Status

**COMPLETE** for the agreed scope (backend only). 28/28 acceptance criteria met, VERIFY
exits 0 offline with the Docker daemon stopped. Known gaps in §8 are real and listed;
none of them is an unmet AC.

## 2. AC scorecard

All 28 verified by running the spec's own named tests: **389 passed**.

```
uv run pytest -q $(every test cited in spec §10)   →  389 passed in 7.32s
```

| AC | Track | Verdict |
|----|-------|---------|
| AC-1, 2, 3a, 5b, 8a, 11b, 19, 21a, 22 | T7 (+FIX-D) | met |
| AC-3b, 4, 7b, 8b, 12b, 20, 21b, 23a | T9 (+FIX-E) | met |
| AC-5a, 6, 9, 16, 25a, 26 | T4 (+FIX-A, FIX-E) | met |
| AC-7a, 14, 15, 17, 18, 24 | T6 (+FIX-C) | met |
| AC-10, 11a, 12a, 13 | T5 (+FIX-B) | met |
| AC-23c | T2 | met |
| AC-25b | T8 | met |
| AC-27 | T1 | met |
| AC-28 | integration | met |

Six of these were **not met** when first reviewed (AC-6, AC-9, AC-19, AC-25a, and partially
AC-7a/AC-17); all were fixed in round 1 and are pinned by regression tests.

## 3. Integrated VERIFY

```
$ docker info    →  daemon STOPPED (AC-28 condition holds)

$ UV_OFFLINE=1 uv run pytest -q
1835 passed, 2 deselected in 35.67s

$ UV_OFFLINE=1 uv run ruff check src tests
All checks passed!

$ UV_OFFLINE=1 uv run mypy src
Success: no issues found in 59 source files

AC-28 EXIT: 0
```

The 2 deselected are `requires_docker` live-container tests, deselected by design.

## 4. Branches and size

Integration branch `devteam/2026-09-14-pr-reviewer-v1`, **not merged to main**.

```
git diff main...devteam/2026-09-14-pr-reviewer-v1 --stat
316 files changed, 43990 insertions(+), 16 deletions(-)
```

Track branches: `agent/t1`…`agent/t9`, `agent/fix-a`…`agent/fix-e`.

## 5. Review rounds

One round, six reviewers (T4–T9), fresh context, reproduce-before-reporting.

- **30 raw findings → 15 root causes** (2 P0, 13 P1) after deduping by cause not symptom.
- 18 regression tests committed red at `b4a0e5d`, all green now.
- Five fix builders in parallel; one merge conflict (`routes_suppressions.py`, two
  independent helpers — both kept).
- Round 2 not run: zero P0/P1 remained after round 1.

The two P0s both attacked a core product claim:

**R2 — false `proven` was reachable.** `run_state()` short-circuited on `exit_code == 0`
before checking collection markers, and pytest exits 0 when every collected test was
**skipped**. A baseline that ran nothing read as a *passing* baseline → the gate could go
red on a bug that does not exist. This is the one defect class that falsifies "a finding
with a red test attached cannot be a false positive." Now `pass` requires exit 0 **and** a
summary showing ≥1 passed with zero skipped/deselected/error/xfail.

**R1 — prompt injection through filenames.** PR-controlled filenames reached the model in
the *trusted preamble*, outside every `<untrusted_content>` fence. A filename containing
`</untrusted_content><instructions>…` (all legal filename characters) closed our frame and
spoke as the system; the demonstrated payload returns zero findings → **green gate on a
hostile PR**. Sanitisation now happens in `ReviewTask.__post_init__`, so the contract
enforces itself rather than depending on a caller remembering.

## 6. Deviations

| # | Deviation | Reason |
|---|-----------|--------|
| D1 | Integration on `devteam/…` rather than merging each wave to `main` | The devteam guardrail blocks merges to main — correctly. Wave gates were run against the integration branch instead. |
| D2 | Harness worktree isolation unavailable | The session cached "not a git repo" from before `git init`. Builders got harness worktrees anyway; my manual ones were removed. |
| D3 | Gate ladder ships as check run → **commit status** → dry-run | The Check Runs API rejects PAT/OAuth tokens; it needs a GitHub App. Commit status gives the same red/green tonight. Surfaced at Gate 1. |
| D4 | `temperature` not sent to the model | The Messages API rejects sampling parameters on the Claude 5 family — verified against the installed SDK 1.5.0. Spec §11.2's "temperature 0.0" is unsatisfiable on the wire; the key stays in config. |
| D5 | `GATE_DEGRADATION_EXEMPT` keeps `sandbox_degraded` out of "degraded ⇒ neutral" | Docker is down on this machine, so the literal §4.7 rule makes *every* run neutral. Recorded as spec §11.2 assumption 26 rather than left implicit. **See §9 — this one wants your eye.** |
| D6 | FIX-E rewrote reviewer pin F4 | As written it asserted `neutral` on a configuration where a pre-existing green test asserts `success`; no implementation satisfies both. Replaced with a pin on the amendment plus F4b on the safety boundary. **Flagged by the builder for arbitration.** |
| D7 | `proposed` means different things on `/v1/reviews/{id}` and `/result` | `/result` is a terminal-status breakdown (§6.3's worked example); `/v1/reviews/{id}` is a live progress readout. Both call sites carry a comment. One-line change if you want one meaning. |
| D8 | §6.9 definition strings edited with the arithmetic | The old wording ("/ published") *was* the source of the 300% dismissal rate. Strings and maths moved together; the spec file still carries the old wording. |

## 7. Assumptions made

25 `[ASSUMED]` items were tagged in spec §11.2 at Gate 1 and are unchanged, plus one added
during fixes (#26, the D5 gate amendment). The ones that change product behaviour:

- Four specialists, not seven — bugs, security, **test-integrity**, quality.
- `BLOCK_MIN_SEVERITY=high`; `PROOF_REQUIRE_BASELINE=true`; proof budget 3/run.
- Sandbox `--network none --memory 1g --cpus 1`, `python:3.12-slim`, docker **CLI** not SDK.
- Auth is a single static bearer; tenancy via `X-Tenant-Id` → `default`.
- Models: `claude-sonnet-5` specialists / `claude-opus-5` coordinator, all in config.
- SQLite for dev/test, `DATABASE_URL` swaps to Supabase Postgres. **Never exercised against
  real Postgres** — migrations are Postgres-compatible and offline DDL is tested, but no
  live Postgres ran tonight.

## 8. Known gaps

Carried forward from review, none an unmet AC:

| Gap | Impact |
|-----|--------|
| **Prompt quality is invisible to VERIFY** | All 1835 tests can pass while specialist output is noise. The reviewer read the five prompt files and judged the negative prompts specific and plausibly ~1 finding/review — but that is a human read, not a measurement. **Budget one eyeballed live run before demoing.** |
| Churn always unavailable | `GitHubClient` has no commits method, so `churn=0.0`, `churn_available=false`. One severity input is permanently dead; honestly flagged in the response. |
| `token_usage` / `cost_usd_estimate` always null | `complete_structured` drops `LLMResponse.usage`. `/result.cost` reports zeros. |
| Disproven findings invisible in the review body | E12's "Self-refuted" section does not exist. They are correctly excluded from inline comments and fully served by `/result`. |
| Commit-status `neutral` == `success` to branch protection | Same context, same `state`. The description disclaims a verdict, but branch protection cannot read it. Only affects the PAT rung — which is the rung the demo runs on. |
| Test-integrity reviewer absent from `trivial` tier | An agent deleting one small test produces a ≤10-line diff, so the reviewer that catches it does not run. Spec §11.2 assumptions 10 and 11 are in tension; 11 won. |
| No eval harness | Severity weights are defensible but uncalibrated. |
| `X-Actor-Id` bounded, but a `RecursionError` on a deeply nested **signed** body still 500s | Unreachable without the webhook secret. |

## 9. Review checklist for Vansh — ordered by where attention pays

1. **D5/D6 — the gate degradation amendment.** A builder narrowed a safety rule in the
   product's enforcement surface and rewrote a reviewer's pin to match. Both reviewers
   confirmed it cannot turn a gate **red**, and that a sandbox which executed nothing still
   forces `neutral`. But on a Docker-less machine every clean run now reports **green** while
   the sandbox was degraded. Decide whether that is what you want to claim on stage.
2. **The two P0 fixes** — `run_state()` in `core/proof/runner.py` and
   `ReviewTask.__post_init__` in `core/specialists/base.py`. These are the two places where
   the product's claims live or die.
3. **One eyeballed live run.** Set `ANTHROPIC_API_KEY`, `POST /v1/reviews` with a real PR
   URL, read the output as a human. Nothing in the test suite can tell you whether the
   findings are any good.
4. `docs/specs/…-spec.md` §11.2 — the 26 `[ASSUMED]` decisions.
5. Supabase: paste `DATABASE_URL`, run `alembic upgrade head`, confirm the 12 tables.

## 10. Demo-night checklist

```
docker pull python:3.12-slim     # otherwise the first proof pays a multi-minute pull
export ANTHROPIC_API_KEY=...     # already set in your env
uv run uvicorn prguard.main:app --reload
curl -X POST localhost:8000/v1/reviews -d '{"pr_url":"https://github.com/owner/repo/pull/1"}'
```

## 11. PR

Not opened — the repository has **no git remote**. See the terminal summary.
