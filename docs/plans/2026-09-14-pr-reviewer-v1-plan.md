# Build Plan — Evidence-Based Merge Gate (backend v1)

- **Run ID:** 2026-09-14-pr-reviewer-v1
- **Spec (authoritative):** `/Users/vanshmehta/Documents/Projects_2026/PR-Reviewer/docs/specs/2026-09-14-pr-reviewer-v1-spec.md`
- **Status:** awaiting `execute`
- **Whole-project VERIFY (spec §9):**

```
uv run pytest -q && uv run ruff check src tests && uv run mypy src
```

Binding condition inherited from the spec: this must pass **with no network access and with the
Docker daemon stopped**. Every track's VERIFY subset below holds under that same condition.

> One setup exception, stated once so no builder is surprised: `uv sync` must run **once with
> network** to populate `.venv` from the X10 dependency list. After that, every `uv run …` in this
> plan is offline. `uv sync` happens in track T0 and nowhere else.

---

## 1. The hard constraint, and how this plan dissolves it

**The problem.** Spec §4.3 has a foundation layer — `pyproject.toml`, `config.py`, `db/*`, Alembic,
`api/errors.py`, `api/schemas.py`, `main.py` — that everything else imports. On an empty repo that
serialises the entire build: nobody can even run `pytest` until it exists, so five builders sit idle
behind one.

**Rejected strategy — "foundation by contract".** Specify the ORM/schemas/config precisely enough in
this plan that all tracks write their own copy of the foundation and reconcile at integration. This
fails tonight: five worktrees each containing their own `pyproject.toml`, `db/models.py` and
`tests/conftest.py` produce five-way merge conflicts in exactly the files with the most surface
area, at 2am, with one human reviewing. The conflicts are visible rather than silent, but they are
not *cheap*, and `mypy --strict` over the union is where the night would die.

**Chosen strategy — a 10-minute seed commit plus a 3-way-parallel foundation wave.**

1. **Wave 0 (T0, ~10 min, one builder).** A deliberately tiny seed: `pyproject.toml` with the
   complete X10 dependency list and the final ruff/mypy/pytest configuration, the empty package
   tree with `__init__.py` files, `.env.example`, and one smoke test so `pytest` exits 0. `uv sync`
   runs here. Nothing else. This is the only genuinely serial step in the plan.
2. **Wave 1 (T1, T2, T3 — three builders in parallel).** The foundation is split along the only
   seam that does not create cross-imports:
   - **T1 — persistence + app shell**: `config.py`, `db/*`, migrations, `api/errors.py`,
     `api/schemas.py`, `api/deps.py`, `main.py` factory, `core/queue.py` protocols, root
     `tests/conftest.py`.
   - **T2 — contracts, pinned predicates, LLM substrate**: `core/types.py`, the four cross-track
     pure predicates (§3 below), `llm/client.py` (protocol + `FakeLLMClient`), `llm/structured.py`.
     T2 imports **nothing** from T1 — domain dataclasses are not ORM rows and pydantic response
     schemas are not domain dataclasses, so the two halves are genuinely independent.
   - **T3 — offline fixture corpus**: `tests/fixtures/**` only. Pure data. Zero imports from `src/`.
     This is the one track that could have run from an empty tree all along, and it de-risks the
     two hardest downstream tracks (proof, delivery).
3. **Wave 2 (T4–T8, five builders).** Every wave-2 track imports only from wave-0/1 output. No
   wave-2 track imports from another wave-2 track. This is enforced by §3's pinned predicate set.
4. **Wave 3 (T9) and Wave 4 (T10) are sequential, and this plan says so rather than faking
   parallelism.** Pipeline orchestration is one indivisible thing; final integration is one
   indivisible thing.

**The trade-off, stated plainly.** We pay ~10 minutes of dead serial time (T0) plus the wall-clock
of the slowest wave-1 track (T1, the largest single-builder track in the plan) before parallelism
begins. In exchange, every subsequent worktree branches off a tree that already compiles, type-checks
and runs tests, and **there are zero same-wave file overlaps anywhere in this plan** (§9 proves it
track by track). Integration in T10 becomes a fast-forward exercise rather than a merge negotiation.

**What a blocked builder does: nothing — because it is not launched.** Waves are gated. Do **not**
start wave-2 builders before wave 1 is merged to `main`; there is no useful work for them that does
not create a conflict with the foundation they would be guessing at. The only work that is genuinely
parallelisable from an empty tree is T3, which is why T3 is in wave 1 rather than idling behind it.
If Vansh wants to burn the wait productively, the right use of that window is the one thing VERIFY
cannot check: reading `core/specialists/prompts/*.md` from T8 with his own eyes (spec R5).

---

## 2. Wave structure

| Wave | Tracks | Builders | Gate to open the next wave |
|---|---|---|---|
| 0 | T0 | 1 | `uv run ruff check src tests && uv run mypy src && uv run pytest -q` green on `main` |
| 1 | T1, T2, T3 | 3 | all three merged to `main`; `main` still green |
| 2 | T4, T5, T6, T7, T8 | 5 | all five merged to `main`; `main` still green |
| 3 | T9 | 1 | merged; `main` green |
| 4 | T10 | 1 | full VERIFY exits 0 offline with Docker stopped |

Branches are `agent/T0` … `agent/T10`, each in its own worktree, each branched from `main` **at the
moment its wave opens** (not earlier).

---

## 3. The pinned predicate set — why wave 2 has no internal dependencies

Four pure decision functions are needed by more than one wave-2 track. Rather than let one wave-2
track own them (which would serialise wave 2), **T2 ships them complete in wave 1** with the exact
signatures below. Wave-2 tracks *import and use* them; the track that owns the surrounding module
*adds to* the file in a later wave, so there is never a same-wave write collision.

```python
# src/prguard/core/types.py — owner T2 (wave 1); read-only for everyone after
Band            = Literal["critical", "high", "medium", "low", "info"]
Category        = Literal["correctness", "security", "test_integrity", "performance", "maintainability"]
ProofStatus     = Literal["not_attempted", "not_applicable", "proven", "disproven", "inconclusive", "skipped_no_env"]
FindingStatus   = Literal["proposed", "suppressed", "published", "dropped", "disproven"]
DeliveryMode    = Literal["inline_exact", "inline_nearest", "file_level", "summary_only", "not_delivered"]
GateConclusion  = Literal["success", "failure", "neutral"]
RiskTier        = Literal["trivial", "standard", "full"]

@dataclass(frozen=True) class SeverityInputs:   # spec §4.4 — field names are the API field names
    reachability: float; blast_radius: float; path_sensitivity: float
    coverage_gap: float; churn: float; proof_confidence: float; churn_available: bool = True

@dataclass(frozen=True) class SeverityResult:
    score: float; band: Band; inputs: SeverityInputs
    weights: Mapping[str, float]; explanation: str; notes: list[str]

@dataclass class CanonicalFinding:              # the object every stage after S4 passes around
    id, specialist, category, rule_key, title, body_markdown,
    file_path, start_line, end_line, side, language, symbol_path,
    llm_severity_hint, confidence, provable, repro_hint, evidence,
    severity: SeverityResult | None, fingerprint: str | None,
    status: FindingStatus, proof_status: ProofStatus, blocking: bool,
    delivery_mode: DeliveryMode, delivered_line: int | None, github_comment_id: int | None

@dataclass(frozen=True) class SpecialistFinding / SpecialistOutput / DroppedFinding   # spec §6.12 verbatim
@dataclass(frozen=True) class FileContext / Hunk / LineMap                            # spec §4.1 S2
@dataclass(frozen=True) class ProofRequest / RunResult / ProofOutcome                 # spec §4.6
@dataclass(frozen=True) class SuppressionRule                                         # spec §5.1 suppressions

# src/prguard/core/severity.py — T2 ships these two; T4 adds compute() + derivation in wave 2
def band_of(score: float) -> Band: ...                      # 0.75 / 0.55 / 0.35 / 0.15 thresholds, >= semantics
def is_blocking(*, proof_status: ProofStatus, band: Band, language: str,
                status: FindingStatus, block_min_severity: Band) -> bool: ...   # spec §4.4, sole source of truth

# src/prguard/core/delivery/gate.py — T2 ships conclude(); T6 adds the delivery ladder in wave 2
def conclude(*, blocking_finding_ids: Sequence[str], degraded: bool,
             all_proofs_skipped_for_env: bool) -> GateConclusion: ...
             # failure if blocking_finding_ids; else neutral if degraded or all_proofs_skipped_for_env; else success

# src/prguard/core/suppression.py — T2 ships matches() incl. expiry/revocation guards;
#                                   T4 completes the scope matrix internals in wave 2
def matches(*, finding: CanonicalFinding, rule: SuppressionRule, now: datetime) -> bool: ...

# src/prguard/llm/client.py — T2
class LLMClient(Protocol):
    async def complete(self, *, model: str, system: str, messages: Sequence[Message],
                       max_tokens: int, temperature: float) -> LLMResponse: ...
class FakeLLMClient:      # loads keyed canned responses from tests/fixtures/llm/ (T3)
class AnthropicClient:    # STUB in T2 (raises NotImplementedError); T8 implements it

# src/prguard/llm/structured.py — T2
async def complete_structured(client: LLMClient, *, model: str, system: str, prompt: str,
                              schema: type[T], max_tokens: int, temperature: float) -> T: ...
                              # JSON-schema validate → one repair retry with the error appended → raise

# src/prguard/core/queue.py — T1
class JobQueue(Protocol):
    async def enqueue(self, review_run_id: str) -> None: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
class NullJobQueue:   # records enqueues, never executes — the queue API tests use (AC-1 needs non-blocking)
class SyncJobQueue:   # executes an injected Callable[[str], Awaitable[None]] inline — integration tests
class AsyncioJobQueue # STUB in T1; T9 implements workers + reaper in wave 3
```

