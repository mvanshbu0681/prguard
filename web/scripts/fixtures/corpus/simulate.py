"""The nine-stage pipeline, re-enacted — every decision made by the backend's own functions.

``core/pipeline.py`` cannot run here (it needs a model, GitHub and a sandbox), so this module
plays the parts that talk to the outside world and hands every *decision* to the code that
makes it in production:

* S2 context, risk tier, line maps — ``context.build_context`` over real unified diffs.
* S4 normalisation — ``coordinator._slug`` / ``language_for`` / ``_symbol_path``.
* S5 severity — ``severity.derive_inputs`` → ``severity.compute`` with the settings' weights.
* S6 identity — ``fingerprint.compute`` over the head source, ``suppression.matches``.
* S7 proof — ``selector.select_candidates``; ``runner.classify_outcome`` over ``RunResult``
  objects carrying pytest's real terminal text; ``runner.apply_outcome`` with
  ``severity.compute`` as the recompute hook.
* S8 delivery — ``comment_ladder.assign_rungs`` / ``demote`` / ``demote_to_summary`` /
  ``assert_conservation``, ``severity.is_blocking``, ``gate.decide``, and ``gate.deliver_gate``
  against a stand-in GitHub client.

What *is* played is only the world: which files a pull request changed, what a specialist
wrote, what pytest printed, how long a stage took, and what a human decided. Those come from
``catalog.py`` and ``demo_story.py``.

Two places deliberately go beyond the implementation at ``eeb1be8``, because the spec defines
behaviour the implementation leaves out and the fixture contract needs it (both are listed in
``gen_fixtures.py``'s report):

* Coordinator drops are persisted as ``findings`` rows with ``status: dropped`` (§5.1, §6.3's
  ``counts.dropped``, §6.9's ``dropped_by_coordinator``) and get a ``finding.proposed`` event.
* ``proof_status`` records ``not_applicable`` for a finding no sandbox can execute (not Python)
  and ``skipped_no_env`` for a candidate a run with no sandbox could not execute (§4.6, §5.1).
"""

from __future__ import annotations

import asyncio
import difflib
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any

from corpus import pytest_text as pt
from corpus import repro, review_body, synth, usage
from corpus.backend import (
    BANDS,
    NOW,
    PUBLIC_BASE_URL,
    SETTINGS,
    TENANT_ID,
    WEIGHTS,
    comment_ladder,
    compute_severity,
    context,
    coordinator,
    core_types,
    fingerprint,
    gate,
    github_client,
    models,
    pipeline,
    registry,
    routes_reviews,
    runner,
    selector,
    severity,
    suppression,
)
from corpus.model import (
    DropTemplate,
    Facts,
    Proof,
    RepoSpec,
    Revoke,
    RunSpec,
    Suppress,
    Template,
    Use,
)
from corpus.rng import hex6, hex32, sha40, stream, uuid4

STAGES = routes_reviews.PIPELINE_STAGES
assert STAGES == pipeline.PIPELINE_STAGES

#: §4.6's test command, exactly as the spec writes it (the runners prefix an interpreter or a
#: ``docker run …`` line; the artifact the API shows carries the command a human would type).
PYTEST_COMMAND = "pytest {path} -q -p no:cacheprovider"

#: The deployment has a GitHub App configured, so the gate ladder always tries a check run.
ALLOW_CHECK_RUN = True

ACTOR_WEBHOOK = "webhook:github"


# =======================================================================================
# World state — transient ORM rows plus what the simulation needs to remember
# =======================================================================================


@dataclass
class PendingEvent:
    """An audit event before the chain gives it a ``seq`` (``chain.py`` does that)."""

    at: datetime
    order: int
    event_type: str
    actor_type: str
    actor_id: str | None
    payload: dict[str, Any]
    review_run_id: str | None = None
    finding_id: str | None = None


@dataclass
class RepoState:
    spec: RepoSpec
    row: models.Repository
    synthesised: dict[str, synth.SourceFile] = field(default_factory=dict)
    specs: dict[str, synth.FileSpec] = field(default_factory=dict)

    def source(self, path: str) -> synth.SourceFile:
        if path not in self.synthesised:
            if path not in self.specs:
                raise KeyError(f"{self.spec.slug} has no file spec for {path}")
            self.synthesised[path] = synth.synthesise(self.specs[path])
        return self.synthesised[path]


@dataclass
class StageLog:
    key: str
    started: datetime
    ended: datetime | None
    duration_ms: int | None


@dataclass
class FindingRecord:
    key: str
    use: Use
    row: models.Finding
    canon: core_types.CanonicalFinding | None
    template: Template | None = None
    drop: DropTemplate | None = None
    identity: models.FindingFingerprint | None = None
    artifact: models.ProofArtifact | None = None
    outcome: core_types.ProofOutcome | None = None
    proof: Proof | None = None
    selection: str | None = None
    assignment: Any = None
    drop_reason: str | None = None
    drop_detail: str = ""
    #: Delivered by updating the comment an earlier run on this PR posted (E3/AC-7a).
    reused: bool = False


@dataclass
class Delivery:
    status: str
    assignments: dict[str, Any]
    breakdown: Any
    degradations: list[str]
    payload: dict[str, Any] | None
    github_review_id: int | None
    posted: bool


@dataclass
class RunRecord:
    spec: RunSpec
    repo: RepoState
    pr: models.PullRequest
    row: models.ReviewRun
    queued_at: datetime
    started_at: datetime
    findings: list[FindingRecord] = field(default_factory=list)
    stages: list[StageLog] = field(default_factory=list)
    selection: Any = None
    sources: dict[str, str] = field(default_factory=dict)
    line_maps: dict[str, core_types.LineMap] = field(default_factory=dict)
    changed: list[context.ChangedFile] = field(default_factory=list)
    delivery: Delivery | None = None
    gate: gate.GateDecision | None = None
    degradations: list[str] = field(default_factory=list)
    cancel_at: datetime | None = None
    superseded_by: str | None = None
    specialists: tuple[str, ...] = ()
    proof_overhead_ms: int = 0
    break_glass: list[tuple[FindingRecord, core_types.SuppressionRule]] = field(default_factory=list)
    all_proofs_skipped_for_env: bool = False
    rng_key: str = ""

    def degrade(self, *keys: str) -> None:
        for key in keys:
            if key and key not in self.degradations:
                self.degradations.append(key)

    @property
    def canonical(self) -> list[FindingRecord]:
        return [record for record in self.findings if record.canon is not None]

    @property
    def published(self) -> list[FindingRecord]:
        return [r for r in self.canonical if r.canon.status == "published"]


@dataclass
class SuppressionRecord:
    spec: Suppress
    row: models.Suppression
    finding: FindingRecord
    run: RunRecord


@dataclass
class World:
    repos: dict[str, RepoState] = field(default_factory=dict)
    prs: dict[tuple[str, int], models.PullRequest] = field(default_factory=dict)
    runs: list[RunRecord] = field(default_factory=list)
    fingerprints: dict[tuple[str, str], models.FindingFingerprint] = field(default_factory=dict)
    suppressions: dict[str, SuppressionRecord] = field(default_factory=dict)
    outcomes: list[models.FindingOutcome] = field(default_factory=list)
    events: list[PendingEvent] = field(default_factory=list)
    comment_ids: dict[tuple[str, str], int] = field(default_factory=dict)
    order: int = 0

    def emit(
        self,
        at: datetime,
        event_type: models.AuditEventType,
        *,
        actor_type: models.ActorType = models.ActorType.SYSTEM,
        actor_id: str | None = "pipeline",
        payload: Mapping[str, Any] | None = None,
        run: RunRecord | None = None,
        finding_id: str | None = None,
        request_id: str | None = None,
    ) -> PendingEvent:
        """``audit.append``'s body, minus the database: same payload rule for ``request_id``."""
        body = dict(payload or {})
        if request_id is not None:
            body["request_id"] = request_id
        self.order += 1
        event = PendingEvent(
            at=at,
            order=self.order,
            event_type=event_type.value,
            actor_type=actor_type.value,
            actor_id=actor_id,
            payload=body,
            review_run_id=run.row.id if run is not None else None,
            finding_id=finding_id,
        )
        self.events.append(event)
        return event

    def run(self, key: str) -> RunRecord:
        for record in self.runs:
            if record.spec.key == key:
                return record
        raise KeyError(key)


# =======================================================================================
# Small helpers
# =======================================================================================


def ms(value: float) -> timedelta:
    return timedelta(milliseconds=value)


