"""The nine-stage pipeline — spec §4.1, §4.2, §8.1. The one place the product is assembled.

Every component this module calls is somebody else's and is already tested on its own. What
lives here is the **order**, the **failure policy** and the **persistence**, and those three
are the whole of the track:

* **Order.** Nine stages, in §4.1's sequence. Before each one the run records `stage`,
  `stage_started_at` and `heartbeat_at`, so `GET /v1/reviews/{id}` can say "stage 3 of 9,
  12s since last output" while it happens; after each one a `review.stage_completed` event
  lands in the audit chain. Every boundary is also a cancellation check (§4.2, E3).
* **Failure policy.** §8.1, literally. S1 is fatal, S2 and S8 degrade, all specialists
  failing is fatal (`LLM_UNAVAILABLE`), a dead coordinator falls back to a deterministic
  merge, and **S7 never fails a run** — proof is the product's claim, not its dependency.
  Nothing escapes :meth:`Pipeline.run`: an exception that got out would take the worker —
  and every run queued behind it — with it, so the reaper is the recovery of last resort
  rather than the first.
* **Persistence.** The DB is the source of truth (§4.2). Findings are written the moment
  they have an identity, proofs the moment they have a verdict, and the review payload
  whether or not GitHub accepted it (E17) — so `/result` can carry the demo even when the
  token cannot write.

Layering (§4.3): this module imports `db` and `core`, never `api`. The nine stage keys below
are the strings `api/routes_reviews.PIPELINE_STAGES` maps to `stage_index`; they are written
out here rather than imported, and an unrecognised one degrades to `stage_index: null`
rather than failing a request.
"""

from __future__ import annotations

import ast
import asyncio
import contextlib
import logging
import re
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Final, cast

import httpx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.core import audit, fingerprint, sanitize, severity, suppression
from prguard.core.context import (
    ContextSelection,
    build_context,
    classify,
    path_sensitivity,
)
from prguard.core.coordinator import coordinate
from prguard.core.delivery.gate import GateDecision, decide, deliver_gate
from prguard.core.delivery.github_client import GitHubClient, GitHubError
from prguard.core.delivery.review_poster import (
    DEGRADATION_COMMENTS_UNREADABLE,
    ExistingComment,
    ReviewDelivery,
    fingerprint_of_comment,
    plan_comment_reuse,
    post_review,
    updated_finding_ids,
)
from prguard.core.ingest import IngestError, PullRequestSnapshot, fetch_file_bodies, ingest
from prguard.core.proof.deps import DependencyInstaller, UvInstaller
from prguard.core.proof.generator import (
    ProofGenerationError,
    ProofPromptContext,
    generate_repro,
)
from prguard.core.proof.runner import (
    DEGRADATION_NO_SANDBOX,
    DEGRADATION_SANDBOX_DEGRADED,
    ProofPolicy,
    SandboxSelection,
    apply_outcome,
    artifact_columns,
    blocking_band_reached,
    errored_outcome,
    run_proof,
    select_runner,
    skipped_outcome,
)
from prguard.core.proof.selector import select_candidates
from prguard.core.proof.workspace import (
    GitHubTarballSource,
    WorkspaceSource,
    materialise,
)
from prguard.core.queue import is_cancelled, supersede_older_runs
from prguard.core.specialists.base import ReviewTask, run_specialists
from prguard.core.specialists.registry import specialists_for
from prguard.core.types import (
    Band,
    CanonicalFinding,
    LineMap,
    ProofOutcome,
    ProofRequest,
    RiskTier,
    SeverityInputs,
    SeverityResult,
    SpecialistOutput,
    SuppressionRule,
)
from prguard.db import models
from prguard.db.base import new_uuid, utcnow
from prguard.llm.circuit import FailbackClient
from prguard.llm.client import LLMClient, build_client

logger = logging.getLogger(__name__)

#: Spec §4.1's nine stages, in order. `api/routes_reviews.PIPELINE_STAGES` holds the same
#: nine strings; `core` may not import `api`, so they are written twice and a mismatch shows
#: up as `stage_index: null` rather than as a 500.
PIPELINE_STAGES: Final[tuple[str, ...]] = (
    "ingest",
    "context",
    "specialists",
    "coordinator",
    "severity",
    "identity",
    "proof",
    "delivery",
    "finalise",
)

#: `review_runs.error_code` for the fatal failures this module owns (§8.1, §6.0).
ERROR_LLM_UNAVAILABLE: Final[str] = "LLM_UNAVAILABLE"
ERROR_GITHUB_UNAVAILABLE: Final[str] = "GITHUB_UNAVAILABLE"
ERROR_INTERNAL: Final[str] = "INTERNAL_ERROR"

#: Spec §4.2: "workers update stage, stage_started_at, heartbeat_at at least every 30 s".
#: Stage boundaries beat too; this covers a stage that outlives one.
HEARTBEAT_INTERVAL_SECONDS: Final[float] = 30.0

#: How long the run waits for a beat in flight before cancelling it, `[ASSUMED]`.
HEARTBEAT_SHUTDOWN_GRACE_SECONDS: Final[float] = 5.0

#: A shallow tarball of a real repository is megabytes, not kilobytes — the REST client's
#: 30 s is the wrong budget for it, `[ASSUMED]`.
WORKSPACE_TIMEOUT_SECONDS: Final[float] = 120.0

#: E23's degradation for a repro the generator could not write. Advisory, never fatal (§8.1).
DEGRADATION_PROOF_NOT_GENERATED: Final[str] = "proof_not_generated"

#: §5.1 `proof_artifacts.outcome` for a proof the environment could not execute (E14).
PROOF_OUTCOME_SKIPPED_NO_ENV: Final[str] = "skipped_no_env"

#: **Documented amendment to §4.7** (spec §11.2 assumption 26 — read it before widening this).
#:
#: §4.7 says "``neutral`` if the run degraded or all proofs were skipped for environment
#: reasons". Taken literally that makes *every* run on a machine without Docker neutral,
#: because §4.6's subprocess fallback always records ``sandbox_degraded`` — which is the
#: configuration §11.2 assumption 8 designs for and X7 says the demo runs on. §8.1's Docker
#: row is the more specific rule and disagrees: falling back to the subprocess runner is the
#: defined *working* behaviour, and it reserves ``neutral`` for the case where the fallback is
#: disallowed and "nothing could be proven". These two degradations are exempted from
#: "the run degraded" on that reading, and on nothing else:
#:
#: * ``sandbox_degraded`` — the subprocess runner really ran, really compared base to head,
#:   and a proof it produced is as real as Docker's. ``isolation=degraded`` is on every
#:   artifact and ``sandbox_degraded`` is on the run, so the weaker evidence is disclosed
#:   rather than hidden.
#: * ``proof_skipped_no_env`` — not dropped, *re-routed*. It is the one condition §8.1 gives
#:   its own gate input for, and the conclusion is identical either way (``neutral``); only
#:   the published reason differs, and §8.1 names which one it has to be. Counting it twice
#:   would replace "no sandbox available — nothing could be proven" with the generic degraded
#:   sentence, which is the reason the spec separated the inputs in the first place.
#:
#: The narrowing is bounded in both directions, and
#: ``test_t9_review_findings.py::test_f4b_the_exemption_cannot_hide_a_run_that_proved_nothing``
#: is the pin: it can never turn a gate **red** into anything else (``failure`` outranks both),
#: and it can never reach ``success`` on a run that executed nothing, because
#: ``all_proofs_skipped_for_env`` forces ``neutral`` independently and is True whenever the
#: sandbox was unavailable.
GATE_DEGRADATION_EXEMPT: Final[frozenset[str]] = frozenset(
    {DEGRADATION_SANDBOX_DEGRADED, DEGRADATION_NO_SANDBOX}
)