**[PLAN DECISION]** `core/types.py` is not named in spec §4.3. It is a placement decision, not a new
requirement: the spec's protocol boundaries (`Specialist`, `SandboxRunner`, `JobQueue`,
`LLMClient`) imply a shared domain-object module, and without a single owner for it five wave-2
tracks would each invent their own. It adds no behaviour.

**[PLAN DECISION]** `proof/workspace.py` exposes a `WorkspaceSource` protocol with two
implementations: `GitHubTarballSource` (production, per §4.6) and `LocalPathSource` (test-only,
copies a committed fixture tree). This is required by G7 + AC-10: the proof path must be provable
with no network. No behaviour beyond what §4.6 already specifies.

---

## 4. Track table

| ID | Title | depends_on | touches | AC covered | VERIFY subset |
|----|-------|-----------|---------|-----------|---------------|
| **T0** | Repo seed | — | `pyproject.toml`, `.gitignore`, `.env.example`, `README.md`, `src/prguard/**/__init__.py`, `src/prguard/py.typed`, `tests/test_smoke.py` | *(enabler — none)* | `uv run pytest -q && uv run ruff check src tests && uv run mypy src` |
| **T1** | Persistence, config & app shell | T0 | `src/prguard/config.py`, `src/prguard/db/*`, `src/prguard/migrations/**`, `alembic.ini`, `src/prguard/api/{errors,schemas,deps}.py`, `src/prguard/main.py`, `src/prguard/core/queue.py`, `tests/conftest.py`, `tests/db/**`, `tests/api/test_app_shell.py` | AC-27 | `uv run pytest tests/db tests/api/test_app_shell.py -q && uv run ruff check src tests && uv run mypy src` |
| **T2** | Contracts, pinned predicates & LLM substrate | T0 | `src/prguard/core/types.py`, `src/prguard/core/severity.py` *(predicates only)*, `src/prguard/core/suppression.py` *(matches only)*, `src/prguard/core/delivery/gate.py` *(conclude only)*, `src/prguard/llm/{client,structured}.py`, `tests/core/test_pinned_predicates.py`, `tests/llm/test_structured.py` | AC-23c | `uv run pytest tests/core/test_pinned_predicates.py tests/llm -q && uv run ruff check src tests && uv run mypy src` |
| **T3** | Offline fixture corpus | T0 | `tests/fixtures/**` *(only)* | *(enabler — none)* | `python3 tests/fixtures/verify_corpus.py` |
| **T4** | Analysis core — M2 + M3 | T1, T2, T3 | `src/prguard/core/{diff,context,sanitize,severity,fingerprint,suppression}.py`, `tests/core/test_{diff,context,sanitize,severity,fingerprint,suppression,blocking_rules}.py` | AC-5a, AC-6, AC-9, AC-16, AC-25a, AC-26 | `uv run pytest tests/core -q && uv run ruff check src tests && uv run mypy src` |
| **T5** | Proof subsystem — M1 | T1, T2, T3 | `src/prguard/core/proof/**`, `tests/proof/**` | AC-10, AC-11a, AC-12a, AC-13 | `uv run pytest tests/proof -q && uv run ruff check src tests && uv run mypy src` |
| **T6** | Delivery & governance — M4a | T1, T2, T3 | `src/prguard/core/delivery/{github_client,comment_ladder,review_poster,gate}.py`, `tests/delivery/**` | AC-7a, AC-14, AC-15, AC-17, AC-18, AC-24 | `uv run pytest tests/delivery -q && uv run ruff check src tests && uv run mypy src` |
| **T7** | API surface, audit & accuracy — M4b | T1, T2, T3 | `src/prguard/api/routes_*.py`, `src/prguard/core/{audit,accuracy}.py`, `tests/api/**` *(except `test_app_shell.py`)* | AC-1, AC-2, AC-3a, AC-5b, AC-8a, AC-11b, AC-19, AC-21a, AC-22 | `uv run pytest tests/api tests/db -q && uv run ruff check src tests && uv run mypy src` |
| **T8** | Specialists & coordinator | T1, T2, T3 | `src/prguard/core/specialists/**`, `src/prguard/core/coordinator.py`, `src/prguard/llm/{circuit,anthropic}.py`, `tests/core/test_coordinator.py`, `tests/llm/test_circuit.py` | AC-25b | `uv run pytest tests/core/test_coordinator.py tests/llm -q && uv run ruff check src tests && uv run mypy src` |
| **T9** | Pipeline, queue & orchestration | T4, T5, T6, T7, T8 | `src/prguard/core/{pipeline,ingest,queue}.py`, `src/prguard/main.py` *(lifespan only)*, `tests/core/test_{queue,resilience}.py`, `tests/integration/**`, appends to `tests/api/test_{audit,suppressions}.py` | AC-3b, AC-4, AC-7b, AC-8b, AC-12b, AC-20, AC-21b, AC-23a | `uv run pytest tests/core tests/integration tests/api -q && uv run ruff check src tests && uv run mypy src` |
| **T10** | Integration & VERIFY green | T9 | any file, minimally — reconciliation, typing fixes, `README.md`, `docs/runs/` notes | AC-28 | `uv run pytest -q && uv run ruff check src tests && uv run mypy src` |

**`touches` is advisory.** Builders work in separate worktrees; overlap causes a visible merge
conflict, not silent loss. But §9 shows the overlap here is zero *within* every wave, and every
cross-wave overlap is an append to a file whose earlier owner has already merged.

---

## 5. AC → track map (all 28 placed)