def parse_at(value: str, key: str) -> datetime:
    """``2026-09-23T11:46`` gets a seeded sub-minute offset; a value with seconds is exact."""
    moment = datetime.fromisoformat(value).replace(tzinfo=UTC)
    if len(value) <= len("2026-09-23T11:46"):
        moment += timedelta(microseconds=stream(f"at:{key}").randint(0, 59_999_999))
    return moment


def locate(path: str, symbol: str, text: str) -> tuple[int, int]:
    """1-based ``(first, last)`` line of ``symbol`` in ``text`` — a def, class, or assignment."""
    import ast

    if path.endswith(".py"):
        try:
            tree = ast.parse(text)
        except SyntaxError:
            tree = None
        if tree is not None:
            parts = symbol.split(".")
            nodes: Iterable[ast.AST] = tree.body
            found: ast.AST | None = None
            for part in parts:
                found = None
                for node in nodes:
                    name = getattr(node, "name", None)
                    if name == part:
                        found = node
                        break
                    if isinstance(node, ast.Assign | ast.AnnAssign):
                        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                        if any(getattr(t, "id", None) == part for t in targets):
                            found = node
                            break
                if found is None:
                    break
                nodes = getattr(found, "body", [])
            if found is not None:
                start = found.lineno
                if getattr(found, "decorator_list", None):
                    start = min(start, *(d.lineno for d in found.decorator_list))
                return found.lineno, found.end_lineno or found.lineno
    for index, line in enumerate(text.splitlines(), start=1):
        if re.search(rf"\b{re.escape(symbol.split('.')[-1])}\b", line):
            return index, index
    raise KeyError(f"{symbol} not found in {path}")


def unified_patch(before: str, after: str, path: str) -> tuple[str, int, int]:
    """A GitHub ``files[].patch`` fragment (three lines of context), with its +/- counts."""
    diff = list(
        difflib.unified_diff(
            before.splitlines(), after.splitlines(), fromfile=f"a/{path}", tofile=f"b/{path}",
            lineterm="", n=3,
        )
    )
    body = [line for line in diff[2:]] if len(diff) > 2 else []
    additions = sum(1 for line in body if line.startswith("+"))
    deletions = sum(1 for line in body if line.startswith("-"))
    return "\n".join(body), additions, deletions


def band_label(finding: core_types.CanonicalFinding) -> str:
    return finding.severity.band if finding.severity is not None else "info"


# =======================================================================================
# Building one run
# =======================================================================================