#: How the untrusted head bodies are labelled inside the fenced `file_bodies` block (E15).
_FILE_BLOCK = "### {path}\n```{language}\n{body}\n```"

#: Lines of context either side of a finding when the enclosing function cannot be parsed.
_FALLBACK_WINDOW: Final[int] = 20

_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")

#: §4.4 reachability: what makes a symbol reachable from outside its own module.
_ENTRYPOINT_MARKERS: Final[tuple[str, ...]] = (
    "@app.",
    "@router.",
    "@blueprint.",
    "@click.",
    "@celery.",
    'if __name__ == "__main__"',
    "if __name__ == '__main__'",
)


#: One stage of the machine: it mutates the run state and either returns or raises.
_StageHandler = Callable[[AsyncSession, "RunState"], Awaitable[None]]


class FatalStage(Exception):
    """A stage that cannot continue — the run ends `failed` with this `error_code` (§8.1)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PipelineDeps:
    """Every edge that leaves this process, injectable so VERIFY can run with the world off.

    All optional: :func:`build_deps` resolves each from `Settings`, and a test hands over the
    fake it wants. `sandbox` overrides :func:`select_runner` entirely, which is what lets the
    integration suite run real repros through the subprocess runner with the Docker daemon
    stopped (X7).

    `workspace_source` is fixed; `workspace_factory` is per pull request, because a tarball
    source is bound to one repository and the app serves many.
    """

    llm_client: LLMClient | None = None
    github_client: GitHubClient | None = None
    workspace_source: WorkspaceSource | None = None
    workspace_factory: Callable[[PullRequestSnapshot], WorkspaceSource] | None = None
    sandbox: SandboxSelection | None = None
    installer: DependencyInstaller | None = None
    #: Owned by the app's lifespan; `None` when every client was injected by a caller.
    http_client: httpx.AsyncClient | None = None

    def source_for(self, snapshot: PullRequestSnapshot) -> WorkspaceSource | None:
        if self.workspace_source is not None:
            return self.workspace_source
        return self.workspace_factory(snapshot) if self.workspace_factory is not None else None

    async def aclose(self) -> None:
        """Release the sockets this process owns. Called once, by the lifespan."""
        if self.github_client is not None:
            await self.github_client.aclose()
        if self.http_client is not None:
            await self.http_client.aclose()


def build_deps(settings: Settings) -> PipelineDeps:
    """The production wiring: every §4.8 key resolved into the client that uses it.

    The tarball client is separate from :class:`GitHubClient` on purpose — one speaks the
    REST API with its retry policy, the other streams a 30 MB archive, and giving them one
    timeout would be wrong for both.
    """
    http_client = httpx.AsyncClient(
        timeout=WORKSPACE_TIMEOUT_SECONDS,
        headers=(
            {"authorization": f"Bearer {settings.GITHUB_TOKEN}"}
            if settings.GITHUB_TOKEN
            else {}
        ),
    )

    def workspace_for(snapshot: PullRequestSnapshot) -> WorkspaceSource:
        return GitHubTarballSource(
            client=http_client,
            owner=snapshot.owner,
            repo=snapshot.name,
            api_base=settings.GITHUB_API_BASE,
        )

    return PipelineDeps(
        llm_client=build_client(
            provider=settings.LLM_PROVIDER, api_key=settings.llm_api_key
        ),
        github_client=GitHubClient(
            token=settings.GITHUB_TOKEN, base_url=settings.GITHUB_API_BASE
        ),
        workspace_factory=workspace_for,
        installer=UvInstaller(timeout_seconds=settings.DEP_INSTALL_TIMEOUT),
        http_client=http_client,
    )


@dataclass
class RunState:
    """Everything one run accumulates as it moves down the nine stages."""

    run: models.ReviewRun
    pull_request: models.PullRequest
    repository: models.Repository
    snapshot: PullRequestSnapshot | None = None
    selection: ContextSelection | None = None
    sources: dict[str, str] = field(default_factory=dict)
    line_maps: dict[str, LineMap] = field(default_factory=dict)
    task: ReviewTask | None = None
    outputs: tuple[SpecialistOutput, ...] = ()
    findings: list[CanonicalFinding] = field(default_factory=list)
    rows: dict[str, models.Finding] = field(default_factory=dict)
    outcomes: dict[str, ProofOutcome] = field(default_factory=dict)
    delivery: ReviewDelivery | None = None
    gate: GateDecision | None = None
    degradations: list[str] = field(default_factory=list)
    break_glass: list[tuple[CanonicalFinding, SuppressionRule]] = field(default_factory=list)
    all_proofs_skipped_for_env: bool = False
    stage_started: float = 0.0

    @property
    def tenant_id(self) -> str:
        return self.run.tenant_id

    @property
    def risk_tier(self) -> RiskTier:
        return self.selection.risk_tier if self.selection is not None else "standard"

    def degrade(self, *keys: str) -> None:
        """Record a degradation once. `degradations[]` is a set the API renders as a list."""
        for key in keys:
            if key and key not in self.degradations:
                self.degradations.append(key)

    def published(self) -> list[CanonicalFinding]:
        return [finding for finding in self.findings if finding.status == "published"]


class Pipeline:
    """The §4.1 stage machine. One instance per app; :meth:`run` is the `JobQueue` handler."""

    def __init__(
        self,
        *,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        deps: PipelineDeps | None = None,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.deps = deps or PipelineDeps()
        self._failback: LLMClient | None = None
        self._stages: tuple[tuple[str, _StageHandler], ...] = (
            ("ingest", self._stage_ingest),
            ("context", self._stage_context),
            ("specialists", self._stage_specialists),
            ("coordinator", self._stage_coordinator),
            ("severity", self._stage_severity),
            ("identity", self._stage_identity),
            ("proof", self._stage_proof),
            ("delivery", self._stage_delivery),
            ("finalise", self._stage_finalise),
        )

    # -----------------------------------------------------------------------------------
    # Entry point
    # -----------------------------------------------------------------------------------
    async def run(self, review_run_id: str) -> None:
        """Execute one run. **Never raises** — §8.1, AC-23b: no exception escapes a worker."""
        try:
            async with self.session_factory() as session:
                await self._execute(session, review_run_id)
        except asyncio.CancelledError:
            # Shutdown or a superseded run: ours to propagate, never ours to swallow. The
            # row stays `running` and the reaper recovers it (E22).
            raise
        except Exception:
            logger.exception("review run %s ended abnormally", review_run_id)

    async def _execute(self, session: AsyncSession, review_run_id: str) -> None:
        run = await session.get(models.ReviewRun, review_run_id)
        if run is None:
            logger.warning("review run %s is not in the database; dropping it", review_run_id)
            return
        if run.status != models.RunStatus.QUEUED.value:
            # The DB is the source of truth: a run cancelled between enqueue and claim (E3),
            # or one a second worker already finished, is not ours to execute.
            logger.info("review run %s is %s, not queued; skipping", run.id, run.status)
            return

        pull_request = await session.get(models.PullRequest, run.pull_request_id)
        repository = (
            await session.get(models.Repository, pull_request.repository_id)
            if pull_request is not None
            else None
        )
        if pull_request is None or repository is None:  # pragma: no cover - FKs prevent this
            logger.error("review run %s has no pull request row", run.id)
            return

        state = RunState(run=run, pull_request=pull_request, repository=repository)
        await self._start(session, state)
        stop = asyncio.Event()
        heartbeat = asyncio.create_task(
            self._beat(run.id, stop), name=f"prguard-heartbeat-{run.id}"
        )
        try:
            await self._walk(session, state)
        finally:
            # Asked to stop, then waited for, then cancelled. A heartbeat killed mid-write
            # leaves a transaction half-open on the connection the next stage needs.
            stop.set()
            await asyncio.wait({heartbeat}, timeout=HEARTBEAT_SHUTDOWN_GRACE_SECONDS)
            heartbeat.cancel()
            await asyncio.gather(heartbeat, return_exceptions=True)

    async def _walk(self, session: AsyncSession, state: RunState) -> None:
        for index, (name, handler) in enumerate(self._stages, start=1):
            if await is_cancelled(session, state.run.id):
                # E3: a newer head SHA won while we were thinking. Stop here; the row already
                # says `cancelled`/`SUPERSEDED` and the newer run is doing this work.
                logger.info("review run %s was cancelled before stage %s", state.run.id, name)
                return
            await self._begin_stage(session, state, name)
            try:
                await handler(session, state)
            except asyncio.CancelledError:
                raise
            except FatalStage as fatal:
                await self._fail(session, state, fatal.code, fatal.message)
                return
            except Exception as error:
                logger.exception("stage %s of run %s raised", name, state.run.id)
                await self._fail(
                    session, state, ERROR_INTERNAL, f"{type(error).__name__}: {error}"
                )
                return
            await self._complete_stage(session, state, name, index)
        # AC-21: the run's own record is appended after the nine stage events, in the order
        # §4.1 S9 ("emit audit events") and AC-21 prescribe.
        await self._emit_run_record(session, state)

    # -----------------------------------------------------------------------------------
    # Stage bookkeeping (§4.1 "each stage writes its result … before starting the next")
    # -----------------------------------------------------------------------------------
    async def _start(self, session: AsyncSession, state: RunState) -> None:
        now = utcnow()
        run = state.run
        run.status = models.RunStatus.RUNNING.value
        run.started_at = now
        run.stage = PIPELINE_STAGES[0]
        run.stage_started_at = now
        run.heartbeat_at = now
        run.model_config_snapshot = self._snapshot(run, models_used=True)
        await audit.append(
            session,
            tenant_id=state.tenant_id,
            event_type=models.AuditEventType.REVIEW_STARTED,
            actor_type=models.ActorType.SYSTEM,
            actor_id="pipeline",
            review_run_id=run.id,
            payload={"trigger": run.trigger, "stage_total": len(PIPELINE_STAGES)},
        )

    async def _begin_stage(self, session: AsyncSession, state: RunState, name: str) -> None:
        now = utcnow()
        state.stage_started = time.monotonic()
        state.run.stage = name
        state.run.stage_started_at = now
        state.run.heartbeat_at = now
        state.run.degradations = list(state.degradations)
        await session.commit()

    async def _complete_stage(
        self, session: AsyncSession, state: RunState, name: str, index: int
    ) -> None:
        state.run.heartbeat_at = utcnow()
        state.run.degradations = list(state.degradations)
        await audit.append(
            session,
            tenant_id=state.tenant_id,
            event_type=models.AuditEventType.REVIEW_STAGE_COMPLETED,
            actor_type=models.ActorType.SYSTEM,
            actor_id="pipeline",
            review_run_id=state.run.id,
            payload={
                "stage": name,
                "stage_index": index,
                "stage_total": len(PIPELINE_STAGES),
                "duration_ms": int((time.monotonic() - state.stage_started) * 1000),
                "degradations": list(state.degradations),
            },
        )

    async def _fail(
        self, session: AsyncSession, state: RunState, code: str, message: str
    ) -> None:
        """End the run `failed`, on the record. Nothing is posted to GitHub (§8.1)."""
        run = state.run
        run.status = models.RunStatus.FAILED.value
        run.error_code = code
        run.error_message = message
        run.finished_at = utcnow()
        run.degradations = list(state.degradations)
        await audit.append(
            session,
            tenant_id=state.tenant_id,
            event_type=models.AuditEventType.REVIEW_FAILED,
            actor_type=models.ActorType.SYSTEM,
            actor_id="pipeline",
            review_run_id=run.id,
            payload={"error_code": code, "message": message, "stage": run.stage},
        )
        logger.warning("review run %s failed at %s: %s (%s)", run.id, run.stage, message, code)

    async def _beat(self, review_run_id: str, stop: asyncio.Event) -> None:
        """Keep `heartbeat_at` fresh inside a stage that outlives the interval (§4.2).

        Its own session: the pipeline's is mid-transaction for most of a stage, and a
        heartbeat that has to wait for the stage it is reporting on is not a heartbeat.
        """
        while not stop.is_set():
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=HEARTBEAT_INTERVAL_SECONDS)
            if stop.is_set():
                return
            try:
                async with self.session_factory() as session:
                    await session.execute(
                        sa.update(models.ReviewRun)
                        .where(models.ReviewRun.id == review_run_id)
                        .values(heartbeat_at=utcnow())
                    )
                    await session.commit()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("heartbeat for run %s failed", review_run_id)

    # -----------------------------------------------------------------------------------
    # S1 — ingest (fatal, §8.1)
    # -----------------------------------------------------------------------------------
    async def _stage_ingest(self, session: AsyncSession, state: RunState) -> None:
        client = self.deps.github_client
        if client is None:
            raise FatalStage(
                ERROR_GITHUB_UNAVAILABLE,
                "No GitHub client is configured, so the diff could not be read.",
            )
        try:
            snapshot = await ingest(
                client,
                owner=state.repository.owner,
                repo=state.repository.name,
                number=state.pull_request.number,
            )
        except IngestError as error:
            raise FatalStage(error.code, error.message) from error

        state.snapshot = snapshot
        run, pull_request = state.run, state.pull_request
        run.head_sha = snapshot.head_sha
        run.base_sha = snapshot.base_sha
        pull_request.head_sha = snapshot.head_sha
        pull_request.base_sha = snapshot.base_sha
        pull_request.head_ref = snapshot.head_ref or pull_request.head_ref
        pull_request.base_ref = snapshot.base_ref or pull_request.base_ref
        pull_request.title = snapshot.title or pull_request.title
        pull_request.author_login = snapshot.author_login or pull_request.author_login
        pull_request.state = snapshot.state or pull_request.state
        pull_request.url = snapshot.url or pull_request.url
        pull_request.is_draft = snapshot.is_draft
        pull_request.updated_at = utcnow()
        if snapshot.default_branch and not state.repository.default_branch:
            state.repository.default_branch = snapshot.default_branch
        if snapshot.external_repo_id and not state.repository.external_repo_id:
            state.repository.external_repo_id = snapshot.external_repo_id

        # §4.2's supersede rule, applied where the head SHA is first known. The API door
        # cannot do this: it returns 202 before anything is resolved (AC-1).
        superseded = await supersede_older_runs(
            session,
            pull_request_id=pull_request.id,
            head_sha=snapshot.head_sha,
            keep_run_id=run.id,
        )
        if superseded:
            logger.info("run %s superseded %d older run(s)", run.id, len(superseded))

    # -----------------------------------------------------------------------------------
    # S2 — context (degrading, §8.1)
    # -----------------------------------------------------------------------------------
    async def _stage_context(self, session: AsyncSession, state: RunState) -> None:
        snapshot = self._require_snapshot(state)
        selection = build_context(
            snapshot.files,
            token_budget=self.settings.CONTEXT_TOKEN_BUDGET,
            max_files=self.settings.MAX_FILES,
        )
        state.selection = selection
        state.degrade(*selection.degradations)
        state.line_maps = {supplied.path: supplied.line_map for supplied in selection.files}

        # §4.1 S2: "fetch referenced files on demand". Without the head body a fingerprint
        # degrades to a line bucket (§4.5) and reachability is unknowable (E28), so this is
        # worth an HTTP call per reviewed file — and a failure only costs that file (§8.1).
        fetched = await fetch_file_bodies(
            self.deps.github_client,
            owner=snapshot.owner,
            repo=snapshot.name,
            paths=[supplied.path for supplied in selection.files],
            ref=snapshot.head_sha,
        )
        state.sources = dict(fetched.contents)
        state.degrade(*fetched.degradations)

        run = state.run
        run.risk_tier = selection.risk_tier
        run.context_truncated = selection.truncated
        run.model_config_snapshot = {
            **self._snapshot(run),
            "context": {
                "files_changed": selection.files_changed,
                "files_reviewed": selection.files_reviewed,
                "files_excluded": selection.files_excluded,
                "excluded_reasons": dict(selection.excluded_reasons),
                "unfetchable": dict(fetched.failures),
            },
        }

    # -----------------------------------------------------------------------------------
    # S3 — specialists (degrading per reviewer, fatal only if all fail: §8.1)
    # -----------------------------------------------------------------------------------
    async def _stage_specialists(self, session: AsyncSession, state: RunState) -> None:
        snapshot = self._require_snapshot(state)
        selection = self._require_selection(state)
        # E15: `ReviewTask` sanitises every untrusted field on construction — the filenames and
        # the truncation banner included, because `context_header` renders those into the
        # trusted preamble, outside every fence. Cleaning them here instead would put the
        # contract back in a caller, which is precisely how `supplied_files` was missed.
        task = ReviewTask(
            repository=snapshot.slug,
            pull_request_number=snapshot.number,
            title=snapshot.title,
            description=snapshot.description,
            risk_tier=selection.risk_tier,
            supplied_files=selection.supplied_paths,
            diff=snapshot.diff,
            file_context=self._file_bodies(state),
            truncation_note=selection.banner() or "",
        )
        state.task = task

        result = await run_specialists(
            specialists_for(selection.risk_tier),
            client=self.llm,
            task=task,
            model=self.settings.MODEL_SPECIALIST,
            max_tokens=self.settings.LLM_MAX_OUTPUT_TOKENS,
            temperature=self.settings.LLM_TEMPERATURE,
        )
        state.degrade(*result.degradations)
        if result.all_failed:
            # §8.1: "all specialists fail ⇒ run failed, LLM_UNAVAILABLE, no GitHub post, gate
            # untouched". A missing gate is safer than a wrong green.
            detail = "; ".join(
                f"{failure.specialist}: {failure.reason}" for failure in result.failures
            )
            raise FatalStage(ERROR_LLM_UNAVAILABLE, f"Every specialist failed: {detail}")
        state.outputs = result.outputs

    # -----------------------------------------------------------------------------------
    # S4 — coordinator (degrades to a deterministic merge, §8.1)
    # -----------------------------------------------------------------------------------
    async def _stage_coordinator(self, session: AsyncSession, state: RunState) -> None:
        task = state.task
        if task is None:  # pragma: no cover - S3 always sets it or raises
            raise FatalStage(ERROR_INTERNAL, "the coordinator ran without a review task")
        result = await coordinate(
            self.llm,
            outputs=state.outputs,
            task=task,
            tenant_id=state.tenant_id,
            repository_id=state.repository.id,
            model=self.settings.MODEL_COORDINATOR,
            max_tokens=self.settings.LLM_MAX_OUTPUT_TOKENS,
            temperature=self.settings.LLM_TEMPERATURE,
        )
        state.findings = list(result.findings)
        for finding in state.findings:
            finding.review_run_id = state.run.id
        state.degrade(*result.degradations)
        state.run.model_config_snapshot = {
            **self._snapshot(state.run),
            "dropped": result.dropped_payload(),
            "coordinator_notes": result.notes,
        }

    # -----------------------------------------------------------------------------------
    # S5 — severity (deterministic, §4.4)
    # -----------------------------------------------------------------------------------
    async def _stage_severity(self, session: AsyncSession, state: RunState) -> None:
        for finding in state.findings:
            finding.severity = self._score(state, finding)

    def _score(self, state: RunState, finding: CanonicalFinding) -> SeverityResult:
        """Derive §4.4's six inputs from what the run actually measured, then score them."""
        source = state.sources.get(finding.file_path)
        symbol = _symbol_name(finding)
        callers = _reference_count(symbol, state.sources, exclude=finding.file_path)
        derived = severity.derive_inputs(
            public_entrypoint=_is_entrypoint(symbol, source, callers=callers),
            internal_callers=callers,
            path_sensitivity=path_sensitivity(finding.file_path),
            symbol_is_tested=_tested(symbol, state.sources),
            file_is_tested=_tested(_module_name(finding.file_path), state.sources),
            # §4.4/X3: the commits API is not on this client, so churn is unavailable and
            # says so rather than being guessed at.
            commits_last_90d=None,
            proof_status=finding.proof_status,
            symbols_available=source is not None,
        )
        return self._compute(derived.inputs, notes=derived.notes)

    def _compute(
        self, inputs: SeverityInputs, *, notes: Sequence[str] = ()
    ) -> SeverityResult:
        return severity.compute(
            inputs,
            weights=self.settings.SEVERITY_WEIGHTS,
            thresholds=cast(Mapping[Band, float], self.settings.SEVERITY_BANDS),
            notes=notes,
        )

    # -----------------------------------------------------------------------------------
    # S6 — identity: fingerprint, ledger, persistence (§4.5, §6.6, E3, E29)
    # -----------------------------------------------------------------------------------
    async def _stage_identity(self, session: AsyncSession, state: RunState) -> None:
        previous = await self._previous_fingerprints(session, state)
        rules = await self._suppression_rules(session, state)
        now = utcnow()

        for finding in state.findings:
            identity = fingerprint.compute(
                category=finding.category,
                rule_key=finding.rule_key,
                file_path=finding.file_path,
                line=finding.start_line,
                source=state.sources.get(finding.file_path),
            )
            finding.fingerprint = identity.value
            finding.symbol_path = identity.symbol_path
            row = await self._link_fingerprint(session, state, finding, identity)
            matched = next(
                (
                    rule
                    for rule in rules
                    if suppression.matches(finding=finding, rule=rule, now=now)
                ),
                None,
            )
            if matched is not None:
                finding.status = "suppressed"
                finding.suppression_id = matched.id
                if self._was_blocking_eligible(finding):
                    # E29: the human overruled a finding that could have blocked. That is
                    # allowed, and it is instrumented — §5.4's escape hatch, on the record.
                    state.break_glass.append((finding, matched))
            state.rows[finding.id] = self._persist_finding(session, state, finding, row)

        await self._record_addressed(session, state, previous)
        await session.commit()

    async def _link_fingerprint(
        self,
        session: AsyncSession,
        state: RunState,
        finding: CanonicalFinding,
        identity: fingerprint.Fingerprint,
    ) -> models.FindingFingerprint:
        """Upsert the per-repo identity row and count this occurrence (§4.5)."""
        statement = sa.select(models.FindingFingerprint).where(
            models.FindingFingerprint.tenant_id == state.tenant_id,
            models.FindingFingerprint.repository_id == state.repository.id,
            models.FindingFingerprint.fingerprint == identity.value,
        )
        row = (await session.execute(statement)).scalars().first()
        if row is None:
            row = models.FindingFingerprint(
                id=new_uuid(),
                tenant_id=state.tenant_id,
                repository_id=state.repository.id,
                fingerprint=identity.value,
                category=finding.category,
                rule_key=finding.rule_key,
                symbol_path=identity.symbol_path,
                shape_hash=identity.shape_hash,
                first_seen_run_id=state.run.id,
                last_seen_run_id=state.run.id,
                occurrence_count=1,
                addressed_count=0,
                dismissed_count=0,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            session.add(row)
            await session.flush()
            return row
        row.occurrence_count += 1
        row.last_seen_run_id = state.run.id
        row.symbol_path = identity.symbol_path
        row.shape_hash = identity.shape_hash
        row.updated_at = utcnow()
        return row

    def _persist_finding(
        self,
        session: AsyncSession,
        state: RunState,
        finding: CanonicalFinding,
        identity: models.FindingFingerprint,
    ) -> models.Finding:
        row = models.Finding(
            id=finding.id,
            tenant_id=state.tenant_id,
            review_run_id=state.run.id,
            fingerprint_id=identity.id,
            specialist=finding.specialist,
            category=finding.category,
            rule_key=finding.rule_key,
            title=finding.title,
            body_markdown=finding.body_markdown,
            file_path=finding.file_path,
            start_line=finding.start_line,
            end_line=finding.end_line,
            side=finding.side,
            language=finding.language,
            llm_severity_hint=finding.llm_severity_hint,
            confidence=finding.confidence,
            created_at=utcnow(),
        )
        session.add(row)
        self._write_finding(row, finding)
        return row

    def _write_finding(self, row: models.Finding, finding: CanonicalFinding) -> None:
        """Copy the mutable half of a canonical finding onto its row (§5.1).

        `blocking` is re-derived rather than copied. It is the same answer — the four facts
        it depends on are right here — but it keeps `severity.is_blocking` the only thing in
        the codebase that can put a `true` in that column (§4.4).
        """
        row.status = finding.status
        row.proof_status = finding.proof_status
        row.blocking = severity.is_blocking(
            proof_status=finding.proof_status,
            band=finding.severity.band if finding.severity is not None else "info",
            language=finding.language,
            status=finding.status,
            block_min_severity=self.settings.BLOCK_MIN_SEVERITY,
        )
        row.delivery_mode = finding.delivery_mode
        row.delivered_line = finding.delivered_line
        row.github_comment_id = finding.github_comment_id
        row.suppression_id = finding.suppression_id
        if finding.severity is not None:
            row.severity_band = finding.severity.band
            row.severity_score = finding.severity.score
            row.severity_inputs = {
                **dict(finding.severity.inputs.as_mapping()),
                "churn_available": finding.severity.inputs.churn_available,
                "weights": dict(finding.severity.weights),
                "explanation": finding.severity.explanation,
                "notes": list(finding.severity.notes),
            }

    async def _suppression_rules(
        self, session: AsyncSession, state: RunState
    ) -> tuple[SuppressionRule, ...]:
        """The ledger rows that could bear on this repository, as domain objects (§6.6).

        Revoked and expired rows are loaded too: `suppression.matches` decides, and it is the
        one place those guards live (AC-9). The preload only ever *widens* what that function
        is offered — a predicate here that narrows more than the matcher does silently deletes
        a scope, which is what happened to `tenant`: every row carries the repository it was
        written from, so filtering on it alone hid every tenant-wide rule the moment the human
        moved to a second repository.
        """
        statement = (
            sa.select(models.Suppression, models.FindingFingerprint.fingerprint)
            .outerjoin(
                models.FindingFingerprint,
                models.Suppression.fingerprint_id == models.FindingFingerprint.id,
            )
            .where(
                models.Suppression.tenant_id == state.tenant_id,
                sa.or_(
                    models.Suppression.repository_id.is_(None),
                    models.Suppression.repository_id == state.repository.id,
                    models.Suppression.scope == models.SuppressionScope.TENANT.value,
                ),
            )
        )
        return tuple(
            SuppressionRule(
                id=row.id,
                tenant_id=row.tenant_id,
                scope=cast(Any, row.scope),
                reason=row.reason,
                created_by=row.created_by or "",
                source=cast(Any, row.source),
                repository_id=row.repository_id,
                fingerprint=value,
                match_path=row.match_path,
                match_rule_key=row.match_rule_key,
                expires_at=row.expires_at,
                revoked_at=row.revoked_at,
                created_at=row.created_at,
            )
            for row, value in (await session.execute(statement)).all()
        )

    def _was_blocking_eligible(self, finding: CanonicalFinding) -> bool:
        """E29's "blocking-eligible": Python, and severe enough to have blocked (§4.4)."""
        return (
            finding.language.strip().lower() == "python"
            and finding.severity is not None
            and blocking_band_reached(
                finding.severity.band, block_min_severity=self.settings.BLOCK_MIN_SEVERITY
            )
        )

    async def _previous_fingerprints(
        self, session: AsyncSession, state: RunState
    ) -> dict[str, models.Finding]:
        """What the last finished run on this PR reported, keyed by fingerprint (E3)."""
        previous_run = (
            await session.execute(
                sa.select(models.ReviewRun.id)
                .where(
                    models.ReviewRun.pull_request_id == state.pull_request.id,
                    models.ReviewRun.id != state.run.id,
                    models.ReviewRun.status == models.RunStatus.SUCCEEDED.value,
                )
                .order_by(models.ReviewRun.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if previous_run is None:
            return {}
        statement = (
            sa.select(models.Finding, models.FindingFingerprint.fingerprint)
            .join(
                models.FindingFingerprint,
                models.Finding.fingerprint_id == models.FindingFingerprint.id,
            )
            .where(models.Finding.review_run_id == previous_run)
        )
        return {
            value: row for row, value in (await session.execute(statement)).all() if value
        }

    async def _record_addressed(
        self, session: AsyncSession, state: RunState, previous: Mapping[str, models.Finding]
    ) -> None:
        """E3: a fingerprint that was reported last run and is gone now was addressed."""
        current = {finding.fingerprint for finding in state.findings}
        for value, row in previous.items():
            if value in current:
                continue
            session.add(
                models.FindingOutcome(
                    id=new_uuid(),
                    tenant_id=state.tenant_id,
                    finding_id=row.id,
                    fingerprint_id=row.fingerprint_id,
                    outcome=models.OutcomeKind.ADDRESSED.value,
                    detected_at=utcnow(),
                    evidence={
                        "resolved_in_run": state.run.id,
                        "head_sha": state.run.head_sha,
                        "reason": "the fingerprint was not reported at the new head",
                    },
                )
            )
            if row.fingerprint_id is not None:
                identity = await session.get(models.FindingFingerprint, row.fingerprint_id)
                if identity is not None:
                    identity.addressed_count += 1
                    identity.updated_at = utcnow()

    # -----------------------------------------------------------------------------------
    # S7 — proof. "Degrading on: everything. Proof never fails a run." (§4.1)
    # -----------------------------------------------------------------------------------
    async def _stage_proof(self, session: AsyncSession, state: RunState) -> None:
        policy = ProofPolicy.from_settings(self.settings)
        sandbox = self.deps.sandbox or select_runner(policy)
        state.degrade(*sandbox.degradations)

        candidates = select_candidates(
            state.findings, min_score=policy.min_score, max_per_run=policy.max_per_run
        )
        outcomes: list[ProofOutcome] = []
        for finding in candidates:
            outcome = await self._prove(
                session, state, finding, policy=policy, sandbox=sandbox
            )
            if outcome is None:
                state.degrade(DEGRADATION_PROOF_NOT_GENERATED)
                continue
            outcomes.append(outcome)
            state.outcomes[finding.id] = outcome
            apply_outcome(
                finding,
                outcome,
                block_min_severity=self.settings.BLOCK_MIN_SEVERITY,
                # The proof changed `proof_confidence`, which is one of the six inputs, so
                # the score S5 computed is stale. `severity.compute` is the only thing
                # allowed to replace it (§4.4).
                recompute=self._compute,
            )
            self._write_finding(state.rows[finding.id], finding)

        # §8.1's Docker row gives "nothing could be proven" its own gate input, separate from
        # the degradation list, precisely so it cannot be lost. `runner.skipped_outcome()`
        # records it as `status="not_attempted"`, `outcome="skipped_no_env"` — reading
        # `status` here compared against a value that column never holds for a skip, so the
        # input was dead code and the neutral rung rode on the degradation flag alone, under
        # the wrong reason. `sandbox.available` covers the run that had no sandbox *and* no
        # proof candidate to skip: nothing could be proven there either.
        state.all_proofs_skipped_for_env = not sandbox.available or (
            bool(outcomes)
            and all(outcome.outcome == PROOF_OUTCOME_SKIPPED_NO_ENV for outcome in outcomes)
        )
        await session.commit()

    async def _prove(
        self,
        session: AsyncSession,
        state: RunState,
        finding: CanonicalFinding,
        *,
        policy: ProofPolicy,
        sandbox: SandboxSelection,
    ) -> ProofOutcome | None:
        """Generate one repro, run it at base and head, persist the artifact. Never raises."""
        snapshot = self._require_snapshot(state)
        try:
            request = await generate_repro(
                self.llm,
                finding=finding,
                context=ProofPromptContext(
                    repository=snapshot.slug,
                    enclosing_source=sanitize.sanitize(
                        _enclosing_source(state.sources.get(finding.file_path), finding)
                    ),
                    file_imports=sanitize.sanitize(
                        _imports_of(state.sources.get(finding.file_path))
                    ),
                    sample_test=sanitize.sanitize(_sample_test(state.sources)),
                ),
                model=self.settings.MODEL_PROOF_GENERATOR,
                max_tokens=self.settings.LLM_MAX_OUTPUT_TOKENS,
                temperature=self.settings.LLM_TEMPERATURE,
                timeout_seconds=policy.timeout_seconds,
                require_baseline=policy.require_baseline,
            )
        except ProofGenerationError as error:
            # §8.1: "proof generator fails ⇒ that finding is not_attempted, advisory".
            logger.info("no repro for finding %s: %s", finding.id, error)
            return None
        except Exception as error:  # noqa: BLE001 - S7 degrades on everything, by design
            logger.exception("the repro generator failed for finding %s", finding.id)
            outcome = errored_outcome(sandbox.runner, f"{type(error).__name__}: {error}")
            return outcome

        source = self.deps.source_for(snapshot)
        if sandbox.runner is None or source is None:
            # E14: no sandbox is not an error. Nothing is claimed, the gate goes neutral.
            outcome = skipped_outcome(reason=sandbox.reason or "no sandbox available")
            self._persist_artifact(session, state, finding, outcome, request)
            return outcome

        workspace = None
        try:
            workspace = await materialise(
                source,
                request=request,
                head_ref=snapshot.head_sha,
                base_ref=snapshot.base_sha if policy.require_baseline else None,
            )
            outcome = await run_proof(
                request=request,
                workspace=workspace,
                runner=sandbox.runner,
                policy=policy,
                installer=self.deps.installer,
                secrets=self._secrets(),
                base_applicable=_base_applicable(state, finding),
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001 - S7 degrades on everything, by design
            logger.exception("the sandbox failed for finding %s", finding.id)
            outcome = errored_outcome(sandbox.runner, f"{type(error).__name__}: {error}")
        finally:
            if workspace is not None:
                workspace.close()

        self._persist_artifact(session, state, finding, outcome, request)
        return outcome

    def _persist_artifact(
        self,
        session: AsyncSession,
        state: RunState,
        finding: CanonicalFinding,
        outcome: ProofOutcome,
        request: ProofRequest,
    ) -> None:
        columns = cast(dict[str, Any], artifact_columns(outcome, request))
        artifact = models.ProofArtifact(
            id=new_uuid(),
            tenant_id=state.tenant_id,
            finding_id=finding.id,
            review_run_id=state.run.id,
            created_at=utcnow(),
            **columns,
        )
        session.add(artifact)

    def _secrets(self) -> tuple[str, ...]:
        """Literal values E26 must never let out of the sandbox into a persisted artifact."""
        return tuple(
            value
            for value in (
                self.settings.GITHUB_TOKEN,
                self.settings.ANTHROPIC_API_KEY,
                self.settings.GITHUB_WEBHOOK_SECRET,
                self.settings.PRGUARD_API_TOKEN,
            )
            if value
        )

    # -----------------------------------------------------------------------------------
    # S8 — delivery + gate (degrading, §8.1, E17/E19)
    # -----------------------------------------------------------------------------------
    async def _stage_delivery(self, session: AsyncSession, state: RunState) -> None:
        snapshot = self._require_snapshot(state)
        selection = self._require_selection(state)
        for finding in state.findings:
            if finding.status == "proposed":
                finding.status = "published"
            finding.blocking = severity.is_blocking(
                proof_status=finding.proof_status,
                band=finding.severity.band if finding.severity is not None else "info",
                language=finding.language,
                status=finding.status,
                block_min_severity=self.settings.BLOCK_MIN_SEVERITY,
            )

        published = state.published()
        existing = await self._existing_comments(state)
        # The same pure plan `post_review` makes internally. It is recomputed rather than
        # returned because the finding→comment mapping is ours to persist (E3) and the
        # delivery result only carries the comment ids it managed to update.
        reuse = plan_comment_reuse(published, existing)
        delivery = await post_review(
            client=self.deps.github_client,
            owner=snapshot.owner,
            repo=snapshot.name,
            pr_number=snapshot.number,
            findings=published,
            line_maps=state.line_maps,
            files_reviewed=selection.files_reviewed,
            commit_id=snapshot.head_sha,
            existing_comments=existing,
            # Deliberately no per-run link in the review body: AC-20 requires the payload to
            # be byte-identical whichever door triggered the run, and a run id in the footer
            # would make that impossible. The evidence link rides on the gate instead, which
            # is where §4.7 puts the verdict anyway.
            result_url=None,
            dry_run=self._dry_run(),
            max_distance=self.settings.NEAREST_LINE_MAX_DISTANCE,
            # E26's other half: no prefix pattern recognises *our* token, and a finding that
            # quotes an env value would publish it to the PR and persist it in review_payload.
            secrets=self._secrets(),
        )
        state.delivery = delivery
        state.degrade(*delivery.degradations)

        updated = set(updated_finding_ids(reuse, list(delivery.updated_comment_ids)))
        for finding in published:
            assignment = delivery.assignments.get(finding.id)
            if assignment is not None:
                finding.delivery_mode = assignment.delivery_mode
                finding.delivered_line = assignment.anchor_line or assignment.line
            if finding.id in updated:
                finding.github_comment_id = reuse.updates[finding.id]
        for finding in state.findings:
            self._write_finding(state.rows[finding.id], finding)

        run = state.run
        run.delivery_status = delivery.status
        run.github_review_id = delivery.github_review_id
        run.review_payload = delivery.payload.as_payload()

        state.gate = await self._set_gate(state)
        run.gate_conclusion = state.gate.conclusion
        run.gate_delivery = state.gate.delivery
        await session.commit()

    async def _set_gate(self, state: RunState) -> GateDecision:
        """Decide the gate, then publish it down §4.7's ladder. E4: always, even if unchanged."""
        snapshot = self._require_snapshot(state)
        decision = decide(
            state.findings,
            degraded=bool(set(state.degradations) - GATE_DEGRADATION_EXEMPT),
            all_proofs_skipped_for_env=state.all_proofs_skipped_for_env,
            block_min_severity=self.settings.BLOCK_MIN_SEVERITY,
            context_name=self.settings.GATE_CONTEXT_NAME,
        )
        return await deliver_gate(
            client=self.deps.github_client,
            owner=snapshot.owner,
            repo=snapshot.name,
            head_sha=snapshot.head_sha,
            decision=decision,
            result_url=f"/v1/reviews/{state.run.id}/result",
            # E18: the Check Runs API rejects a PAT, so rung 1 is only attempted when this
            # deployment actually has an App installation. Skipping it saves a call, not a
            # capability — the ladder still falls through to commit status and dry run.
            allow_check_run=bool(
                self.settings.GITHUB_APP_ID and self.settings.GITHUB_APP_PRIVATE_KEY
            ),
            dry_run=self._dry_run(),
        )

    async def _existing_comments(self, state: RunState) -> tuple[ExistingComment, ...] | None:
        """What an earlier run already said on this PR (E3/AC-7a). Degrading, never fatal.

        ``None`` is "GitHub would not say", which is a different answer from ``()`` — "there is
        nothing there". Returning the empty tuple for both made a failed read invisible: reuse
        became impossible, the re-review posted the same fingerprint as a brand-new comment, and
        `degradations[]` said nothing had happened. §8.1 S8 is explicit that a GitHub failure in
        delivery degrades and is recorded, and `post_review` demotes an unknown comment list to
        the review body rather than risk the duplicate.
        """
        client = self.deps.github_client
        snapshot = self._require_snapshot(state)
        if client is None or self._dry_run():
            return ()
        try:
            comments = await client.list_review_comments(
                snapshot.owner, snapshot.name, snapshot.number
            )
        except GitHubError as error:
            logger.info("could not read existing review comments: %s", error)
            state.degrade(DEGRADATION_COMMENTS_UNREADABLE)
            return None
        return tuple(
            ExistingComment(
                comment_id=int(comment["id"]),
                path=str(comment.get("path", "")),
                fingerprint=fingerprint_of_comment(str(comment.get("body", ""))),
                line=comment.get("line"),
            )
            for comment in comments
            if comment.get("id") is not None
        )

    def _dry_run(self) -> bool:
        """§4.8 `GITHUB_DELIVERY_MODE`: `dry_run` always, `auto` when there is no token."""
        mode = self.settings.GITHUB_DELIVERY_MODE
        if mode == "dry_run":
            return True
        if mode == "post":
            return False
        return not self.settings.GITHUB_TOKEN

    # -----------------------------------------------------------------------------------
    # S9 — finalise: counters, then the run's own record (§4.1, AC-21)
    # -----------------------------------------------------------------------------------
    async def _stage_finalise(self, session: AsyncSession, state: RunState) -> None:
        run = state.run
        findings = state.findings
        run.findings_total = len(findings)
        run.findings_published = sum(1 for f in findings if f.status == "published")
        run.findings_suppressed = sum(1 for f in findings if f.status == "suppressed")
        run.findings_blocking = sum(1 for f in findings if f.blocking)
        run.degradations = list(state.degradations)
        run.status = models.RunStatus.SUCCEEDED.value
        run.finished_at = utcnow()
        await session.commit()

    async def _emit_run_record(self, session: AsyncSession, state: RunState) -> None:
        """Replay the run into the audit chain in AC-21's order, then close it.

        Deliberately after the nine stage events rather than interleaved: §4.1 gives S9 the
        job of "emit audit events", and AC-21 fixes the order a reader can rely on —
        `…stage_completed×9 → finding.proposed* → proof.executed* → finding.published* →
        gate.evaluated → gate.delivered → review.completed`.
        """
        if state.degradations:
            await self._event(
                session,
                state,
                models.AuditEventType.REVIEW_DEGRADED,
                actor_id="pipeline",
                payload={"degradations": list(state.degradations)},
            )

        for finding in state.findings:
            await self._event(
                session,
                state,
                models.AuditEventType.FINDING_PROPOSED,
                actor_type=models.ActorType.AI,
                actor_id=f"specialist:{finding.specialist}:{self.settings.MODEL_SPECIALIST}",
                finding_id=finding.id,
                payload={
                    "rule_key": finding.rule_key,
                    "category": finding.category,
                    "file_path": finding.file_path,
                    "fingerprint": finding.fingerprint,
                    "llm_severity_hint": finding.llm_severity_hint,
                    "severity_band": finding.severity.band if finding.severity else None,
                    "severity_score": finding.severity.score if finding.severity else None,
                },
            )

        for finding in state.findings:
            if finding.status != "suppressed":
                continue
            await self._event(
                session,
                state,
                models.AuditEventType.FINDING_SUPPRESSED,
                finding_id=finding.id,
                payload={
                    "suppression_id": finding.suppression_id,
                    "fingerprint": finding.fingerprint,
                },
            )
        for finding, rule in state.break_glass:
            # E29 / §5.4: a human silenced something that was eligible to block. The
            # decision stands, and the audit trail says who made it and why.
            await self._event(
                session,
                state,
                models.AuditEventType.OVERRIDE_BREAK_GLASS,
                actor_type=models.ActorType.HUMAN,
                actor_id=rule.created_by or "api",
                finding_id=finding.id,
                payload={
                    "suppression_id": rule.id,
                    "reason": rule.reason,
                    "scope": rule.scope,
                    "severity_band": finding.severity.band if finding.severity else None,
                    "proof_status": finding.proof_status,
                },
            )

        for finding in state.findings:
            outcome = state.outcomes.get(finding.id)
            if outcome is None:
                continue
            await self._event(
                session,
                state,
                models.AuditEventType.PROOF_EXECUTED,
                actor_id=f"proof-runner:{outcome.runner}",
                finding_id=finding.id,
                payload={
                    "proof_status": outcome.status,
                    "outcome": outcome.outcome,
                    "isolation": outcome.isolation,
                    "baseline_mode": outcome.baseline_mode,
                    "base_exit_code": outcome.base.exit_code if outcome.base else None,
                    "head_exit_code": outcome.head.exit_code if outcome.head else None,
                },
            )
            if outcome.status == "disproven":
                await self._event(
                    session,
                    state,
                    models.AuditEventType.FINDING_DISPROVEN,
                    finding_id=finding.id,
                    payload={"outcome": outcome.outcome, "clamped_to": "info"},
                )

        for finding in state.published():
            await self._event(
                session,
                state,
                models.AuditEventType.FINDING_PUBLISHED,
                finding_id=finding.id,
                payload={
                    "delivery_mode": finding.delivery_mode,
                    "delivered_line": finding.delivered_line,
                    "github_comment_id": finding.github_comment_id,
                    "blocking": finding.blocking,
                    "proof_status": finding.proof_status,
                },
            )

        gate = state.gate
        if gate is not None:
            await self._event(
                session,
                state,
                models.AuditEventType.GATE_EVALUATED,
                actor_id="gate",
                payload={
                    "conclusion": gate.conclusion,
                    "reason": gate.reason,
                    "blocking_finding_ids": list(gate.blocking_finding_ids),
                },
            )
            await self._event(
                session,
                state,
                models.AuditEventType.GATE_DELIVERED,
                actor_id="gate",
                payload={
                    "delivery": gate.delivery,
                    "delivered": gate.delivered,
                    "context_name": gate.context_name,
                    "detail": gate.detail,
                },
            )

        await self._event(
            session,
            state,
            models.AuditEventType.REVIEW_COMPLETED,
            actor_id="pipeline",
            payload={
                "status": state.run.status,
                "delivery_status": state.run.delivery_status,
                "gate_conclusion": state.run.gate_conclusion,
                "counts": {
                    "total": state.run.findings_total,
                    "published": state.run.findings_published,
                    "suppressed": state.run.findings_suppressed,
                    "blocking": state.run.findings_blocking,
                },
                "degradations": list(state.degradations),
            },
        )

    async def _event(
        self,
        session: AsyncSession,
        state: RunState,
        event_type: models.AuditEventType,
        *,
        actor_type: models.ActorType = models.ActorType.SYSTEM,
        actor_id: str = "pipeline",
        finding_id: str | None = None,
        payload: Mapping[str, Any] | None = None,
    ) -> None:
        await audit.append(
            session,
            tenant_id=state.tenant_id,
            event_type=event_type,
            actor_type=actor_type,
            actor_id=actor_id,
            review_run_id=state.run.id,
            finding_id=finding_id,
            payload=dict(payload or {}),
        )

    # -----------------------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------------------
    @property
    def llm(self) -> LLMClient:
        """The model client, behind the §8.1 circuit breaker and failback chain.

        Wrapped **once** and cached: the breaker counts five failures in sixty seconds, so a
        fresh wrapper per call would be a breaker that never trips. One pipeline serves the
        whole process, which is the scope §8.1 describes.
        """
        if self._failback is None:
            client = self.deps.llm_client
            if client is None:
                raise FatalStage(ERROR_LLM_UNAVAILABLE, "No LLM client is configured.")
            self._failback = (
                client
                if isinstance(client, FailbackClient)
                else FailbackClient(client, chain=self.settings.MODEL_FAILBACK_CHAIN)
            )
        return self._failback

    def _snapshot(self, run: models.ReviewRun, *, models_used: bool = False) -> dict[str, Any]:
        """Merge, never replace: T7 already put `requested_options` in here (§6.1)."""
        snapshot = dict(run.model_config_snapshot or {})
        if models_used:
            snapshot.update(
                {
                    "specialist_model": self.settings.MODEL_SPECIALIST,
                    "coordinator_model": self.settings.MODEL_COORDINATOR,
                    "proof_generator_model": self.settings.MODEL_PROOF_GENERATOR,
                    "temperature": self.settings.LLM_TEMPERATURE,
                    "severity_weights": dict(self.settings.SEVERITY_WEIGHTS),
                    "severity_bands": dict(self.settings.SEVERITY_BANDS),
                    "block_min_severity": self.settings.BLOCK_MIN_SEVERITY,
                }
            )
        return snapshot

    def _file_bodies(self, state: RunState) -> str:
        """The fetched head bodies, labelled per file, for the `file_bodies` fence (E15)."""
        selection = self._require_selection(state)
        blocks = [
            _FILE_BLOCK.format(
                path=supplied.path,
                language=supplied.language,
                body=state.sources[supplied.path],
            )
            for supplied in selection.files
            if supplied.path in state.sources
        ]
        return "\n\n".join(blocks)

    @staticmethod
    def _require_snapshot(state: RunState) -> PullRequestSnapshot:
        if state.snapshot is None:  # pragma: no cover - S1 raises before any later stage
            raise FatalStage(ERROR_INTERNAL, "the pull request was never resolved")
        return state.snapshot

    @staticmethod
    def _require_selection(state: RunState) -> ContextSelection:
        if state.selection is None:  # pragma: no cover - S2 always sets it
            raise FatalStage(ERROR_INTERNAL, "the review context was never built")
        return state.selection


# ---------------------------------------------------------------------------------------
# §4.4 input derivation from what the run measured
# ---------------------------------------------------------------------------------------
def _symbol_name(finding: CanonicalFinding) -> str:
    """The leaf of `pkg/mod.py::Class.func` — the name other files would reference."""
    tail = finding.symbol_path.rsplit("::", 1)[-1]
    leaf = tail.rsplit(".", 1)[-1]
    return leaf if _WORD.fullmatch(leaf) else ""


def _module_name(file_path: str) -> str:
    return file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0]


def _reference_count(symbol: str, sources: Mapping[str, str], *, exclude: str) -> int:
    """§4.4 `blast_radius`: references to the symbol across the other fetched files."""
    if not symbol:
        return 0
    pattern = re.compile(rf"\b{re.escape(symbol)}\b")
    return sum(
        len(pattern.findall(body))
        for path, body in sources.items()
        if path != exclude and classify(path, content=body) != "test"
    )


def _is_entrypoint(symbol: str, source: str | None, *, callers: int) -> bool:
    """§4.4 `reachability` 1.0: reachable from a public entrypoint.

    Three of the spec's four signals are visible in what we fetched: a route/CLI decorator or
    a `__main__` block in the defining file, and a public module-level name that another file
    in context references. A private name (`_helper`) is never an entrypoint whatever calls it.
    """
    if not symbol or symbol.startswith("_"):
        return False
    if source is not None and any(marker in source for marker in _ENTRYPOINT_MARKERS):
        return True
    return callers > 0


def _tested(name: str, sources: Mapping[str, str]) -> bool:
    """§4.4 `coverage_gap`: does any fetched test file mention this name at all?"""
    if not name:
        return False
    pattern = re.compile(rf"\b{re.escape(name)}\b")
    return any(
        pattern.search(body)
        for path, body in sources.items()
        if classify(path, content=body) == "test"
    )


def _base_applicable(state: RunState, finding: CanonicalFinding) -> bool:
    """§4.6 row 1's parenthetical: a file that is new at head never had a baseline."""
    selection = state.selection
    if selection is None:  # pragma: no cover - S2 runs first
        return True
    for supplied in selection.files:
        if supplied.path == finding.file_path:
            return supplied.change_status != "added"
    return True


def _enclosing_source(source: str | None, finding: CanonicalFinding) -> str:
    """The enclosing function at head, for the repro prompt (§4.6). Never raises (E28)."""
    if not source:
        return ""
    lines = source.splitlines()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        tree = None
    if tree is not None:
        best: ast.FunctionDef | ast.AsyncFunctionDef | None = None
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                end = node.end_lineno or node.lineno
                if node.lineno <= finding.start_line <= end:
                    if best is None or node.lineno > best.lineno:
                        best = node
        if best is not None:
            end = best.end_lineno or best.lineno
            return "\n".join(lines[best.lineno - 1 : end])
    start = max(0, finding.start_line - 1 - _FALLBACK_WINDOW)
    return "\n".join(lines[start : finding.end_line + _FALLBACK_WINDOW])


def _imports_of(source: str | None) -> str:
    """Every import line of the file under review, for the repro prompt (§4.6)."""
    if not source:
        return ""
    return "\n".join(
        line
        for line in source.splitlines()
        if line.startswith(("import ", "from ")) or line.lstrip().startswith(("import ", "from "))
    )


def _sample_test(sources: Mapping[str, str]) -> str:
    """One existing test file, for convention (§4.6). Empty when the repo has none (E7)."""
    for path in sorted(sources):
        if classify(path, content=sources[path]) == "test":
            return sources[path]
    return ""


__all__ = [
    "ERROR_GITHUB_UNAVAILABLE",
    "ERROR_INTERNAL",
    "ERROR_LLM_UNAVAILABLE",
    "PIPELINE_STAGES",
    "FatalStage",
    "Pipeline",
    "PipelineDeps",
    "RunState",
    "build_deps",
]