| AC | Owner (primary) | Supporting | Named test(s) from spec §10 |
|---|---|---|---|
| AC-1 | **T7** | T1 (`NullJobQueue`) | `tests/api/test_reviews.py::test_trigger_returns_202_without_blocking` |
| AC-2 | **T7** | T1 (`errors.py` registry + handlers) | `tests/api/test_errors.py::test_error_envelope_matrix` |
| AC-3 | **T7** (status fields) | **T9** (reaper + real monotonic advance) | `tests/api/test_reviews.py::test_status_reports_stage_progress`; `tests/core/test_queue.py::test_reaper_fails_stale_runs` |
| AC-4 | **T9** | T10 (re-proves in merged tree) | `tests/integration/test_pipeline_end_to_end.py::test_full_run_with_fake_backends` |
| AC-5 | **T4** (`compute`, bands, hint ignored) | **T7** (API exposes inputs+weights) | `tests/core/test_severity.py::test_score_matches_formula`, `::test_band_boundaries`, `::test_llm_hint_is_ignored`; `tests/api/test_findings.py::test_response_exposes_severity_inputs` |
| AC-6 | **T4** | — | `tests/core/test_fingerprint.py::test_stable_under_line_drift`, `::test_stable_under_local_rename`, `::test_stable_under_rewording`, `::test_changes_when_logic_changes` |
| AC-7 | **T9** (integration + supersede) | **T6** (comment-reuse mechanism in `review_poster`) | `tests/integration/test_rereview.py::test_force_push_posts_no_duplicate_comments`, `::test_inflight_run_is_superseded` |
| AC-8 | **T7** (ledger) | **T9** (suppress-then-rerun) | `tests/api/test_suppressions.py::test_ledger_lists_suppression_with_reason` (T7); `::test_suppress_then_rerun_excludes_finding` (T9) |
| AC-9 | **T4** | T2 (`matches` guards) | `tests/core/test_suppression.py::test_scope_matrix`, `::test_expired_does_not_suppress`, `::test_revoke_is_soft_delete` |
| AC-10 | **T5** | T3 (fixture repo) | `tests/proof/test_runner_subprocess.py::test_base_passes_head_fails_marks_proven` |
| AC-11 | **T5** (disproven path) | **T7** (accuracy counting) | `tests/proof/test_runner_subprocess.py::test_passing_repro_marks_disproven`; `tests/api/test_accuracy.py::test_disproven_counts_in_fp_rate` |
| AC-12 | **T5** (three outcomes) | **T9** (run still `succeeded`) | `tests/proof/test_runner_failure_modes.py::test_timeout_is_inconclusive`, `::test_dep_install_failure_caps_at_inconclusive`, `::test_pre_existing_failure_not_proven` |
| AC-13 | **T5** | T2 (`gate.conclude` for the neutral assertion) | `tests/proof/test_runner_selection.py::test_docker_unavailable_falls_back_to_subprocess`, `::test_no_sandbox_yields_neutral_gate` |
| AC-14 | **T6** | — | `tests/delivery/test_governance.py::test_review_event_is_always_comment`, `::test_source_contains_no_approve_path` |
| AC-15 | **T6** | T2 (`is_blocking`, `conclude`) | `tests/delivery/test_gate.py::test_red_only_on_proven_finding`, `::test_unproven_critical_does_not_block`, `::test_no_sandbox_is_neutral` |
| AC-16 | **T4** | T2 (`is_blocking`) | `tests/core/test_blocking_rules.py::test_non_python_never_blocks` |
| AC-17 | **T6** | — | `tests/delivery/test_comment_ladder.py::test_ladder_assigns_highest_valid_rung`, `::test_no_finding_is_dropped`; `tests/delivery/test_review_poster.py::test_exactly_one_review_api_call` |
| AC-18 | **T6** | T3 (recorded 422 body) | `tests/delivery/test_review_poster.py::test_422_demotes_and_retries_once` |
| AC-19 | **T7** | T3 (webhook payload fixtures) | `tests/api/test_webhooks.py::test_valid_signature_enqueues`, `::test_invalid_signature_rejected`, `::test_duplicate_delivery_is_idempotent`, `::test_unhandled_event_ignored`, `::test_unconfigured_secret_fails_closed` |
| AC-20 | **T9** | — | `tests/integration/test_trigger_parity.py::test_api_and_webhook_produce_identical_review` |
| AC-21 | **T7** (chain verify + tamper + endpoint) | **T9** (full-run ordered event set) | `tests/api/test_audit.py::test_chain_verifies`, `::test_tampering_is_detected` (T7); `::test_run_emits_complete_ordered_event_set` (T9) |
| AC-22 | **T7** | — | `tests/api/test_accuracy.py::test_report_math_matches_definitions`, `::test_every_metric_has_n_and_definition` |
| AC-23 | **T9** (specialist degradation, total outage) | **T2** (structured repair retry) | `tests/core/test_resilience.py::test_single_specialist_failure_degrades`, `::test_total_llm_outage_fails_run_cleanly` (T9); `tests/llm/test_structured.py::test_malformed_json_is_repaired_once` (T2) |
| AC-24 | **T6** | — | `tests/delivery/test_degraded_delivery.py::test_403_on_review_preserves_payload`; `tests/delivery/test_gate.py::test_gate_ladder_falls_through_to_dry_run` |
| AC-25 | **T4** (sanitize) | **T8** (hallucinated-path drop) | `tests/core/test_sanitize.py::test_boundary_tags_are_neutralised`, `::test_control_characters_stripped` (T4); `tests/core/test_coordinator.py::test_hallucinated_path_dropped` (T8) |
| AC-26 | **T4** | — | `tests/core/test_context.py::test_excluded_paths_and_reasons`, `::test_large_pr_compression_is_deterministic`, `::test_truncation_is_reported` |
| AC-27 | **T1** | — | `tests/db/test_migrations.py::test_upgrade_head_on_sqlite`, `::test_offline_postgres_ddl_is_clean`; `tests/db/test_tenancy.py::test_cross_tenant_reads_are_isolated` |
| AC-28 | **T10** | everyone | The VERIFY command itself |

**Coverage check.** 28 of 28 ACs have a primary owner. No AC is unplaced. Every test file named in
spec §10 has exactly one creating track; the two files with a second contributor
(`tests/api/test_audit.py`, `tests/api/test_suppressions.py`) are appended to by T9 in a **later
wave**, after T7 has merged — so this is an append to a settled file, not a concurrent write.

Two tracks own no AC: **T0** (seed) and **T3** (fixture corpus). They are pure enablers and are
called out as such rather than padded with borrowed criteria. Their VERIFY subsets are still binary.

---

## 6. Ownership of the four differentiating mechanics

These four are the product (spec §1). Assign the most careful builders here.

| Mechanic | Primary track | Also touched by | Why it needs the careful builder |
|---|---|---|---|
| **M1 — Proof by execution** | **T5** | T3 (fixture corpus), T9 (S7 wiring) | Spec R1: longest pole *and* the whole differentiator. The base/head classification table (§4.6) is five rows of exit-code logic where a single inverted branch produces a **false `proven`** — the one failure mode the pitch cannot survive. |
| **M2 — Computed severity** | **T4** | T2 (`band_of`, `is_blocking`), T7 (exposes inputs+weights over the API) | Determinism is the claim. `compute()` must be a pure weighted sum with exact `>=` band boundaries, and `llm_severity_hint` must be structurally incapable of reaching it. |
| **M3 — Fingerprint + suppression ledger** | **T4** | T7 (ledger API), T9 (cross-run dedupe, `finding_outcomes`) | The AST normalisation in §4.5 (`shape_hash`) is subtle: too aggressive and distinct bugs collide, too literal and AC-6 fails. Four stability properties are tested; all four must hold simultaneously. |
| **M4 — Governance rail** | **T6** (COMMENT-only + gate ladder) and **T7** (audit hash chain + ledger) | T2 (`conclude`), T9 (event ordering) | Two halves, two builders. T6 owns "the AI never approves and the gate is red only on proof". T7 owns "every decision is recorded and the record is tamper-evident". |

---

## 7. Offline / fake-backend posture per track

Every track below is verifiable with **no network and the Docker daemon stopped**. Stated explicitly
because it is the only way tonight's VERIFY can pass (G7, AC-28).

| Track | LLM | GitHub | Sandbox | Notes |
|---|---|---|---|---|
| T0 | n/a | n/a | n/a | Only `uv sync` needs network, once. |
| T1 | n/a | n/a | n/a | SQLite via `aiosqlite`; Postgres exercised only through Alembic **offline** DDL generation (`--sql`), never a live connection. |
| T2 | `FakeLLMClient` | n/a | n/a | `AnthropicClient` is a stub here; no SDK call is made. |
| T3 | n/a | n/a | n/a | Pure data. `verify_corpus.py` is stdlib-only. |
| T4 | none — pure modules | none | none | `severity`, `fingerprint`, `diff`, `sanitize` are I/O-free by the §4.3 layering rule; `context` takes pre-fetched file bytes as input. |
| T5 | `LLM_PROVIDER=fake` | none — `LocalPathSource` | **`subprocess_runner`** against `tests/fixtures/repos/` | `docker info` is stubbed to fail in the default test path; the Docker path is covered by `@pytest.mark.requires_docker` tests that are deselected by default (§9.5). |
| T6 | n/a | `respx` over the T3 recorded responses (200 / 403 / 422) | n/a | No live HTTP. |
| T7 | n/a | `respx` for webhook-adjacent calls; `NullJobQueue` so no pipeline runs | n/a | Accuracy and audit tests run against a seeded SQLite DB. |
| T8 | `LLM_PROVIDER=fake` with T3's canned specialist outputs | none | none | Includes the malformed-then-valid pair and the hallucinated-path response. |
| T9 | `LLM_PROVIDER=fake` | `respx` | `subprocess_runner` | `SyncJobQueue` for deterministic pipeline tests; `AsyncioJobQueue` tested directly for the reaper. |
| T10 | all fakes | all faked | Docker stopped | This is the condition AC-28 asserts. |