class Simulation:
    """Runs a plan of ``RunSpec`` objects plus human decisions, in time order."""

    def __init__(
        self,
        *,
        repos: Sequence[RepoSpec],
        templates: Mapping[str, Template],
        drops: Mapping[str, DropTemplate],
        runs: Sequence[RunSpec],
        revocations: Sequence[Revoke],
        real_changes: Mapping[str, Mapping[str, tuple[str, str]]],
        real_trees: Mapping[str, Mapping[str, str]],
    ) -> None:
        self.world = World()
        self.templates = templates
        self.drops = drops
        self.plan = sorted(runs, key=lambda spec: parse_at(spec.at, spec.key))
        self.revocations = revocations
        self.real_changes = real_changes
        self.real_trees = real_trees
        for spec in repos:
            rng = stream(f"repo:{spec.key}")
            row = models.Repository(
                id=uuid4(rng),
                tenant_id=TENANT_ID,
                installation_id=None,
                provider=models.Provider.GITHUB.value,
                external_repo_id=str(rng.randint(310_000_000, 890_000_000)),
                owner=spec.owner,
                name=spec.name,
                default_branch=spec.default_branch,
                is_private=spec.is_private,
                created_at=datetime(2026, 8, 18, 9, 0, tzinfo=UTC)
                + timedelta(minutes=rng.randint(0, 600)),
            )
            self.world.repos[spec.key] = RepoState(
                spec=spec, row=row, specs={file.path: file for file in spec.files}
            )

    # -----------------------------------------------------------------------------------
    def run(self) -> World:
        timeline: list[tuple[datetime, int, str, Any]] = []
        for index, spec in enumerate(self.plan):
            timeline.append((parse_at(spec.at, spec.key), index, "run", spec))
        self._plan_supersedes()
        # Runs execute in queue order; a human decision lands between runs by its own time.
        pending_suppress: list[tuple[datetime, Suppress, str]] = []
        pending_revoke = sorted(
            ((datetime.fromisoformat(r.at).replace(tzinfo=UTC), r) for r in self.revocations),
            key=lambda item: item[0],
        )
        for _, _, _, spec in sorted(timeline, key=lambda item: (item[0], item[1])):
            queued = parse_at(spec.at, spec.key)
            self._apply_humans(pending_suppress, pending_revoke, until=queued)
            record = self._run(spec)
            for sup in spec.suppress:
                at = (record.row.finished_at or queued) + timedelta(hours=sup.after_hours)
                pending_suppress.append((at, sup, spec.key))
            pending_suppress.sort(key=lambda item: item[0])
        self._apply_humans(pending_suppress, pending_revoke, until=NOW)
        if pending_suppress or pending_revoke:
            raise RuntimeError("a human decision is scheduled after 'now'")
        return self.world

    # -----------------------------------------------------------------------------------
    def _plan_supersedes(self) -> None:
        """§4.2's supersede rule, resolved up front: which run a later push cancels, and when.

        A webhook trigger knows the new head SHA and cancels in-flight runs at enqueue; an API
        trigger learns it in S1 and cancels them when ingest completes (`supersede_older_runs`).
        """
        self.cancel_at: dict[str, tuple[datetime, str]] = {}
        by_pr: dict[tuple[str, int], list[RunSpec]] = {}
        for spec in self.plan:
            by_pr.setdefault((spec.repo, spec.pr), []).append(spec)
        for specs in by_pr.values():
            for earlier, later in zip(specs, specs[1:], strict=False):
                if later.trigger == "rerun":
                    continue
                moment = parse_at(later.at, later.key)
                if later.trigger == "api":
                    timing = self._timing(later)
                    moment = timing["started"] + ms(timing["durations"][0])
                self.cancel_at[earlier.key] = (moment, later.key)

    def _timing(self, spec: RunSpec) -> dict[str, Any]:
        """Queue → start, and the durations of the stages whose length no decision changes."""
        rng = stream(f"timing:{spec.key}")
        queued = parse_at(spec.at, spec.key)
        pickup = rng.randint(180_000, 1_400_000)
        if spec.stage_ms is not None:
            pickup = 412_000  # a pinned run's worker claims it after a fixed 412 ms
        started = queued + timedelta(microseconds=pickup)
        tier = spec.tier
        specialists_ms = {
            "trivial": (5200, 8800),
            "standard": (8200, 14500),
            "full": (11800, 19500),
        }[tier]
        durations = [
            rng.randint(900, 2400),
            rng.randint(1100, 3600),
            rng.randint(*specialists_ms),
            rng.randint(2600, 7400),
            rng.randint(40, 140),
            rng.randint(120, 480),
        ]
        if spec.stage_ms is not None:
            durations = list(spec.stage_ms[:6])
        return {"queued": queued, "started": started, "durations": durations, "rng": rng}

    # -----------------------------------------------------------------------------------
    def _apply_humans(
        self,
        pending_suppress: list[tuple[datetime, Suppress, str]],
        pending_revoke: list[tuple[datetime, Revoke]],
        *,
        until: datetime,
    ) -> None:
        while True:
            next_s = pending_suppress[0] if pending_suppress else None
            next_r = pending_revoke[0] if pending_revoke else None
            candidates = [c for c in (next_s, next_r) if c is not None and c[0] <= until]
            if not candidates:
                return
            first = min(candidates, key=lambda item: item[0])
            if first is next_s:
                pending_suppress.pop(0)
                self._suppress(first[0], first[1], first[2])
            else:
                pending_revoke.pop(0)
                self._revoke(first[0], first[1])

    # =================================================================================
    # One run, stage by stage
    # =================================================================================
    def _run(self, spec: RunSpec) -> RunRecord:
        world = self.world
        repo = world.repos[spec.repo]
        timing = self._timing(spec)
        rng = timing["rng"]
        id_rng = stream(f"ids:{spec.key}")
        run_id = spec.review_id or uuid4(id_rng)
        pr = self._pull_request(spec, repo)

        row = models.ReviewRun(
            id=run_id,
            tenant_id=TENANT_ID,
            pull_request_id=pr.id,
            status=models.RunStatus.QUEUED.value,
            trigger=spec.trigger,
            head_sha=None,
            base_sha=None,
            degradations=[],
            context_truncated=False,
            findings_total=0,
            findings_published=0,
            findings_suppressed=0,
            findings_blocking=0,
            model_config_snapshot=None,
            created_at=timing["queued"],
        )
        record = RunRecord(
            spec=spec,
            repo=repo,
            pr=pr,
            row=row,
            queued_at=timing["queued"],
            started_at=timing["started"],
            rng_key=spec.key,
        )
        world.runs.append(record)
        if spec.key in self.cancel_at:
            record.cancel_at, record.superseded_by = self.cancel_at[spec.key]

        # review.requested — one core, two doors (G6). The webhook door knows the head SHA.
        actor_type, actor_id = (
            (models.ActorType.SYSTEM, ACTOR_WEBHOOK)
            if spec.trigger == "webhook"
            else (models.ActorType.HUMAN, "api")
        )
        world.emit(
            record.queued_at + ms(0.9),
            models.AuditEventType.REVIEW_REQUESTED,
            actor_type=actor_type,
            actor_id=actor_id,
            run=record,
            payload={
                "repository": repo.spec.slug,
                "pr_number": spec.pr,
                "trigger": spec.trigger,
                "force": spec.trigger == "rerun",
            },
            request_id=hex32(id_rng),
        )

        # Worker claims it (Pipeline._start).
        row.status = models.RunStatus.RUNNING.value
        row.started_at = record.started_at
        row.model_config_snapshot = self._snapshot()
        world.emit(
            record.started_at + ms(1.1),
            models.AuditEventType.REVIEW_STARTED,
            run=record,
            payload={"trigger": spec.trigger, "stage_total": len(STAGES)},
        )

        failure = self._failure(spec)
        clock = record.started_at
        durations = list(timing["durations"])
        for index, key in enumerate(STAGES, start=1):
            if record.cancel_at is not None and clock >= record.cancel_at:
                self._cancelled(record)
                usage.charge(record)
                return record
            log = StageLog(key=key, started=clock, ended=None, duration_ms=None)
            record.stages.append(log)
            row.stage = key
            row.stage_started_at = clock
            row.heartbeat_at = clock

            if failure is not None and failure["stage"] == key:
                took = failure["after_ms"]
                if failure["kind"] == "stale":
                    self._reaped(record, clock + ms(took))
                else:
                    self._failed(record, clock + ms(took), failure["code"], failure["message"])
                usage.charge(record)
                return record

            handler = getattr(self, f"_stage_{key}")
            planned = durations[index - 1] if index <= len(durations) else None
            took = handler(record, clock, planned, rng)
            clock = clock + ms(took)
            log.ended = clock
            log.duration_ms = took
            row.heartbeat_at = clock + ms(0.6)
            row.degradations = list(record.degradations)
            if key == "finalise":
                row.finished_at = clock
            world.emit(
                clock + ms(1.7),
                models.AuditEventType.REVIEW_STAGE_COMPLETED,
                run=record,
                payload={
                    "stage": key,
                    "stage_index": index,
                    "stage_total": len(STAGES),
                    "duration_ms": took,
                    "degradations": list(record.degradations),
                },
            )
        self._emit_run_record(record, clock + ms(3.2))
        row.review_payload = review_body.render(record)
        usage.charge(record)
        return record

    # -----------------------------------------------------------------------------------
    def _failure(self, spec: RunSpec) -> dict[str, Any] | None:
        if spec.outcome == "succeeded":
            return None
        kind, _, rest = spec.outcome.partition(":")
        rng = stream(f"failure:{spec.key}")
        if kind == "stale":
            return {"kind": "stale", "stage": rest, "after_ms": rng.randint(2000, 9000)}
        if kind == "failed":
            stage, code, message = rest.split(":", 2)
            return {
                "kind": "failed",
                "stage": stage,
                "code": code,
                "message": message,
                "after_ms": rng.randint(700, 4200),
            }
        raise ValueError(f"unknown outcome {spec.outcome!r}")

    def _failed(self, record: RunRecord, at: datetime, code: str, message: str) -> None:
        """``Pipeline._fail`` — the run ends ``failed``, on the record; nothing is posted."""
        row = record.row
        row.status = models.RunStatus.FAILED.value
        row.error_code = code
        row.error_message = message
        row.finished_at = at
        row.heartbeat_at = at
        row.degradations = list(record.degradations)
        self.world.emit(
            at + ms(1.3),
            models.AuditEventType.REVIEW_FAILED,
            run=record,
            payload={"error_code": code, "message": message, "stage": row.stage},
        )

    def _reaped(self, record: RunRecord, died_at: datetime) -> None:
        """The worker died mid-stage; ``queue.reap_stale_runs`` fails the run (§4.2)."""
        row = record.row
        stale_after = SETTINGS.RUN_STALE_SECONDS
        rng = stream(f"reaper:{record.spec.key}")
        last_beat = row.heartbeat_at
        moment = last_beat + timedelta(seconds=stale_after + rng.randint(4, 58))
        row.status = models.RunStatus.FAILED.value
        row.error_code = "STALE_RUN"
        row.error_message = (
            f"No heartbeat for more than {stale_after}s; the worker executing this "
            "run did not survive."
        )
        row.finished_at = moment
        self.world.emit(
            moment + ms(2.4),
            models.AuditEventType.REVIEW_FAILED,
            actor_id="reaper",
            run=record,
            payload={
                "error_code": "STALE_RUN",
                "stage": row.stage,
                "stale_after_seconds": stale_after,
            },
        )

    def _cancelled(self, record: RunRecord) -> None:
        """Superseded (§4.2): the row was cancelled underneath the worker, which stops here."""
        row = record.row
        newer = next(r for r in self.plan if r.key == record.superseded_by)
        head = newer.head_sha or sha40(stream(f"head:{newer.key}"))
        row.status = models.RunStatus.CANCELLED.value
        row.error_code = "SUPERSEDED"
        row.error_message = f"Superseded by a newer head SHA ({head})."
        row.finished_at = record.cancel_at
        row.degradations = list(record.degradations)

    # =================================================================================
    # S1 — ingest
    # =================================================================================
    def _stage_ingest(self, record: RunRecord, clock: datetime, planned: int, rng) -> int:
        spec = record.spec
        head = spec.head_sha or sha40(stream(f"head:{spec.key}"))
        if spec.trigger == "rerun":
            # POST /rerun re-runs the same PR at its current head.
            head = record.pr.head_sha or head
        base = spec.base_sha or record.pr.base_sha or sha40(stream(f"base:{spec.repo}:{spec.pr}"))
        record.row.head_sha = head
        record.row.base_sha = base
        record.pr.head_sha = head
        record.pr.base_sha = base
        record.pr.updated_at = clock
        return planned

    # =================================================================================
    # S2 — context
    # =================================================================================
    def _stage_context(self, record: RunRecord, clock: datetime, planned: int, rng) -> int:
        spec = record.spec
        changed, sources = self._changed_files(record)
        record.changed = changed
        selection = context.build_context(
            changed, token_budget=SETTINGS.CONTEXT_TOKEN_BUDGET, max_files=SETTINGS.MAX_FILES
        )
        if selection.risk_tier != spec.tier:
            raise AssertionError(
                f"{spec.key}: plan says tier {spec.tier!r}, build_context computed "
                f"{selection.risk_tier!r}"
            )
        record.selection = selection
        record.degrade(*selection.degradations)
        record.line_maps = {supplied.path: supplied.line_map for supplied in selection.files}
        record.sources = {path: text for path, text in sources.items() if path in record.line_maps}
        record.row.risk_tier = selection.risk_tier
        record.row.context_truncated = selection.truncated
        record.row.model_config_snapshot = {
            **(record.row.model_config_snapshot or {}),
            "context": {
                "files_changed": selection.files_changed,
                "files_reviewed": selection.files_reviewed,
                "files_excluded": selection.files_excluded,
                "excluded_reasons": dict(selection.excluded_reasons),
                "unfetchable": {},
                "related_files": [],
                "related_considered": [],
                "related_skipped": [],
                "related_unfetchable": {},
                "related_tree_error": None,
            },
        }
        return planned

    def _changed_files(self, record: RunRecord) -> tuple[list[context.ChangedFile], dict[str, str]]:
        """Every file the PR changed: real diffs for the demo story, synthesised elsewhere."""
        spec = record.spec
        repo = record.repo
        real = self.real_changes.get(spec.key, {})
        tree = self.real_trees.get(spec.key, {})
        ranges: dict[str, list[tuple[int, int]]] = {}
        order: list[str] = []

        def want(path: str) -> None:
            if path not in order:
                order.append(path)
                ranges.setdefault(path, [])

        for path in real:
            want(path)
        for use in spec.uses:
            path, span = self._use_location(record, use)
            if use.fate == "drop" and self.drops[use.tpl].reason == "hallucinated_path":
                continue  # the specialist named a file this pull request does not touch
            want(path)
            # Only kept findings shape the diff. A duplicate points at its kept twin, and a
            # drop at code the change did not need to touch; neither may move a kept
            # finding onto a different rung of the ladder.
            if use.fate != "keep" or path in real or span is None:
                continue
            ranges[path].extend(self._hunk_for(record, use, path, span))
        for path in (*spec.extra_files, *spec.oversized, *spec.excluded):
            want(path)

        changed: list[context.ChangedFile] = []
        sources: dict[str, str] = {}
        for path in order:
            if path in spec.excluded:
                changed.append(
                    context.ChangedFile(
                        path=path, change_status="modified", patch="@@ -1,4 +1,4 @@\n",
                        additions=stream(f"lock:{spec.key}:{path}").randint(40, 900),
                        deletions=stream(f"lock:{spec.key}:{path}").randint(30, 700),
                    )
                )
                continue
            if path in real:
                before, after = real[path]
                patch, additions, deletions = unified_patch(before, after, path)
                status = "added" if not before else "modified"
                changed.append(
                    context.ChangedFile(
                        path=path, change_status=status, patch=patch, additions=additions,
                        deletions=deletions, content=after,
                    )
                )
                sources[path] = after
                continue
            if path in spec.oversized:
                text = synth.oversized_file(path)
                patch, additions, deletions = synth.build_patch(text, [], added=True)
                changed.append(
                    context.ChangedFile(
                        path=path, change_status="added", patch=patch, additions=additions,
                        deletions=deletions, content=text,
                    )
                )
                sources[path] = text
                continue
            source = repo.source(path)
            wanted = ranges.get(path) or [self._default_hunk(record, path, source)]
            if spec.padding_lines:
                wanted = [*wanted, *self._padding(record, path, source)]
            patch, additions, deletions = synth.build_patch(source.text, wanted)
            changed.append(
                context.ChangedFile(
                    path=path, change_status="modified", patch=patch, additions=additions,
                    deletions=deletions, content=source.text,
                )
            )
            sources[path] = source.text
        for path, text in tree.items():
            sources.setdefault(path, text)
        return changed, sources

    def _use_location(self, record: RunRecord, use: Use) -> tuple[str, tuple[int, int] | None]:
        """Where a use points, as ``(path, (start, end))`` in the head revision."""
        if use.fate == "keep":
            template = self.templates[use.tpl]
            path, symbol, span = template.file, template.symbol, template.span
        elif use.fate.startswith("dup:"):
            template = self.templates[use.fate.split(":", 1)[1]]
            path, symbol, span = template.file, template.symbol, template.span
        else:
            path, symbol, span = use.file, use.symbol, None
        text = self._head_text(record, path)
        if text is None:
            return path, None
        first, last = locate(path, symbol, text)
        if span is None:
            return path, (first, min(last, first + 2))
        start, end = first + span[0], first + span[1]
        if end > last:
            raise AssertionError(f"{use.tpl}: span {span} runs past {symbol} ({first}-{last})")
        return path, (start, end)

    def _head_text(self, record: RunRecord, path: str) -> str | None:
        real = self.real_changes.get(record.spec.key, {})
        if path in real:
            return real[path][1]
        tree = self.real_trees.get(record.spec.key, {})
        if path in tree:
            return tree[path]
        if path in record.repo.specs:
            return record.repo.source(path).text
        return None

    def _hunk_for(
        self, record: RunRecord, use: Use, path: str, span: tuple[int, int]
    ) -> list[tuple[int, int]]:
        start, end = span
        rng = stream(f"hunk:{record.spec.key}:{use.tpl}:{use.fate}")
        text = record.repo.source(path).text
        total = len(text.splitlines())
        if use.anchor == "exact":
            return [(start, end)]
        if use.anchor == "nearest":
            # A hunk that ends a few lines above the finding: its trailing context stays
            # within NEAREST_LINE_MAX_DISTANCE of start_line, and none of it enters the span.
            gap = rng.randint(4, 7)
            hunk_end = max(1, start - gap)
            return [(max(1, hunk_end - rng.randint(4, 8)), hunk_end)]
        if use.anchor in ("file", "none"):
            distance = 24
            if end + distance + 8 <= total:
                first = end + distance
                return [(first, first + rng.randint(3, 6))]
            if start - distance - 8 >= 1:
                last = start - distance
                return [(last - rng.randint(3, 6), last)]
            raise AssertionError(f"{path} is too short for a far hunk ({total} lines)")
        raise ValueError(f"unknown anchor {use.anchor!r}")

    def _default_hunk(self, record: RunRecord, path: str, source: synth.SourceFile) -> tuple[int, int]:
        rng = stream(f"extra:{record.spec.key}:{path}")
        total = len(source.lines)
        first = rng.randint(1, max(1, total - 8))
        return (first, min(total, first + rng.randint(2, 7)))

    def _padding(self, record: RunRecord, path: str, source: synth.SourceFile) -> list[tuple[int, int]]:
        rng = stream(f"pad:{record.spec.key}:{path}")
        total = len(source.lines)
        first = rng.randint(1, max(1, total - 12))
        return [(first, min(total, first + record.spec.padding_lines))]

    # =================================================================================
    # S3 — specialists
    # =================================================================================
    def _stage_specialists(self, record: RunRecord, clock: datetime, planned: int, rng) -> int:
        tier = record.selection.risk_tier
        record.specialists = registry.specialist_names(tier)
        for use in record.spec.uses:
            who = self._specialist_of(use)
            if who not in record.specialists:
                raise AssertionError(
                    f"{record.spec.key}: {use.tpl} is from {who!r}, but a {tier} run only runs "
                    f"{record.specialists}"
                )
        for key in record.spec.degradations:
            if key.startswith("specialist_"):
                record.degrade(key)
        return planned

    def _specialist_of(self, use: Use) -> str:
        if use.specialist is not None:
            return use.specialist
        if use.fate == "keep":
            return self.templates[use.tpl].specialist
        return self.drops[use.tpl].specialist

    # =================================================================================
    # S4 — coordinator
    # =================================================================================
    def _stage_coordinator(self, record: RunRecord, clock: datetime, planned: int, rng) -> int:
        """Kept findings become canonical; drops and duplicates are kept as receipts."""
        spec = record.spec
        repo = record.repo
        id_rng = stream(f"finding-ids:{spec.key}")
        dropped_payload: list[dict[str, Any]] = []
        for use in spec.uses:
            finding_id = spec.finding_ids.get(use.tpl) if use.fate == "keep" else None
            finding_id = finding_id or uuid4(id_rng)
            path, span = self._use_location(record, use)
            start, end = span if span is not None else (1, 12)
            if use.fate == "keep":
                template = self.templates[use.tpl]
                canon = core_types.CanonicalFinding(
                    id=finding_id,
                    tenant_id=TENANT_ID,
                    repository_id=repo.row.id,
                    specialist=template.specialist,
                    category=template.category,
                    rule_key=coordinator._slug(template.rule_key),
                    title=template.title,
                    body_markdown=self._body(template.body, start, end),
                    file_path=path,
                    start_line=start,
                    end_line=end,
                    side="RIGHT",
                    language=coordinator.language_for(path),
                    symbol_path=coordinator._symbol_path(path, template.symbol),
                    llm_severity_hint=template.hint,
                    confidence=template.confidence,
                    provable=template.provable,
                    remediation=template.remediation or None,
                    review_run_id=record.row.id,
                )
                row = self._finding_row(record, canon)
                record.findings.append(
                    FindingRecord(key=use.tpl, use=use, row=row, canon=canon, template=template)
                )
                continue

            if use.fate.startswith("dup:"):
                original = self.templates[use.fate.split(":", 1)[1]]
                drop = self.drops[use.tpl]
            else:
                original = None
                drop = self.drops[use.tpl]
            specialist = use.specialist or drop.specialist
            symbol = use.symbol or (original.symbol if original else "")
            body = drop.body.format(file=path, symbol=symbol)
            title = drop.title.format(file=path, symbol=symbol)
            detail = drop.detail.format(file=path, symbol=symbol)
            row = models.Finding(
                id=finding_id,
                tenant_id=TENANT_ID,
                review_run_id=record.row.id,
                fingerprint_id=None,
                specialist=specialist,
                category=drop.category,
                rule_key=coordinator._slug(drop.rule_key),
                title=title,
                body_markdown=body,
                file_path=path,
                start_line=start,
                end_line=end,
                side="RIGHT",
                language=coordinator.language_for(path),
                llm_severity_hint=drop.hint,
                severity_band=None,
                severity_score=None,
                severity_inputs=None,
                confidence=drop.confidence,
                status=models.FindingStatus.DROPPED.value,
                proof_status=models.ProofStatus.NOT_ATTEMPTED.value,
                blocking=False,
                delivery_mode=models.DeliveryMode.NOT_DELIVERED.value,
                delivered_line=None,
                github_comment_id=None,
                suppression_id=None,
                created_at=clock,
            )
            record.findings.append(
                FindingRecord(
                    key=use.tpl, use=use, row=row, canon=None, drop=drop,
                    drop_reason=drop.reason, drop_detail=detail,
                )
            )
            dropped_payload.append(
                {
                    "specialist": specialist,
                    "rule_key": row.rule_key,
                    "category": drop.category,
                    "title": title,
                    "file_path": path,
                    "start_line": start,
                    "end_line": end,
                    "drop_reason": drop.reason,
                    "detail": detail,
                }
            )
        record.row.model_config_snapshot = {
            **(record.row.model_config_snapshot or {}),
            "dropped": dropped_payload,
            "coordinator_notes": "",
        }
        return planned

    @staticmethod
    def _body(text: str, start: int, end: int) -> str:
        return text.format(start=start, mid=start + 1, end=end)

    def _finding_row(self, record: RunRecord, canon: core_types.CanonicalFinding) -> models.Finding:
        return models.Finding(
            id=canon.id,
            tenant_id=TENANT_ID,
            review_run_id=record.row.id,
            fingerprint_id=None,
            specialist=canon.specialist,
            category=canon.category,
            rule_key=canon.rule_key,
            title=canon.title,
            body_markdown=canon.body_markdown,
            file_path=canon.file_path,
            start_line=canon.start_line,
            end_line=canon.end_line,
            side=canon.side,
            language=canon.language,
            llm_severity_hint=canon.llm_severity_hint,
            confidence=canon.confidence,
            status=canon.status,
            proof_status=canon.proof_status,
            blocking=False,
            delivery_mode=canon.delivery_mode,
            created_at=record.started_at,
        )

    # =================================================================================
    # S5 — severity
    # =================================================================================
    def _stage_severity(self, record: RunRecord, clock: datetime, planned: int, rng) -> int:
        for item in record.canonical:
            facts: Facts = item.template.facts
            commits = facts.commits_90d if record.repo.spec.churn_available else None
            derived = severity.derive_inputs(
                public_entrypoint=facts.public_entrypoint,
                internal_callers=facts.internal_callers,
                path_sensitivity=context.path_sensitivity(item.canon.file_path),
                symbol_is_tested=facts.symbol_is_tested,
                file_is_tested=facts.file_is_tested,
                commits_last_90d=commits,
                proof_status=item.canon.proof_status,
                symbols_available=item.canon.file_path in record.sources,
            )
            item.canon.severity = compute_severity(derived.inputs, notes=derived.notes)
        return planned

    # =================================================================================
    # S6 — identity, ledger, persistence
    # =================================================================================
    def _stage_identity(self, record: RunRecord, clock: datetime, planned: int, rng) -> int:
        world = self.world
        previous = self._previous_fingerprints(record)
        rules = self._rules(record, at=clock)
        moment = clock + ms(planned * 0.4)
        for offset, item in enumerate(record.canonical):
            canon = item.canon
            identity = fingerprint.compute(
                category=canon.category,
                rule_key=canon.rule_key,
                file_path=canon.file_path,
                line=canon.start_line,
                source=record.sources.get(canon.file_path),
            )
            canon.fingerprint = identity.value
            canon.symbol_path = identity.symbol_path
            item.identity = self._link_fingerprint(record, canon, identity, moment)
            matched = next(
                (
                    rule
                    for rule, _ in rules
                    if suppression.matches(finding=canon, rule=rule, now=moment)
                ),
                None,
            )
            if matched is not None:
                canon.status = "suppressed"
                canon.suppression_id = matched.id
                if self._blocking_eligible(canon):
                    record.break_glass.append((item, matched))
            item.row.fingerprint_id = item.identity.id
            item.row.created_at = moment + ms(offset * 1.4)
            self._write(item)
        # Coordinator receipts are persisted with the run's findings, after the kept ones.
        base = len(record.canonical)
        for offset, item in enumerate(r for r in record.findings if r.canon is None):
            item.row.created_at = moment + ms((base + offset) * 1.4)
        self._record_addressed(record, previous, moment)
        return planned

    def _blocking_eligible(self, canon: core_types.CanonicalFinding) -> bool:
        return (
            canon.language.strip().lower() == "python"
            and canon.severity is not None
            and runner.blocking_band_reached(
                canon.severity.band, block_min_severity=SETTINGS.BLOCK_MIN_SEVERITY
            )
        )

    def _link_fingerprint(
        self,
        record: RunRecord,
        canon: core_types.CanonicalFinding,
        identity: fingerprint.Fingerprint,
        moment: datetime,
    ) -> models.FindingFingerprint:
        key = (record.repo.row.id, identity.value)
        row = self.world.fingerprints.get(key)
        if row is None:
            row = models.FindingFingerprint(
                id=uuid4(stream(f"fp:{record.repo.spec.key}:{identity.value}")),
                tenant_id=TENANT_ID,
                repository_id=record.repo.row.id,
                fingerprint=identity.value,
                category=canon.category,
                rule_key=canon.rule_key,
                symbol_path=identity.symbol_path,
                shape_hash=identity.shape_hash,
                first_seen_run_id=record.row.id,
                last_seen_run_id=record.row.id,
                occurrence_count=1,
                addressed_count=0,
                dismissed_count=0,
                created_at=moment,
                updated_at=moment,
            )
            self.world.fingerprints[key] = row
            return row
        row.occurrence_count += 1
        row.last_seen_run_id = record.row.id
        row.symbol_path = identity.symbol_path
        row.shape_hash = identity.shape_hash
        row.updated_at = moment
        return row

    def _rules(self, record: RunRecord, *, at: datetime) -> list[tuple[core_types.SuppressionRule, SuppressionRecord]]:
        """The ledger rows that existed when S6 read it, as domain objects (§6.6)."""
        rules = []
        for sup in self.world.suppressions.values():
            row = sup.row
            if row.created_at > at:
                continue
            if row.repository_id not in (None, record.repo.row.id) and row.scope != "tenant":
                continue
            revoked = row.revoked_at if row.revoked_at is not None and row.revoked_at <= at else None
            fp_row = next(
                (fp for fp in self.world.fingerprints.values() if fp.id == row.fingerprint_id), None
            )
            rules.append(
                (
                    core_types.SuppressionRule(
                        id=row.id,
                        tenant_id=row.tenant_id,
                        scope=row.scope,
                        reason=row.reason,
                        created_by=row.created_by or "",
                        source=row.source,
                        repository_id=row.repository_id,
                        fingerprint=fp_row.fingerprint if fp_row is not None else None,
                        match_path=row.match_path,
                        match_rule_key=row.match_rule_key,
                        expires_at=row.expires_at,
                        revoked_at=revoked,
                        created_at=row.created_at,
                    ),
                    sup,
                )
            )
        return rules

    def _previous_fingerprints(self, record: RunRecord) -> dict[str, FindingRecord]:
        """What the last *succeeded* run on this PR reported, keyed by fingerprint (E3)."""
        earlier = [
            r
            for r in self.world.runs
            if r.pr.id == record.pr.id
            and r is not record
            and r.row.status == models.RunStatus.SUCCEEDED.value
        ]
        if not earlier:
            return {}
        last = max(earlier, key=lambda r: r.row.created_at)
        return {
            item.canon.fingerprint: item
            for item in last.canonical
            if item.canon.fingerprint
        }

    def _record_addressed(
        self, record: RunRecord, previous: Mapping[str, FindingRecord], moment: datetime
    ) -> None:
        current = {item.canon.fingerprint for item in record.canonical}
        for value, item in previous.items():
            if value in current:
                continue
            self.world.outcomes.append(
                models.FindingOutcome(
                    id=uuid4(stream(f"outcome:addressed:{item.row.id}")),
                    tenant_id=TENANT_ID,
                    finding_id=item.row.id,
                    fingerprint_id=item.row.fingerprint_id,
                    outcome=models.OutcomeKind.ADDRESSED.value,
                    detected_at=moment,
                    evidence={
                        "resolved_in_run": record.row.id,
                        "head_sha": record.row.head_sha,
                        "reason": "the fingerprint was not reported at the new head",
                    },
                )
            )
            if item.identity is not None:
                item.identity.addressed_count += 1
                item.identity.updated_at = moment

    def _write(self, item: FindingRecord) -> None:
        """``Pipeline._write_finding`` — ``blocking`` re-derived by ``is_blocking``, never copied."""
        canon, row = item.canon, item.row
        row.status = canon.status
        row.proof_status = canon.proof_status
        row.blocking = severity.is_blocking(
            proof_status=canon.proof_status,
            band=canon.severity.band if canon.severity is not None else "info",
            language=canon.language,
            status=canon.status,
            block_min_severity=SETTINGS.BLOCK_MIN_SEVERITY,
        )
        row.delivery_mode = canon.delivery_mode
        row.delivered_line = canon.delivered_line
        row.github_comment_id = canon.github_comment_id
        row.suppression_id = canon.suppression_id
        if canon.severity is not None:
            row.severity_band = canon.severity.band
            row.severity_score = canon.severity.score
            row.severity_inputs = {
                **dict(canon.severity.inputs.as_mapping()),
                "churn_available": canon.severity.inputs.churn_available,
                "weights": dict(canon.severity.weights),
                "explanation": canon.severity.explanation,
                "notes": list(canon.severity.notes),
            }

    # =================================================================================
    # S7 — proof
    # =================================================================================
    def _stage_proof(self, record: RunRecord, clock: datetime, planned: int | None, rng) -> int:
        spec = record.spec
        policy = runner.ProofPolicy.from_settings(SETTINGS)
        sandbox = spec.sandbox
        if sandbox == "subprocess":
            record.degrade(runner.DEGRADATION_SANDBOX_DEGRADED)
        elif sandbox == "none":
            record.degrade(runner.DEGRADATION_NO_SANDBOX)
        runner_name, isolation = (
            ("docker", "isolated") if sandbox == "docker" else ("subprocess", "degraded")
        )

        canon = [item.canon for item in record.canonical]
        by_id = {item.canon.id: item for item in record.canonical}
        for candidate in selector.explain_selection(
            canon, min_score=policy.min_score, max_per_run=policy.max_per_run
        ):
            by_id[candidate.finding.id].selection = candidate.reason
        chosen = selector.select_candidates(
            canon, min_score=policy.min_score, max_per_run=policy.max_per_run
        )

        # Each candidate costs one generator call, then (sandbox permitting) a base and a head
        # execution. The artifact's duration_ms is the execution alone, as `_run_proof`
        # measures it; the stage also pays for generation.
        plan: list[tuple[FindingRecord, Proof, int, int]] = []
        for finding in chosen:
            item = by_id[finding.id]
            proof = item.template.proofs.get(item.use.proof)
            if proof is None:
                raise AssertionError(
                    f"{spec.key}: {item.key} was selected for proof but has no {item.use.proof!r} repro"
                )
            item.proof = proof
            timing = stream(f"proof-ms:{spec.key}:{item.key}")
            generate = timing.randint(2200, 3400)
            if proof.kind == "gen_fail" or sandbox == "none":
                execute = 0
            elif proof.kind == "head_timeout":
                execute = SETTINGS.PROOF_TIMEOUT * 1000 + timing.randint(900, 1600)
            elif sandbox == "docker":
                execute = timing.randint(1500, 2400)
            else:
                execute = timing.randint(900, 1600)
            plan.append((item, proof, generate, execute))

        overhead = stream(f"proof-overhead:{spec.key}").randint(90, 260)
        if spec.stage_ms is not None:
            # The demo pins the stage; scale the per-proof figures into it, keep the overhead.
            pinned = spec.stage_ms[6]
            raw = sum(g + e for _, _, g, e in plan)
            factor = (pinned - 180) / raw if raw else 1.0
            plan = [(i, p, int(g * factor), int(e * factor)) for i, p, g, e in plan]
            overhead = pinned - sum(g + e for _, _, g, e in plan)
            if overhead < 60:
                raise AssertionError(f"{spec.key}: pinned proof stage leaves {overhead}ms overhead")

        outcomes: list[core_types.ProofOutcome] = []
        cursor = clock + ms(overhead / 2)
        for item, proof, generate, execute in plan:
            finding = item.canon
            cursor += ms(generate)
            if proof.kind == "gen_fail":
                # §8.1: the generator could not write a repro — advisory, never fatal.
                record.degrade(pipeline.DEGRADATION_PROOF_NOT_GENERATED)
                continue
            request = self._request(record, item, proof)
            if sandbox == "none":
                # E14: no sandbox is not an error. Recorded as `skipped_no_env` (§4.6, §5.1),
                # the value /v1/accuracy counts as attempted.
                outcome = replace(
                    runner.skipped_outcome(reason="no sandbox available — nothing could be proven"),
                    status="skipped_no_env",
                )
            else:
                outcome = self._execute(record, item, proof, request, runner_name, isolation, execute)
            cursor += ms(execute)
            outcomes.append(outcome)
            item.outcome = outcome
            runner.apply_outcome(
                finding,
                outcome,
                block_min_severity=SETTINGS.BLOCK_MIN_SEVERITY,
                recompute=compute_severity,
            )
            item.artifact = models.ProofArtifact(
                id=uuid4(stream(f"artifact:{finding.id}")),
                tenant_id=TENANT_ID,
                finding_id=finding.id,
                review_run_id=record.row.id,
                created_at=cursor,
                **runner.artifact_columns(outcome, request),
            )
            self._write(item)

        # Not-selected findings a sandbox could never execute (§4.6: only Python repros).
        for item in record.canonical:
            if item.selection == "not_python":
                item.canon.proof_status = "not_applicable"
                self._write(item)

        record.all_proofs_skipped_for_env = sandbox == "none" or (
            bool(outcomes) and all(o.outcome == pipeline.PROOF_OUTCOME_SKIPPED_NO_ENV for o in outcomes)
        )
        return sum(g + e for _, _, g, e in plan) + overhead

    def _request(self, record: RunRecord, item: FindingRecord, proof: Proof) -> core_types.ProofRequest:
        path = proof.test_file_path or f"tests/test_repro_{hex6(stream(f'repro:{item.row.id}'))}.py"
        return core_types.ProofRequest(
            finding_id=item.row.id,
            test_file_path=path,
            test_code=proof.test_code,
            expected_failure_signal=proof.signal,
            timeout_seconds=SETTINGS.PROOF_TIMEOUT,
            require_baseline=SETTINGS.PROOF_REQUIRE_BASELINE,
        )

    def _execute(
        self,
        record: RunRecord,
        item: FindingRecord,
        proof: Proof,
        request: core_types.ProofRequest,
        runner_name: str,
        isolation: str,
        took: int,
    ) -> core_types.ProofOutcome:
        """Build the two ``RunResult``s pytest would have produced, then let the runner decide."""
        short = record.repo.spec.short_summary
        command = PYTEST_COMMAND.format(path=request.test_file_path)
        base, head, deps_ok = self._results(proof, request, command, short, runner_name)
        verdict = runner.classify_outcome(
            base,
            head,
            request.expected_failure_signal,
            deps_ok,
            require_baseline=SETTINGS.PROOF_REQUIRE_BASELINE,
            base_applicable=True,
        )
        return core_types.ProofOutcome(
            status=verdict.status,
            outcome=verdict.outcome,
            runner=runner_name,
            isolation=isolation,
            baseline_mode=verdict.baseline_mode,
            base=base,
            head=head,
            deps_install_ok=deps_ok,
            duration_ms=took,
            detail=verdict.detail,
        )

    def _results(
        self,
        proof: Proof,
        request: core_types.ProofRequest,
        command: str,
        short: bool,
        runner_name: str,
    ) -> tuple[core_types.RunResult | None, core_types.RunResult | None, bool]:
        path = request.test_file_path

        def passed(seconds: float) -> core_types.RunResult:
            return core_types.RunResult(exit_code=0, stdout=pt.passed_run(seconds), command=command)

        def failed(seconds: float) -> core_types.RunResult:
            source, lineno = repro.test_function_source(proof.test_code, proof.test_name)
            failure = pt.Failure(
                test_path=path,
                test_name=proof.test_name,
                source=source,
                failing_index=len(source) - 1,
                lineno=lineno,
                exception=proof.failure.exception,
                explanation=proof.failure.explanation,
                caret=proof.failure.caret,
            )
            return core_types.RunResult(
                exit_code=1, stdout=pt.failed_run(failure, seconds, short_summary=short), command=command
            )

        kind = proof.kind
        if kind == "fails_at_head":
            return passed(proof.base_seconds), failed(proof.head_seconds), True
        if kind == "passes_both":
            return passed(proof.base_seconds), passed(proof.head_seconds), True
        if kind == "fails_both":
            return failed(proof.base_seconds), failed(proof.head_seconds), True
        if kind == "wrong_signal":
            return passed(proof.base_seconds), failed(proof.head_seconds), True
        if kind == "deps_failed":
            return passed(proof.base_seconds), failed(proof.head_seconds), False
        if kind == "head_timeout":
            head = core_types.RunResult(
                exit_code=-9,
                stdout="",
                stderr=pt.timeout_stderr(runner_name, SETTINGS.PROOF_TIMEOUT),
                timed_out=True,
                command=command,
            )
            return passed(proof.base_seconds), head, True
        if kind == "collection_error":
            source_lines = proof.test_code.splitlines()
            index = next(
                i for i, line in enumerate(source_lines) if proof.missing_module and proof.missing_module in line
            )
            error = pt.CollectionError(
                test_path=path,
                import_lineno=index + 1,
                import_line=source_lines[index].strip(),
                error=f"ModuleNotFoundError: No module named '{proof.missing_module}'",
            )
            result = core_types.RunResult(
                exit_code=2, stdout=pt.collection_error_run(error, proof.head_seconds), command=command
            )
            base = replace(result, stdout=pt.collection_error_run(error, proof.base_seconds))
            return base, result, True
        if kind == "nothing_collected":
            base = core_types.RunResult(exit_code=5, stdout=pt.skipped_module_run(proof.base_seconds), command=command)
            head = core_types.RunResult(exit_code=5, stdout=pt.skipped_module_run(proof.head_seconds), command=command)
            return base, head, True
        raise ValueError(f"unknown proof kind {kind!r}")

    # =================================================================================
    # S8 — delivery and the gate
    # =================================================================================
    def _stage_delivery(self, record: RunRecord, clock: datetime, planned: int | None, rng) -> int:
        spec = record.spec
        for item in record.canonical:
            canon = item.canon
            if canon.status == "proposed":
                canon.status = "published"
            canon.blocking = severity.is_blocking(
                proof_status=canon.proof_status,
                band=band_label(canon),
                language=canon.language,
                status=canon.status,
                block_min_severity=SETTINGS.BLOCK_MIN_SEVERITY,
            )

        published = [item.canon for item in record.published]
        published_ids = [finding.id for finding in published]
        assignments = comment_ladder.assign_rungs(
            published, record.line_maps, max_distance=SETTINGS.NEAREST_LINE_MAX_DISTANCE
        )
        expected = {"exact": "inline_exact", "nearest": "inline_nearest", "file": "file_level"}
        for item in record.published:
            got = assignments[item.canon.id].mode
            want = expected.get(item.use.anchor)
            if want is None or got != want:
                raise AssertionError(
                    f"{spec.key}: {item.key} planned anchor {item.use.anchor!r} but the ladder "
                    f"put it on {got!r}"
                )
        degradations: list[str] = []
        mode = spec.review
        status = "posted"
        if mode == "comments_unreadable":
            assignments = {k: comment_ladder.demote_to_summary(a) for k, a in assignments.items()}
            degradations.append("review_comments_unreadable")
            status = "degraded"
        breakdown = comment_ladder.assert_conservation(published_ids, assignments)
        if mode.startswith("422:"):
            target = next(item for item in record.published if item.key == mode.split(":", 1)[1])
            current = assignments[target.canon.id]
            assignments[target.canon.id] = comment_ladder.demote(
                current, record.line_maps.get(current.file_path)
            )
            degradations.append("review_422_demoted")
            breakdown = comment_ladder.assert_conservation(published_ids, assignments)
        posted = mode in ("posted", "comments_unreadable") or mode.startswith("422:")
        if mode == "forbidden":
            degradations.append("review_not_posted")
            status = "degraded"
        if mode == "dry_run":
            status = "dry_run"
        record.degrade(*degradations)

        review_id = None
        if posted:
            review_id = stream(f"review-id:{spec.key}").randint(2_100_000_000, 2_980_000_000)
        for item in record.published:
            assignment = assignments[item.canon.id]
            item.assignment = assignment
            item.canon.delivery_mode = assignment.delivery_mode
            item.canon.delivered_line = assignment.anchor_line or assignment.line
            if posted and assignment.mode != "summary_only":
                key = (record.pr.id, item.canon.fingerprint)
                comment_id = self.world.comment_ids.get(key)
                if comment_id is None:
                    comment_id = stream(f"comment:{spec.key}:{item.key}").randint(
                        1_900_000_000, 2_700_000_000
                    )
                    self.world.comment_ids[key] = comment_id
                else:
                    item.reused = True
                item.canon.github_comment_id = comment_id
        for item in record.canonical:
            self._write(item)

        record.delivery = Delivery(
            status=status,
            assignments=assignments,
            breakdown=breakdown,
            degradations=degradations,
            payload=None,
            github_review_id=review_id,
            posted=posted,
        )
        row = record.row
        row.delivery_status = status
        row.github_review_id = review_id

        decision = gate.decide(
            [item.canon for item in record.canonical],
            degraded=bool(set(record.degradations) - pipeline.GATE_DEGRADATION_EXEMPT),
            all_proofs_skipped_for_env=record.all_proofs_skipped_for_env,
            block_min_severity=SETTINGS.BLOCK_MIN_SEVERITY,
            context_name=SETTINGS.GATE_CONTEXT_NAME,
        )
        record.gate = asyncio.run(
            gate.deliver_gate(
                client=_GateClient(record.repo.spec, spec.gate),
                owner=record.repo.spec.owner,
                repo=record.repo.spec.name,
                head_sha=row.head_sha,
                decision=decision,
                result_url=f"{PUBLIC_BASE_URL}/v1/reviews/{row.id}/result",
                allow_check_run=ALLOW_CHECK_RUN,
                dry_run=mode == "dry_run",
            )
        )
        row.gate_conclusion = record.gate.conclusion
        row.gate_delivery = record.gate.delivery
        if spec.stage_ms is not None:
            return spec.stage_ms[7]
        return stream(f"delivery:{spec.key}").randint(900, 2600)

    # =================================================================================
    # S9 — finalise
    # =================================================================================
    def _stage_finalise(self, record: RunRecord, clock: datetime, planned: int | None, rng) -> int:
        row = record.row
        findings = record.canonical
        row.findings_total = len(record.findings)
        row.findings_published = sum(1 for f in findings if f.canon.status == "published")
        row.findings_suppressed = sum(1 for f in findings if f.canon.status == "suppressed")
        row.findings_blocking = sum(1 for f in findings if f.row.blocking)
        row.degradations = list(record.degradations)
        row.status = models.RunStatus.SUCCEEDED.value
        if record.spec.stage_ms is not None:
            return record.spec.stage_ms[8]
        return stream(f"finalise:{record.spec.key}").randint(160, 380)

    def _emit_run_record(self, record: RunRecord, at: datetime) -> None:
        """``Pipeline._emit_run_record`` — AC-21's order, after the nine stage events."""
        world = self.world
        tick = [at]

        def next_at() -> datetime:
            tick[0] = tick[0] + ms(stream(f"tick:{record.spec.key}:{len(world.events)}").randint(700, 2100) / 1000)
            return tick[0]

        if record.degradations:
            world.emit(
                next_at(), models.AuditEventType.REVIEW_DEGRADED, run=record,
                payload={"degradations": list(record.degradations)},
            )
        # Every row the specialists proposed — kept, suppressed, refuted or dropped.
        for item in [*record.canonical, *(r for r in record.findings if r.canon is None)]:
            row = item.row
            payload = {
                "rule_key": row.rule_key,
                "category": row.category,
                "file_path": row.file_path,
                "fingerprint": item.canon.fingerprint if item.canon is not None else None,
                "llm_severity_hint": row.llm_severity_hint,
                "severity_band": row.severity_band,
                "severity_score": row.severity_score,
                # Extension (see gen_fixtures.py): the six measured inputs the score was
                # computed from, so the chain records the arithmetic and not only its result.
                "severity_inputs": (
                    dict(item.canon.severity.inputs.as_mapping())
                    if item.canon is not None and item.canon.severity is not None
                    else None
                ),
            }
            world.emit(
                next_at(), models.AuditEventType.FINDING_PROPOSED,
                actor_type=models.ActorType.AI,
                actor_id=f"specialist:{row.specialist}:{SETTINGS.MODEL_SPECIALIST}",
                run=record, finding_id=row.id, payload=payload,
            )
        for item in record.canonical:
            if item.canon.status != "suppressed":
                continue
            world.emit(
                next_at(), models.AuditEventType.FINDING_SUPPRESSED, run=record,
                finding_id=item.row.id,
                payload={"suppression_id": item.canon.suppression_id, "fingerprint": item.canon.fingerprint},
            )
        for item, rule in record.break_glass:
            world.emit(
                next_at(), models.AuditEventType.OVERRIDE_BREAK_GLASS,
                actor_type=models.ActorType.HUMAN, actor_id=rule.created_by or "api",
                run=record, finding_id=item.row.id,
                payload={
                    "suppression_id": rule.id,
                    "reason": rule.reason,
                    "scope": rule.scope,
                    "severity_band": band_label(item.canon),
                    "proof_status": item.canon.proof_status,
                },
            )
        for item in record.canonical:
            outcome = item.outcome
            if outcome is None:
                continue
            world.emit(
                next_at(), models.AuditEventType.PROOF_EXECUTED,
                actor_id=f"proof-runner:{outcome.runner}", run=record, finding_id=item.row.id,
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
                world.emit(
                    next_at(), models.AuditEventType.FINDING_DISPROVEN, run=record,
                    finding_id=item.row.id,
                    payload={"outcome": outcome.outcome, "clamped_to": "info"},
                )
        for item in record.published:
            canon = item.canon
            world.emit(
                next_at(), models.AuditEventType.FINDING_PUBLISHED, run=record,
                finding_id=item.row.id,
                payload={
                    "delivery_mode": canon.delivery_mode,
                    "delivered_line": canon.delivered_line,
                    "github_comment_id": canon.github_comment_id,
                    "blocking": item.row.blocking,
                    "proof_status": canon.proof_status,
                },
            )
        decision = record.gate
        world.emit(
            next_at(), models.AuditEventType.GATE_EVALUATED, actor_id="gate", run=record,
            payload={
                "conclusion": decision.conclusion,
                "reason": decision.reason,
                "blocking_finding_ids": list(decision.blocking_finding_ids),
            },
        )
        world.emit(
            next_at(), models.AuditEventType.GATE_DELIVERED, actor_id="gate", run=record,
            payload={
                "delivery": decision.delivery,
                "delivered": decision.delivered,
                "context_name": decision.context_name,
                "detail": decision.detail,
            },
        )
        row = record.row
        world.emit(
            next_at(), models.AuditEventType.REVIEW_COMPLETED, run=record,
            payload={
                "status": row.status,
                "delivery_status": row.delivery_status,
                "gate_conclusion": row.gate_conclusion,
                "counts": {
                    "total": row.findings_total,
                    "published": row.findings_published,
                    "suppressed": row.findings_suppressed,
                    "blocking": row.findings_blocking,
                },
                "degradations": list(record.degradations),
            },
        )

    # =================================================================================
    # Humans
    # =================================================================================
    def _suppress(self, at: datetime, spec: Suppress, run_key: str) -> None:
        """``POST /v1/findings/{id}/suppress`` — the route's writes, in the route's order."""
        world = self.world
        record = world.run(run_key)
        item = next(r for r in record.canonical if r.key == spec.tpl)
        if item.canon.status != "published":
            raise AssertionError(f"{run_key}: {spec.tpl} is {item.canon.status}, not published")
        rng = stream(f"suppression:{spec.key}")
        expires = (
            datetime.fromisoformat(spec.expires_at).replace(tzinfo=UTC) if spec.expires_at else None
        )
        match_path = spec.match_path if spec.scope == "pattern" else (
            item.row.file_path if spec.scope == "file" else None
        )
        row = models.Suppression(
            id=uuid4(rng),
            tenant_id=TENANT_ID,
            repository_id=record.repo.row.id,
            fingerprint_id=item.row.fingerprint_id,
            scope=spec.scope,
            match_path=match_path,
            match_rule_key=item.row.rule_key,
            reason=spec.reason.strip(),
            created_by=spec.actor,
            source=models.SuppressionSource.HUMAN_API.value,
            expires_at=expires,
            revoked_at=None,
            created_at=at,
        )
        world.suppressions[spec.key] = SuppressionRecord(spec=spec, row=row, finding=item, run=record)
        item.canon.status = "suppressed"
        item.canon.suppression_id = row.id
        item.row.status = models.FindingStatus.SUPPRESSED.value
        item.row.suppression_id = row.id
        item.row.blocking = severity.is_blocking(
            proof_status=item.row.proof_status,
            band=item.row.severity_band or "info",
            language=item.row.language or "",
            status=item.row.status,
            block_min_severity=SETTINGS.BLOCK_MIN_SEVERITY,
        )
        world.outcomes.append(
            models.FindingOutcome(
                id=uuid4(stream(f"outcome:dismissed:{item.row.id}")),
                tenant_id=TENANT_ID,
                finding_id=item.row.id,
                fingerprint_id=item.row.fingerprint_id,
                outcome=models.OutcomeKind.DISMISSED.value,
                detected_at=at,
                evidence={"suppression_id": row.id, "reason": row.reason},
            )
        )
        if item.identity is not None:
            # Extension (see gen_fixtures.py): the counter §6.4's history reads.
            item.identity.dismissed_count += 1
            item.identity.updated_at = at
        world.emit(
            at + ms(2.2),
            models.AuditEventType.SUPPRESSION_CREATED,
            actor_type=models.ActorType.HUMAN,
            actor_id=spec.actor,
            run=record,
            finding_id=item.row.id,
            payload={
                "suppression_id": row.id,
                "scope": row.scope,
                "match_path": row.match_path,
                "reason": row.reason,
                "expires_at": expires.isoformat() if expires is not None else None,
            },
            request_id=hex32(rng),
        )

    def _revoke(self, at: datetime, spec: Revoke) -> None:
        sup = self.world.suppressions[spec.suppression]
        sup.row.revoked_at = at
        self.world.emit(
            at + ms(1.8),
            models.AuditEventType.SUPPRESSION_REVOKED,
            actor_type=models.ActorType.HUMAN,
            actor_id=spec.actor,
            payload={"suppression_id": sup.row.id, "scope": sup.row.scope},
            request_id=hex32(stream(f"revoke:{spec.suppression}")),
        )

    # =================================================================================
    # Rows the run touches outside itself
    # =================================================================================
    def _pull_request(self, spec: RunSpec, repo: RepoState) -> models.PullRequest:
        key = (spec.repo, spec.pr)
        pr = self.world.prs.get(key)
        opened = parse_at(spec.at, spec.key) - timedelta(minutes=stream(f"opened:{spec.repo}:{spec.pr}").randint(3, 90))
        if pr is None:
            pr = models.PullRequest(
                id=uuid4(stream(f"pr:{spec.repo}:{spec.pr}")),
                tenant_id=TENANT_ID,
                repository_id=repo.row.id,
                number=spec.pr,
                title=spec.title,
                author_login=spec.author,
                head_sha=None,
                head_ref=spec.head_ref or f"{spec.author}/{_slug_ref(spec.title)}",
                base_sha=None,
                base_ref=repo.spec.default_branch,
                state=spec.pr_state,
                url=f"https://github.com/{repo.spec.slug}/pull/{spec.pr}",
                is_draft=False,
                created_at=opened,
                updated_at=opened,
            )
            self.world.prs[key] = pr
        pr.title = spec.title
        pr.state = spec.pr_state
        return pr

    @staticmethod
    def _snapshot() -> dict[str, Any]:
        return {
            "specialist_model": SETTINGS.MODEL_SPECIALIST,
            "coordinator_model": SETTINGS.MODEL_COORDINATOR,
            "proof_generator_model": SETTINGS.MODEL_PROOF_GENERATOR,
            "temperature": SETTINGS.LLM_TEMPERATURE,
            "severity_weights": dict(WEIGHTS),
            "severity_bands": dict(BANDS),
            "block_min_severity": SETTINGS.BLOCK_MIN_SEVERITY,
        }


def _slug_ref(title: str) -> str:
    words = re.findall(r"[a-z0-9]+", title.lower())
    return "-".join(words[:5])


class _GateClient:
    """The two GitHub calls ``deliver_gate`` makes, answered the way GitHub answers them.

    A check run on a repository the App is not installed on is refused (403, "Resource not
    accessible by integration"); a commit status goes through with a PAT that can write. A run
    marked ``unreachable`` had neither — its token had expired — and the verdict stays in
    ``/result`` as ``dry_run``.
    """

    def __init__(self, repo: RepoSpec, mode: str) -> None:
        self.repo = repo
        self.mode = mode

    async def create_check_run(self, owner: str, repo: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self.repo.app_installed and self.mode != "unreachable":
            return {"id": 1}
        raise github_client.GitHubForbiddenError(
            "403 Forbidden",
            status=403,
            body={"message": "Resource not accessible by integration"},
        )

    async def create_commit_status(
        self, owner: str, repo: str, sha: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        if self.mode != "unreachable":
            return {"id": 1}
        raise github_client.GitHubError(
            "401 Unauthorized", status=401, body={"message": "Bad credentials"}
        )