**Standing rule for every builder:** if a test needs the real network or the real Docker daemon,
mark it `@pytest.mark.requires_network` / `@pytest.mark.requires_docker`. They are deselected by
`addopts` (T0 configures this) and therefore never gate.

---

## 8. Where the edge-case risk concentrates

Spec §7 has 30 edge cases. They are not evenly distributed — two clusters carry most of the risk,
and both live in wave 2.

**Cluster A — the comment-demotion ladder (T6). E1, E2, E4, E17, E19, E24.**
This is where "no finding is ever silently dropped" is either true or a lie. The hard part is that
the runtime assertion `published == inline_exact + inline_nearest + file_level + summary_only`
(AC-17) must hold *through* a 422 retry that moves findings between rungs mid-flight (AC-18, E2) —
so the demotion must be a pure transformation over an explicit assignment table, recomputed and
re-asserted after the retry, not an in-place mutation of a comment list. T6's builder should build
the ladder as `assign_rungs(findings, hunk_map) -> dict[FindingId, DeliveryMode]` first, prove the
invariant on synthetic input, and only then attach it to the poster.

**Cluster B — proof base/head classification (T5). E7, E8, E10, E11, E12, E13, E14.**
Seven edge cases collapse into one five-row truth table (§4.6), and every one of them must resolve
to *at most* `inconclusive`. The invariant to encode first and never lose:

> `proven` requires **all** of: baseline ran and passed (or the file is new ⇒ `not_applicable`),
> head failed, `expected_failure_signal` appears in head output, and `deps_install_ok` is true.
> **Any** other combination is `inconclusive` or `disproven`. There is no other path to `proven`.

T5's builder should write that as a single pure `classify(base: RunResult | None, head: RunResult,
signal: str, deps_ok: bool) -> ProofStatus` function, table-test it exhaustively including the
absurd combinations, and only then wire real execution to it. A false `proven` is the only bug in
this codebase that damages the product's core claim.

**Secondary concentration — E30, the audit `seq` race (T7).** If per-tenant locking on SQLite
proves fiddly, take spec R10's escape hatch immediately: serialise audit writes through a single
writer. Do not spend an hour on advisory locks tonight.

---

## 9. Conflict surface and the integration protocol

### 9.1 Same-wave overlap: zero

- **Wave 1:** T1 writes `config/db/migrations/api(errors,schemas,deps)/main/queue/conftest/tests-db`;
  T2 writes `core/types + core/severity + core/suppression + core/delivery/gate + llm(client,structured)`;
  T3 writes `tests/fixtures` only. Pairwise disjoint.
- **Wave 2:** T4 writes six top-level `core/*.py` modules and seven `tests/core/test_*.py` files;
  T5 writes `core/proof/**` + `tests/proof/**`; T6 writes `core/delivery/**` + `tests/delivery/**`;
  T7 writes `api/routes_*.py` + `core/{audit,accuracy}.py` + `tests/api/**`; T8 writes
  `core/specialists/**` + `core/coordinator.py` + `llm/{circuit,anthropic}.py` +
  `tests/core/test_coordinator.py` + `tests/llm/test_circuit.py`. Pairwise disjoint. T4 and T8 both
  write into `tests/core/` but never the same file.

### 9.2 Cross-wave, deliberate, append-only (safe because the earlier owner has merged)

| File | Earlier owner | Later owner | Nature of the second edit |
|---|---|---|---|
| `src/prguard/core/severity.py` | T2 (predicates) | T4 (`compute` + derivation) | add functions |
| `src/prguard/core/suppression.py` | T2 (`matches` guards) | T4 (scope matrix internals) | fill in |
| `src/prguard/core/delivery/gate.py` | T2 (`conclude`) | T6 (ladder + GitHub I/O) | add functions |
| `src/prguard/core/queue.py` | T1 (protocols, `Null`/`Sync`) | T9 (`AsyncioJobQueue`, workers, reaper) | fill in stub |
| `src/prguard/llm/anthropic.py` | T2 (stub) | T8 (real client) | fill in stub |
| `src/prguard/main.py` | T1 (factory, handlers, router registration) | T9 (lifespan: workers + reaper) | add lifespan |
| `tests/api/test_audit.py` | T7 | T9 | append one test |
| `tests/api/test_suppressions.py` | T7 | T9 | append one test |

### 9.3 Freeze rules (these prevent the expensive conflicts)

1. **`pyproject.toml` is frozen after T0.** It ships the complete X10 dependency list. If a wave-1/2
   builder believes it needs a new dependency, that is a signal it has drifted off-spec — escalate to
   Vansh rather than adding it. (The spec is explicit that no package needs an account or a private
   index, and that the docker SDK is deliberately not used.)
2. **Root `tests/conftest.py` is frozen after T1.** Tracks needing extra fixtures add a
   package-level `tests/<pkg>/conftest.py`. No exceptions.
3. **`src/prguard/main.py` router registration is frozen after T1.** T1 registers all eight routers
   against the empty `APIRouter()` modules it creates; T7 fills the route bodies and never touches
   `main.py`. T9 touches `main.py` only to add the lifespan.
4. **Nobody edits `docs/01-market-analysis.md` or the spec.** Read-only (spec §3).

### 9.4 Merge order

`T0` → `T1` → `T2` → `T3` → then wave 2 in the order **T4, T5, T6, T8, T7** (T7 last because it has
the widest `tests/api` surface and benefits from merging onto a settled tree) → `T9` → `T10`.
After every merge, `main` must still pass the merged tree's own VERIFY subset before the next merge
lands. A merge that reddens `main` is reverted, not patched forward.

---

## 10. Track detail

Every track's steps are TDD-ordered: **write the failing test → run it and confirm it fails for the
right reason (not an import error, not a typo) → minimal implementation → green → refactor under
green.** Committing is standing behaviour, not a step; it is never listed below.

---

### T0 — Repo seed · wave 0 · depends_on: — · AC: none (enabler)

Deliberately tiny. Everything else waits on it, so it does exactly one thing: make `uv run pytest`,
`uv run ruff check` and `uv run mypy` all exit 0 on an otherwise empty project.

1. `git init` (if not already), initial commit preserving `docs/` untouched.
2. Write `pyproject.toml`: `[project]` name `prguard`, requires-python `>=3.12`, the **complete**
   X10 dependency list (fastapi, uvicorn[standard], sqlalchemy[asyncio], aiosqlite, asyncpg,
   alembic, pydantic, pydantic-settings, httpx, anthropic, unidiff, tenacity) and dev group
   (pytest, pytest-asyncio, respx, ruff, mypy). Configure:
   - `[tool.ruff]` line-length 100, select including `I`; `[tool.ruff.lint.isort]` known-first-party `prguard`.
   - `[tool.mypy]` strict on `src` (`disallow_untyped_defs`, `warn_return_any`, `no_implicit_optional`).
   - `[tool.pytest.ini_options]` `asyncio_mode = "auto"`, markers `requires_docker` / `requires_network`,
     and `addopts = "-m 'not requires_docker and not requires_network'"` (spec §9.5).
3. Create the package tree from spec §4.3 as empty packages: `src/prguard/{api,db,core,core/specialists,core/proof,core/delivery,llm,migrations}/__init__.py`, plus `src/prguard/py.typed`.
   Create `tests/{api,core,delivery,proof,db,llm,integration,fixtures}/__init__.py`.
4. Write `tests/test_smoke.py::test_package_imports` (fails: package does not import) → make it pass.
   This exists so `pytest` exits 0 rather than 5 on an empty suite.
5. `.gitignore` (`.venv`, `*.db`, `__pycache__`, `.prguard_proof`), `.env.example` listing every key
   from spec §4.8 with its default, short `README.md` with the VERIFY command.
6. `uv sync` — **the only network operation in this plan.**
7. Run VERIFY subset; hand `main` to wave 1.

**Scope fence:** no models, no routes, no config class. If T0 takes more than ~15 minutes it has
over-scoped.

---

### T1 — Persistence, config & app shell · wave 1 · depends_on: T0 · AC-27

The largest single-builder track and the critical path for wave 2. It is **transcription, not
design**: spec §5.1 gives every table and index, §4.8 gives every config key and default, §6.0 gives
the error registry, §6.1–6.11 give every response shape. Do not invent.

1. `tests/db/test_migrations.py::test_upgrade_head_on_sqlite` (failing: no alembic).
2. `src/prguard/config.py` — `Settings(BaseSettings)` with **every** key from §4.8. Include the
   startup validator that `SEVERITY_WEIGHTS` sums to 1.0 and the band thresholds are descending.
   Test: `tests/db/test_config.py::test_weights_must_sum_to_one` (failing → green).
3. `db/base.py` (declarative `Base` + `MetaData` naming convention), `db/session.py` (async engine,
   sessionmaker, SQLite vs Postgres URL handling, `get_session` dependency).
4. `db/models.py` — all twelve tables from §5.1 with the stated columns, the stated indexes, the
   `String(36)` UUID ids, `DateTime(timezone=True)` Python-side defaults, `JSON` with `with_variant`
   for JSONB, `String` + `StrEnum` + `CheckConstraint` instead of native enums, `tenant_id` on every
   table. Green the migration test via `alembic revision --autogenerate` → `0001` (which also seeds
   the `default` tenant).
5. `tests/db/test_migrations.py::test_offline_postgres_ddl_is_clean` — run Alembic in offline mode
   for the `postgresql` dialect and assert the emitted DDL contains no SQLite-only construct and no
   native `ENUM`. Failing → green.
6. `api/errors.py` — `ErrorEnvelope` model, the §6.0 code→status registry, FastAPI exception
   handlers that always emit the envelope including `request_id`.
7. `api/schemas.py` — pydantic request/response models transcribed from §6.1–6.11 **exactly** as
   written, including `Finding` (§6.4) with nested `location` / `severity` / `proof` / `delivery` /
   `history`, the pagination `page` object, and the `/v1/accuracy` shape with per-metric `n`,
   `definition` and required `caveats`.
8. `api/deps.py` — DB session dep, `TenantScope` dep (`X-Tenant-Id` → default tenant), bearer-auth
   dep that is a no-op when `PRGUARD_API_TOKEN` is unset.
9. `core/queue.py` — `JobQueue` protocol, `NullJobQueue`, `SyncJobQueue`; `AsyncioJobQueue` as a
   typed stub raising `NotImplementedError` (T9 fills it).
10. `main.py` — `create_app()`, exception-handler registration, request-id middleware, and
    registration of all eight routers created as **empty `APIRouter()` modules**
    (`routes_reviews.py`, `routes_findings.py`, `routes_suppressions.py`, `routes_audit.py`,
    `routes_accuracy.py`, `routes_webhooks.py`, `routes_health.py`). T7 fills them; nobody else
    edits `main.py` until T9.
11. `tests/api/test_app_shell.py::test_app_starts_and_unknown_route_returns_envelope` — proves the
    envelope path end to end with zero business logic.
12. `tests/conftest.py` — the **frozen** root fixtures: in-memory/temp-file SQLite engine per test,
    migrated schema, session, `AsyncClient` app fixture with `NullJobQueue` injected, tenant
    fixtures A and B, and row factories for every table. Everything downstream depends on these.
13. `tests/db/test_tenancy.py::test_cross_tenant_reads_are_isolated` — seed under tenant A, read as
    tenant B through the `TenantScope` dep, assert empty. Failing → green.

**If T1 runs long,** Vansh may merge it in two parts — steps 1–5 + 12 (models/config/conftest) first,
which is enough to unblock T4, T5 and T8 — then steps 6–11 to unblock T6 and T7. This is the one
sanctioned partial merge in the plan.

---

### T2 — Contracts, pinned predicates & LLM substrate · wave 1 · depends_on: T0 · AC-23c

Small, high-leverage, and the reason wave 2 has no internal dependencies. Signatures are given
verbatim in §3 above — implement those, not variants of them.

1. `core/types.py` — every alias and dataclass from §3. No logic.
2. `tests/core/test_pinned_predicates.py::test_band_of_boundaries` (failing) → `severity.band_of`.
   Test the exact boundary values 0.75, 0.55, 0.35, 0.15 and just-below each.
3. `::test_is_blocking_truth_table` (failing) → `severity.is_blocking`. Enumerate the full cross
   product of `proof_status` × `band` × `language ∈ {python, other}` × `status` and assert the §4.4
   conjunction. This single function is the sole writer of `blocking` in the codebase.
4. `::test_gate_conclude_precedence` (failing) → `delivery/gate.conclude`. Assert failure beats
   neutral beats success.
5. `::test_suppression_matches_guards` (failing) → `suppression.matches` covering expiry in the past,
   `revoked_at` set, and tenant/repo scoping. Leave the glob/pattern matrix to T4 behind a helper
   `_scope_matches(...)` that T4 completes.
6. `llm/client.py` — `LLMClient` protocol, `Message`/`LLMResponse`, `FakeLLMClient` that resolves
   canned responses from `tests/fixtures/llm/` by a deterministic key, and `AnthropicClient` as a
   typed stub raising `NotImplementedError`.
7. `tests/llm/test_structured.py::test_malformed_json_is_repaired_once` (failing) →
   `llm/structured.complete_structured`: validate against the pydantic schema, on failure re-issue
   **exactly one** repair call with the validation error appended, then raise. Assert the fake client
   saw exactly two calls and the second prompt contains the error text. **(AC-23c)**
8. Add `::test_prose_response_is_rejected` — a non-JSON response must not silently pass.

---

### T3 — Offline fixture corpus · wave 1 · depends_on: T0 · AC: none (enabler)

Pure data, zero imports from `src/`. This track is why T5, T6, T7 and T8 can be fully offline. Build
the data **from the spec's own examples** so downstream assertions match the documented shapes.

1. `tests/fixtures/repos/buggy_calc/base/**` and `.../head/**` — a miniature stdlib-only Python
   package (`app/billing.py`, `app/checkout.py`, `tests/test_billing.py`) where head introduces the
   spec's worked example: `apply_discount(price, rate)` multiplying by an unchecked `None`. Base must
   pass `pytest`; head must fail with `TypeError`.
2. `.../buggy_calc_disproven/**` — a head tree where the claimed bug is actually guarded, so a
   generated repro **passes** at head (drives AC-11).
3. `.../no_manifest/**` (E8: no `pyproject.toml`/`requirements.txt`) and `.../bad_requirements/**`
   (E10: an unresolvable pin) — one tree each, minimal.
4. `.../slow_test/**` — a repro that sleeps past `PROOF_TIMEOUT` (E11), and
   `.../pre_existing_failure/**` where base and head both fail (E13).
5. `tests/fixtures/github/*.json` — recorded shapes for: PR detail, unified diff (with in-hunk,
   near-hunk and far-from-hunk line positions so T6 can exercise all four rungs), file contents,
   commits-for-churn, a successful review POST response, a **422** out-of-hunk rejection body naming
   a specific comment, a **403** body, and a rate-limit 403 with `x-ratelimit-*` headers.
6. `tests/fixtures/webhooks/*.json` — `pull_request` `opened` / `synchronize` / `reopened` /
   `ready_for_review`, a draft PR, and an `issues` event.
7. `tests/fixtures/llm/*.json` — specialist outputs matching §6.12 exactly: a valid multi-finding
   response, an empty-findings response (valid and good), a malformed-JSON response paired with its
   valid repair, a prose response, one naming a file never supplied in context; a coordinator
   response; proof-generator responses matching §4.6's contract (a good repro, a trivially-passing
   repro, an import-error repro).
8. `tests/fixtures/verify_corpus.py` — **stdlib only**, no pytest, no `src` import. Asserts every
   tree exists, that `buggy_calc/base` runs clean under `unittest` and `buggy_calc/head` raises the
   seeded `TypeError`, that every JSON file parses, and that every `llm/*.json` specialist fixture
   satisfies the §6.12 constraints (`0 <= confidence <= 1`, `start_line <= end_line`). Exits 0/1.

**VERIFY subset:** `python3 tests/fixtures/verify_corpus.py`

---

### T4 — Analysis core (M2 + M3) · wave 2 · depends_on: T1, T2, T3 · AC-5a, AC-6, AC-9, AC-16, AC-25a, AC-26

All six modules are I/O-free per the §4.3 layering rule, which makes them cheap to test exhaustively.
Owns two of the four differentiating mechanics. **Give this track a careful builder.**

1. `tests/core/test_diff.py` (failing) → `core/diff.py`: unified-diff parsing via `unidiff`, hunk
   extraction, and a `LineMap` answering "is `path:line` on the RIGHT side inside a hunk, and what is
   the nearest in-hunk line?" — T6's ladder consumes this, so the contract matters.
2. `tests/core/test_severity.py::test_score_matches_formula`, `::test_band_boundaries`,
   `::test_llm_hint_is_ignored` (failing) → `severity.compute()` as a pure weighted sum over
   `SeverityInputs` using config weights. Table-drive it. The hint test must construct a finding with
   `severity_hint="critical"` and inputs scoring 0.1 and assert `band == "low"`. **(AC-5a)**
3. `tests/core/test_blocking_rules.py::test_non_python_never_blocks` (failing) → assert via T2's
   `is_blocking` across every severity band and every `proof_status`. **(AC-16)**
4. `tests/core/test_fingerprint.py` — four tests (drift, local rename, rewording, logic change)
   failing → `core/fingerprint.py`: `symbol_path` from the head AST (no line numbers), `shape_hash`
   from the normalised enclosing function per §4.5, and the non-Python `::#<line // 50>` bucket path.
   Include E28: a syntactically invalid file falls back to the bucket path and **never raises**. **(AC-6)**
5. `tests/core/test_suppression.py` — three tests failing → complete `_scope_matches` for the
   `line`/`file`/`pattern`/`repo`/`tenant` matrix. `test_scope_matrix` must assert both that the
   intended findings match **and that no others do**. **(AC-9)**
6. `tests/core/test_sanitize.py::test_boundary_tags_are_neutralised`, `::test_control_characters_stripped`
   (failing) → `core/sanitize.py`: escape `</untrusted_content>` and `<instructions>`-class boundary
   tags, strip bidi/control characters, wrap in `<untrusted_content source="...">`. Assert on the
   produced string, since T8 asserts on the captured prompt. **(AC-25a)**
7. `tests/core/test_context.py` — three tests failing → `core/context.py`: the E9 exclusion
   classifier with per-file reasons, `ast` symbol extraction, risk-tier computation (assumption 11),
   and the deterministic compression order (sensitivity desc → change size asc → largest hunks,
   hard-stop at `CONTEXT_TOKEN_BUDGET`). `test_large_pr_compression_is_deterministic` must run the
   selection twice and assert identical output. **(AC-26)**
8. Refactor: confirm no module in this track imports `api/*`, the DB, or `httpx`. Add an import-guard
   assertion in `tests/core/test_blocking_rules.py` if it is cheap.

---

### T5 — Proof subsystem (M1) · wave 2 · depends_on: T1, T2, T3 · AC-10, AC-11a, AC-12a, AC-13

**The differentiator and the longest pole (spec R1). Give this track the most careful builder.**
Build the classifier before the executor — see §8 Cluster B.

1. `tests/proof/test_classify.py::test_only_one_path_yields_proven` (failing) → a pure
   `proof/runner.classify(base, head, signal, deps_ok) -> ProofStatus`. Exhaustively table-test
   every combination of base ∈ {pass, fail, none/not_applicable}, head ∈ {pass, fail, timeout,
   error}, signal present/absent, deps_ok true/false. Assert `proven` appears for exactly the one
   documented row. **This test is the guard against the only bug that would kill the pitch.**
2. `tests/proof/test_selector.py` (failing) → `proof/selector.py`: python-only, category filter,
   not suppressed, `severity_score >= PROOF_MIN_SCORE`, top `PROOF_MAX_PER_RUN` by score.
3. `tests/proof/test_workspace.py` (failing) → `proof/workspace.py` with the `WorkspaceSource`
   protocol, `LocalPathSource` (copies a T3 fixture tree) and `GitHubTarballSource` (exercised only
   under `respx`). Materialise base and head, write the generated test into both.
4. `tests/proof/test_runner_selection.py::test_docker_unavailable_falls_back_to_subprocess`,
   `::test_no_sandbox_yields_neutral_gate` (failing) → the `docker info` probe (cached 60 s),
   selection logic, `runner`/`isolation` recording, and the `PROOF_ALLOW_SUBPROCESS=false` path
   producing `skipped_no_env` + `gate.conclude(... all_proofs_skipped_for_env=True) == "neutral"`.
   **(AC-13)**
5. `tests/proof/test_runner_subprocess.py::test_base_passes_head_fails_marks_proven` (failing) →
   `proof/subprocess_runner.py`: venv, `resource.setrlimit` on CPU/AS/NOFILE, scrubbed env, cwd in a
   temp workspace, process-group kill on timeout. Run against `buggy_calc`. Assert both exit codes,
   real captured output, and `severity_inputs.proof_confidence == 1.0`. **(AC-10)**
6. `::test_passing_repro_marks_disproven` against `buggy_calc_disproven` → `outcome=passed_unexpectedly`,
   `proof_status=disproven`, `status=disproven`, `blocking=false`, severity clamped to `info` with
   the documented note, artifact retained. **(AC-11a)**
7. `tests/proof/test_runner_failure_modes.py` — three tests (failing) → timeout (`slow_test`),
   dependency-install failure (`bad_requirements`, capped at `inconclusive` per E10), and
   base-and-head-both-failing (`pre_existing_failure`). Also cover E8 (`no_manifest`, stdlib-only).
   **(AC-12a)**
8. `proof/generator.py` — one `complete_structured` call per candidate against T2's substrate using
   T3's proof-generator fixtures; JSON-schema validated with one repair retry. Test the
   import-error fixture resolves to `inconclusive`, never `proven`.
9. `proof/docker_runner.py` — shells out to the `docker` CLI with the §4.6 flags, no docker SDK.
   Its live tests are `@pytest.mark.requires_docker` and therefore deselected tonight.
10. Secret redaction over all persisted stdout/stderr (E26) plus truncation at
    `PROOF_OUTPUT_MAX_BYTES`, with a test asserting `ghp_`/`sk-ant-`/`AKIA`/`Bearer` are masked.

---

### T6 — Delivery & governance (M4a) · wave 2 · depends_on: T1, T2, T3 · AC-7a, AC-14, AC-15, AC-17, AC-18, AC-24

Owns "the AI never approves" and "the gate is red only on proof". See §8 Cluster A — build the rung
assignment as a pure function first. **Give this track a careful builder.**

1. `tests/delivery/test_comment_ladder.py::test_ladder_assigns_highest_valid_rung`,
   `::test_no_finding_is_dropped` (failing) → `delivery/comment_ladder.py` as pure
   `assign_rungs(findings, line_map) -> dict[FindingId, DeliveryMode]` over T4's `LineMap`. Synthetic
   input mixing in-hunk / within-10-lines / far / non-diff-file. The conservation assertion
   `len(published) == sum(ladder_breakdown)` must live in **production code**, not only in the test.
   **(AC-17)**
2. `tests/delivery/test_governance.py::test_review_event_is_always_comment` (failing) →
   `delivery/review_poster.py` building exactly one review payload with `event: "COMMENT"`; assert
   for a zero-finding run and an all-blocking run. **(AC-14)**
3. `::test_source_contains_no_approve_path` — walk `src/` and assert the literals `"APPROVE"` and
   `"REQUEST_CHANGES"` appear nowhere. Cheap, and it is the governance claim made executable. **(AC-14)**
4. `tests/delivery/test_review_poster.py::test_exactly_one_review_api_call` (failing) → under
   `respx`, assert exactly one `POST …/pulls/{n}/reviews`. Use `line`/`side`/`start_line`/`start_side`
   only — `position` must not appear. **(AC-17)**
5. `::test_422_demotes_and_retries_once` (failing) using T3's recorded 422 → demote the named
   comments one rung, retry the **whole** review exactly once, demote survivors to `summary_only`,
   record `degradations:["review_422_demoted"]`, and **re-assert the conservation invariant after the
   retry**. **(AC-18)**
6. `tests/delivery/test_degraded_delivery.py::test_403_on_review_preserves_payload` (failing) →
   run `succeeded`, `delivery_status="degraded"`, full unposted payload persisted. Also cover E19
   (PR closed mid-run → `skipped_pr_closed`) and E24 (zero findings → short body, no manufactured
   nitpick). **(AC-24)**
7. `tests/delivery/test_gate.py::test_red_only_on_proven_finding`, `::test_unproven_critical_does_not_block`,
   `::test_no_sandbox_is_neutral`, `::test_gate_ladder_falls_through_to_dry_run` (failing) →
   complete `delivery/gate.py` around T2's `conclude()`: check run → commit status → dry_run, with
   `gate.delivery` recording the rung reached (E18 is expected behaviour, not an error). **(AC-15, AC-24)**
8. `delivery/github_client.py` — httpx client with 3× backoff+jitter, `x-ratelimit-reset` honoured up
   to `GITHUB_MAX_WAIT`, and 403/404/422 mapped to typed errors (E27). All tests under `respx`.
9. Comment reuse for re-review (E3): a finding whose fingerprint already has a live
   `github_comment_id` on this PR is **updated, not re-posted**. Unit-test the decision here; T9
   proves it end to end. **(AC-7a)**

---

### T7 — API surface, audit & accuracy (M4b) · wave 2 · depends_on: T1, T2, T3 · AC-1, AC-2, AC-3a, AC-5b, AC-8a, AC-11b, AC-19, AC-21a, AC-22

The widest surface but the most uniform work: routes over schemas T1 already defined. Owns the
tamper-evident audit chain — the second half of M4.

1. `tests/api/test_reviews.py::test_trigger_returns_202_without_blocking` (failing) →
   `routes_reviews.py` `POST /v1/reviews`: parse `pr_url` (full URL and `owner/repo#42`), upsert
   repo/PR, insert `review_runs` with `status=queued`, commit, enqueue into `NullJobQueue`, return
   202. Assert under 500 ms, **zero** GitHub calls on the request path (assert on the respx router),
   and that the run is not complete at return. **(AC-1)**
2. `tests/api/test_errors.py::test_error_envelope_matrix` (failing) → the four documented cases
   (422 `INVALID_PR_URL`, 404 `REVIEW_NOT_FOUND`, 401 `UNAUTHORIZED` with the token set, 409
   `RESULT_NOT_READY`), each asserted for the full §6.0 body shape including `request_id`. **(AC-2)**
3. `::test_status_reports_stage_progress` (failing) → `GET /v1/reviews/{id}` deriving `stage_index`,
   `stage_total: 9`, `stage_label` and `seconds_since_heartbeat` from a seeded row. A failed run
   returns **HTTP 200** with `error` in the body. **(AC-3a)**
4. `GET /v1/reviews/{id}/result` (§6.3) and `POST /v1/reviews/{id}/rerun`; E21 dedupe returning the
   existing run with `"deduplicated": true` unless `force`.
5. `tests/api/test_findings.py::test_response_exposes_severity_inputs` (failing) →
   `routes_findings.py` list + detail with the §6.5 filters and cursor pagination. The Finding object
   must carry `severity.inputs` **and** `severity.weights` so a dashboard re-derives nothing. **(AC-5b)**
6. `tests/api/test_suppressions.py::test_ledger_lists_suppression_with_reason` (failing) →
   `routes_suppressions.py`: `POST /v1/findings/{id}/suppress` (non-empty `reason` enforced,
   `match_path` required for `pattern`), `GET /v1/suppressions`, and `DELETE` as a **soft** revoke.
   Side effects: finding → `suppressed`, a `finding_outcomes` row, a `suppression.created` audit
   event. **(AC-8a)**
7. `tests/api/test_audit.py::test_chain_verifies`, `::test_tampering_is_detected` (failing) →
   `core/audit.py`: append-only writer, per-tenant monotonic `seq` allocated inside the insert
   transaction (E30 — take spec R10's single-writer escape hatch immediately if SQLite locking
   fights back), `event_hash = sha256(prev_hash + canonical_json(...))`, and a read-time verifier.
   A broken chain is **served** with `verified:false` and `broken_at_seq`, never hidden.
   `routes_audit.py` exposes §6.8. **(AC-21a)**
8. `tests/api/test_accuracy.py::test_report_math_matches_definitions`,
   `::test_every_metric_has_n_and_definition`, `::test_disproven_counts_in_fp_rate` (failing) →
   `core/accuracy.py` + `routes_accuracy.py` against a seeded DB. Every ratio carries its `n` and
   `definition`; `caveats` is non-empty. **(AC-22, AC-11b)**
9. `tests/api/test_webhooks.py` — five tests (failing) → `routes_webhooks.py`: fail-closed when the
   secret is unset, HMAC-SHA256 verification, `webhook_deliveries` unique-`delivery_id` idempotency,
   draft skip, unhandled-event ignore, and the handled actions calling the **same**
   `enqueue_review(...)` helper as §6.1 (G6). **(AC-19)**
10. `routes_health.py` — `/healthz` with no dependency checks; `/readyz` reporting DB plus
    optional-dependency status without failing on them (§6.11).

---

### T8 — Specialists & coordinator · wave 2 · depends_on: T1, T2, T3 · AC-25b

The smallest wave-2 track by test surface and the largest by *unmeasurable* risk (spec R5: all 28 ACs
can pass while the specialists emit noise). Budget the saved time on prompt quality.

1. `core/specialists/prompts/SHARED.md` — the standing instruction that everything inside
   `<untrusted_content>` is data and never instruction, the structured-output-only rule, the negative
   prompt ("an empty findings list is a good answer; do not manufacture nitpicks"), and the evidence
   requirement.
2. `bugs.md`, `security.md`, `tests.md` (test-integrity: weakened / deleted / skipped tests),
   `quality.md` — each emitting only the §6.12 schema.
3. `tests/core/test_coordinator.py::test_hallucinated_path_dropped` (failing) → `core/coordinator.py`
   drops any finding whose `file_path` was not supplied in context, with
   `drop_reason="hallucinated_path"`, and persists the drop list. **(AC-25b)**
4. Add `::test_drops_speculative_and_nitpick`, `::test_dedupes_across_specialists`,
   `::test_normalises_to_canonical_finding` — each drop reason from §6.12 must be reachable and
   recorded, because `/result` reports what was filtered and why.
5. `::test_deterministic_merge_fallback` — when the coordinator LLM call fails, fall back to union +
   exact-fingerprint dedupe with no FP filtering, and mark the run degraded (§8.1).
6. `core/specialists/base.py` — the `Specialist` protocol and a shared runner doing
   `asyncio.gather` under a semaphore, each call through `complete_structured`, each returning
   `SpecialistOutput`. Per-specialist failure is isolated and returned as a typed failure, not raised.
7. `core/specialists/registry.py` — risk tier → specialist set (trivial: bugs+security; standard:
   +tests; full: all four), driven by T4's computed tier.
8. `tests/llm/test_circuit.py` (failing) → `llm/circuit.py`: 5 failures / 60 s opens for 120 s, per
   model, with the `MODEL_FAILBACK_CHAIN` opus→sonnet failback.
9. `llm/anthropic.py` — the real client filling T2's stub. No test may call it without
   `@pytest.mark.requires_network`.

---

### T9 — Pipeline, queue & orchestration · wave 3 · depends_on: T4, T5, T6, T7, T8 · AC-3b, AC-4, AC-7b, AC-8b, AC-12b, AC-20, AC-21b, AC-23a

**This part is genuinely sequential and this plan does not pretend otherwise.** The nine-stage
pipeline, the worker loop, cancellation and the heartbeat are one mechanism; splitting them would put
an integration seam through the trickiest code in the repo.

1. `tests/core/test_queue.py::test_reaper_fails_stale_runs` (failing) → complete `AsyncioJobQueue`:
   worker tasks over `asyncio.Queue`, `REVIEW_MAX_CONCURRENCY` bound, startup re-enqueue of every
   `status=queued` run, and the reaper marking stale `running` runs `failed`/`STALE_RUN` (E22).
   **(AC-3b)**
2. `::test_supersede_cancels_older_head_sha` (failing) → the §4.2 supersede rule plus
   cancellation checks at every stage boundary.
3. `main.py` lifespan wiring: start workers + reaper, stop cleanly. The only `main.py` edit in wave 3.
4. `core/ingest.py` (S1) — resolve URL/payload to repo/PR/head/base, fetch the unified diff under
   `respx`; fatal on PR-not-found / no-diff / forbidden (E16) with the right `error_code`.
5. `core/pipeline.py` — the nine stages in order, each writing `stage`, `stage_started_at`,
   `heartbeat_at` before the next, each emitting a `review.stage_completed` audit event, with
   `fatal` vs `degrading` failure handling and `degradations[]` accumulation.
6. `tests/integration/test_pipeline_end_to_end.py::test_full_run_with_fake_backends` (failing) →
   green. Fake LLM + respx GitHub + `LocalPathSource` fixture repo + `SyncJobQueue` produce a
   `succeeded` run whose `/result` carries findings with severity inputs, ≥1 proof artifact, a gate
   decision and a `review_payload`, with all nine stages recorded. **(AC-4, and AC-12b: the proof
   failure-mode fixtures must leave the run `succeeded`)**
7. `tests/integration/test_rereview.py::test_force_push_posts_no_duplicate_comments`,
   `::test_inflight_run_is_superseded` (failing) → green. Run 2 at a new head SHA with the same bug
   reuses the existing `github_comment_id` and posts **zero** new comments; vanished fingerprints get
   a `finding_outcomes` row `addressed`. **(AC-7b)**
8. `tests/integration/test_trigger_parity.py::test_api_and_webhook_produce_identical_review`
   (failing) → green: byte-identical `review_payload` from both doors, differing only in `trigger`. **(AC-20)**
9. `tests/core/test_resilience.py::test_single_specialist_failure_degrades`,
   `::test_total_llm_outage_fails_run_cleanly` (failing) → green. All-fail ⇒ run `failed` with
   `LLM_UNAVAILABLE`, nothing posted, **no exception escapes the worker**. **(AC-23a)**
10. Append `tests/api/test_audit.py::test_run_emits_complete_ordered_event_set` — the full ordered
    sequence from `review.requested` to `review.completed`. **(AC-21b)**
11. Append `tests/api/test_suppressions.py::test_suppress_then_rerun_excludes_finding` — the S6
    ledger application, excluded from the review payload. **(AC-8b)**
12. Wire E29: a suppression that matches a would-be-blocking proven finding wins, is stored
    `suppressed` **with** its proof artifact, and emits `override.break_glass`.

---

### T10 — Integration & VERIFY green · wave 4 · depends_on: T9 · AC-28

A real track, not a victory lap. Five wave-2 branches plus T9 have landed; `mypy --strict` over the
union is where the last hour goes.

1. Run the full VERIFY on the merged tree **with the network off and the Docker daemon stopped**.
   Capture the first failure; do not fix forward blind.
2. Reconcile any drift between T1's ORM columns and T2's `core/types.py` dataclasses (the one
   predictable divergence — both transcribed §5/§6.4 independently). The ORM is authoritative for
   persistence; the dataclass is authoritative for the pipeline; the pydantic schema is authoritative
   for the wire. Add explicit mappers rather than renaming fields at this hour.
3. Fix `mypy --strict` fallout at the seams (`Any` leaking out of JSON columns, missing return
   annotations in glue code, `Optional` narrowing across stage boundaries).
4. Fix `ruff` import-order fallout from merged files.
5. Confirm the deselect markers work: `uv run pytest -q` must not attempt Docker or network; spot
   check with `uv run pytest -q -m requires_docker --collect-only` to prove those tests exist.
6. Confirm the §9.4 suite budget: no single test over 30 s, whole suite under 120 s. Anything slower
   is almost certainly a real sandbox timeout leaking into the default path.
7. Write `docs/runs/<RUN_ID>-verify.md` with the captured VERIFY output as the evidence artifact.
   **(AC-28)**
8. Sanity-run one live review against a real public PR with `ANTHROPIC_API_KEY` set — **outside**
   VERIFY, purely to satisfy spec R5 with Vansh's eyes. This is the only step in the plan that
   touches the network at runtime and it gates nothing.

---

## 11. Risks in this plan

These are risks of the **decomposition**, not of the spec (spec §11.1 owns those and still applies).

| # | Risk | Why it matters tonight | Mitigation baked into this plan |
|---|---|---|---|
| **P1** | **T1 is the critical path for five builders and is the largest single-builder track here** (12 tables + migrations + every response schema + the error registry + the frozen root conftest). If it slips or gets creative, wave 2 idles at full cost. | It is the single point where the wave structure can fail. | It is transcription, not design — §5.1, §4.8, §6.0 and §6.1–6.11 give every column, key, code and shape verbatim, and the track detail says so. Hard scope fence: no route bodies, no business logic. The one sanctioned **partial merge** (steps 1–5 + 12) releases T4/T5/T8 early if the clock demands it. |
| **P2** | **Wave 2 → wave 3 integration under `mypy --strict`.** Five branches, one tree, one human reviewing at night. Type-level seams between five independently-authored modules are where the last hour disappears. | T10 is the only thing standing between "all tracks green" and "VERIFY green", and AC-28 is the whole-project gate. | Same-wave file overlap is **zero** (§9.1) and cross-wave overlap is append-only onto settled files (§9.2). Three freeze rules (`pyproject.toml`, root `conftest.py`, `main.py` router registration) remove the three worst conflict sources. Merge order is pinned (§9.4) and a merge that reddens `main` is reverted, not patched forward. T10 is budgeted as a real track. |
| **P3** | **T5 is both the differentiator and the longest pole** (spec R1), and it sits in the widest wave, so it has the least slack. A slipped T5 does not just lose an AC — it loses the pitch, because "proof by execution" *is* the product. | M1 is the one mechanic no competitor ships. | T3 lands the entire offline fixture corpus in wave 1, so T5 starts with base/head trees, timeout trees, bad-manifest trees and canned generator responses already committed. T5's step 1 is a **pure** `classify()` with an exhaustive truth table before any process is spawned, so the catastrophic failure (a false `proven`) is designed out before execution exists. The subprocess runner is built first and Docker second, matching the machine's actual state (daemon down, X7). |

**Also watch (below the top three):** T1's ORM and T2's `core/types.py` transcribe the same spec
sections independently, so field-name drift is likely and is explicitly assigned to T10 step 2. And
T8 is the track whose quality VERIFY cannot measure (spec R5) — the only check is T10 step 8 and
Vansh's eyes.

---

## 12. De-scope ladder if the clock runs out

Spec R7 fixes the order of sacrifice. Mapped onto tracks, drop in this order and no other:

1. **`/v1/accuracy`** — T7 step 8. Costs AC-22 and AC-11b.
2. **`finding_outcomes` population** — T9 step 7 (partial). Costs part of AC-7b.
3. **Audit hash chain** (keep the events, drop `prev_hash`/`event_hash` verification) — T7 step 7.
   Costs AC-21a.
4. **The webhook path** — T7 step 9 and T9 step 8. Costs AC-19 and AC-20. The API trigger is the
   demo path (spec Q6), which is exactly why this is droppable.
5. **Risk tiers** (always run all four specialists) — T8 step 7.

**Never sacrifice:** T5 (proof runner), T4's `severity.compute` and `fingerprint`, T4/T7's
suppression ledger, T6's `COMMENT`-only guard and proof-gated gate. Those four are the product; a
build that ships only those four is still the thing the market does not have.

---

## 13. Builder count per wave

| Wave | Builders | Tracks |
|---|---|---|
| 0 | **1** | T0 |
| 1 | **3** | T1, T2, T3 |
| 2 | **5** | T4, T5, T6, T7, T8 |
| 3 | **1** | T9 |
| 4 | **1** | T10 |

**If fewer than five builders are available for wave 2**, fold in this order: T8 into T4 (both are
analysis-side and share the sanitize/context contract), then T7's accuracy+audit half into T6 (both
are M4). Do **not** fold T5 into anything — it is the differentiator and it needs undivided attention.

**If more builders are available**, do not add tracks. The wave structure, not the builder count, is
the binding constraint, and a sixth wave-2 track would have to be carved out of T5 or T7 — the two
places where an extra seam costs more than it saves.
