"""POST /v1/reviews, GET /v1/reviews/{id}, /result, POST /rerun (spec §6.1–6.3).

**The request path never touches the network** (§4.2, R9, AC-1). `POST /v1/reviews` does the
cheap half of S1 — parse the reference, upsert the repo/PR rows, insert a `queued` run,
commit, enqueue, return 202 — and the PR itself is resolved inside the worker. That is why
`pull_request.head_sha` is `null` in the 202 body.

:func:`enqueue_review` is the one core behind the two doors (G6): `POST /webhooks/github`
calls exactly this function, so an API-triggered run and a webhook-triggered run differ only
in `trigger`.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any, cast

import sqlalchemy as sa
from fastapi import APIRouter, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.api.deps import (
    JobQueueDep,
    RequireBearer,
    SessionDep,
    SettingsDep,
    TenantScope,
    TenantScopeDep,
)
from prguard.api.errors import ErrorCode, PRGuardError, request_id_of
from prguard.api.routes_findings import render_findings
from prguard.api.schemas import (
    STAGE_TOTAL,
    ContextInfo,
    CostInfo,
    CreateReviewRequest,
    DeliveryInfo,
    DeliveryStatusName,
    GateConclusionName,
    GateDeliveryName,
    GateInfo,
    LadderBreakdown,
    PullRequestInfo,
    PullRequestRef,
    RepositoryInfo,
    RepositoryRef,
    ResultCounts,
    ReviewAccepted,
    ReviewResult,
    ReviewStatus,
    RiskTierName,
    RunCounts,
    RunError,
    RunStatusName,
    RunTriggerName,
    TimingInfo,
)
from prguard.config import Settings
from prguard.core import audit
from prguard.core.queue import JobQueue
from prguard.db import models
from prguard.db.base import as_utc, new_uuid, utcnow

router = APIRouter(prefix="/v1", tags=["reviews"])

#: Spec §4.1 — the nine stages, in order. `stage_index` is the 1-based position of
#: `review_runs.stage` in this tuple; the pipeline (T9) writes these exact keys.
PIPELINE_STAGES: tuple[str, ...] = (
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

#: What the demo reads out loud while a stage runs (§4.2, "the demo narrates itself").
STAGE_LABELS: dict[str, str] = {
    "ingest": "Resolving the pull request and fetching the diff",
    "context": "Building review context from the changed files",
    "specialists": "Running {specialists} specialist passes",
    "coordinator": "Merging and filtering specialist findings",
    "severity": "Scoring severity from the stored inputs",
    "identity": "Fingerprinting findings and applying the suppression ledger",
    "proof": "Generating and executing repro tests",
    "delivery": "Posting the review and setting the gate",
    "finalise": "Recomputing counters and writing audit events",
}

#: §11.2 assumption 11 — risk tier decides how many specialists run.
SPECIALISTS_PER_TIER: dict[str, int] = {"trivial": 2, "standard": 3, "full": 4}
SPECIALISTS_DEFAULT = 4

#: `https://github.com/owner/repo/pull/42`, with or without scheme, `www.` or a tail.
_PR_URL = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/"
    r"(?P<owner>[^/\s]+)/(?P<name>[^/\s]+)/pulls?/(?P<number>\d+)(?:[/?#].*)?$",
    re.IGNORECASE,
)
#: The `owner/repo#42` shorthand §6.1 also accepts.
_PR_SHORTHAND = re.compile(r"^(?P<owner>[\w.-]+)/(?P<name>[\w.-]+)#(?P<number>\d+)$")

#: The statuses a run can still be superseded or deduplicated against (§4.2).
IN_FLIGHT = (models.RunStatus.QUEUED.value, models.RunStatus.RUNNING.value)


@dataclass(frozen=True)
class ReviewTarget:
    """What a trigger knows about the PR.

    The API door knows three fields; the webhook door knows the whole payload. Everything
    past `number` is optional so both can call :func:`enqueue_review` unchanged.
    """

    owner: str
    name: str
    number: int
    head_sha: str | None = None
    base_sha: str | None = None
    head_ref: str | None = None
    base_ref: str | None = None
    title: str | None = None
    author_login: str | None = None
    state: str | None = None
    url: str | None = None
    is_draft: bool | None = None
    default_branch: str | None = None
    external_repo_id: str | None = None

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.name}"


@dataclass(frozen=True)
class EnqueuedReview:
    run: models.ReviewRun
    repository: models.Repository
    pull_request: models.PullRequest
    #: E21 — the caller asked twice for the same head SHA and got the first run back.
    deduplicated: bool


def parse_pr_url(value: str) -> ReviewTarget:
    """`https://github.com/owner/repo/pull/42` or `owner/repo#42` → a target.

    Shape only: no network call happens here, so an URL that parses but does not exist is
    the worker's problem (`PR_NOT_FOUND` on the run), not a 422 on the request.
    """
    candidate = value.strip()
    for pattern in (_PR_URL, _PR_SHORTHAND):
        found = pattern.match(candidate)
        if found is not None:
            return ReviewTarget(
                owner=found["owner"],
                name=found["name"].removesuffix(".git"),
                number=int(found["number"]),
                url=candidate if candidate.startswith("http") else None,
            )
    raise PRGuardError(ErrorCode.INVALID_PR_URL, details={"pr_url": value})


async def enqueue_review(
    *,
    session: AsyncSession,
    scope: TenantScope,
    queue: JobQueue,
    target: ReviewTarget,
    trigger: models.RunTrigger,
    force: bool = False,
    options: dict[str, Any] | None = None,
    request_id: str | None = None,
    actor_type: models.ActorType = models.ActorType.HUMAN,
    actor_id: str = "api",
) -> EnqueuedReview:
    """Upsert repo + PR, insert a `queued` run, commit, enqueue. One core, two doors (G6)."""
    repository = await _upsert_repository(session, scope, target)
    pull_request = await _upsert_pull_request(session, scope, repository, target)

    if not force:
        existing = await _deduplicate_against(session, pull_request, target)
        if existing is not None:
            return EnqueuedReview(
                run=existing,
                repository=repository,
                pull_request=pull_request,
                deduplicated=True,
            )

    await _supersede_in_flight(session, pull_request, target)

    run = models.ReviewRun(
        id=new_uuid(),
        tenant_id=scope.tenant_id,
        pull_request_id=pull_request.id,
        status=models.RunStatus.QUEUED.value,
        trigger=trigger.value,
        # Resolved inside the worker on the API path; already known on the webhook path.
        head_sha=target.head_sha,
        base_sha=target.base_sha,
        degradations=[],
        context_truncated=False,
        findings_total=0,
        findings_published=0,
        findings_suppressed=0,
        findings_blocking=0,
        # No column holds the §6.1 `options`; the run's config snapshot is where the
        # worker reads what this request asked for (T9 merges its own keys in).
        model_config_snapshot={"requested_options": options} if options else None,
        created_at=utcnow(),
    )
    session.add(run)

    # Commits the run, the upserts and the event together — see `audit.append`.
    await audit.append(
        session,
        tenant_id=scope.tenant_id,
        event_type=models.AuditEventType.REVIEW_REQUESTED,
        actor_type=actor_type,
        actor_id=actor_id,
        review_run_id=run.id,
        payload={
            "repository": target.slug,
            "pr_number": target.number,
            "trigger": trigger.value,
            "force": force,
        },
        request_id=request_id,
    )
    await queue.enqueue(run.id)
    return EnqueuedReview(
        run=run, repository=repository, pull_request=pull_request, deduplicated=False
    )


def accepted_response(enqueued: EnqueuedReview) -> ReviewAccepted:
    """The §6.1 202 body — identical whichever door the trigger came through."""
    run = enqueued.run
    return ReviewAccepted(
        review_id=run.id,
        status=cast(RunStatusName, run.status),
        trigger=cast(RunTriggerName, run.trigger),
        repository=RepositoryRef(owner=enqueued.repository.owner, name=enqueued.repository.name),
        pull_request=PullRequestRef(number=enqueued.pull_request.number, head_sha=run.head_sha),
        poll_url=f"/v1/reviews/{run.id}",
        result_url=f"/v1/reviews/{run.id}/result",
        created_at=run.created_at,
        deduplicated=enqueued.deduplicated,
    )


@router.post(
    "/reviews",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ReviewAccepted,
    dependencies=[RequireBearer],
    summary="Trigger a review (§6.1)",
)
async def create_review(
    request: Request,
    body: CreateReviewRequest,
    session: SessionDep,
    scope: TenantScopeDep,
    queue: JobQueueDep,
) -> ReviewAccepted:
    target = parse_pr_url(body.pr_url)
    options = body.options
    enqueued = await enqueue_review(
        session=session,
        scope=scope,
        queue=queue,
        target=target,
        trigger=models.RunTrigger.API,
        force=bool(options and options.force),
        options=options.model_dump(exclude_none=True) if options is not None else None,
        request_id=request_id_of(request),
    )
    return accepted_response(enqueued)


@router.post(
    "/reviews/{review_id}/rerun",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ReviewAccepted,
    dependencies=[RequireBearer],
    summary="Re-run the same PR at its current head (§6.1)",
)
async def rerun_review(
    review_id: str,
    request: Request,
    session: SessionDep,
    scope: TenantScopeDep,
    queue: JobQueueDep,
) -> ReviewAccepted:
    run = await _load_run(session, scope, review_id)
    pull_request = await _load_pull_request(session, run)
    repository = await _load_repository(session, pull_request)
    enqueued = await enqueue_review(
        session=session,
        scope=scope,
        queue=queue,
        target=ReviewTarget(
            owner=repository.owner,
            name=repository.name,
            number=pull_request.number,
            url=pull_request.url,
        ),
        trigger=models.RunTrigger.RERUN,
        # A rerun is an explicit instruction, so it never deduplicates against itself.
        force=True,
        request_id=request_id_of(request),
    )
    return accepted_response(enqueued)


@router.get("/reviews/{review_id}", response_model=ReviewStatus, summary="Run status (§6.2)")
async def get_review_status(
    review_id: str, session: SessionDep, scope: TenantScopeDep
) -> ReviewStatus:
    run = await _load_run(session, scope, review_id)
    counts = await _finding_counts(session, run.id)
    return ReviewStatus(
        review_id=run.id,
        status=cast(RunStatusName, run.status),
        stage=run.stage,
        stage_index=stage_index_of(run.stage),
        stage_total=STAGE_TOTAL,
        stage_label=stage_label_of(run.stage, run.risk_tier),
        seconds_since_heartbeat=_seconds_since(run.heartbeat_at),
        risk_tier=cast(RiskTierName | None, run.risk_tier),
        head_sha=run.head_sha,
        degradations=[str(item) for item in run.degradations or []],
        counts=RunCounts(
            proposed=counts.get(models.FindingStatus.PROPOSED.value, 0),
            published=counts.get(models.FindingStatus.PUBLISHED.value, 0),
            suppressed=counts.get(models.FindingStatus.SUPPRESSED.value, 0),
            blocking=counts.get("blocking", 0),
        ),
        started_at=run.started_at,
        finished_at=run.finished_at,
        # HTTP 200 with the error in the body: the *run* failed, the *request* did not.
        error=(
            RunError(code=run.error_code, message=run.error_message or "")
            if run.error_code
            else None
        ),
    )


@router.get(
    "/reviews/{review_id}/result",
    response_model=ReviewResult,
    summary="The full result document (§6.3)",
)
async def get_review_result(
    review_id: str,
    session: SessionDep,
    scope: TenantScopeDep,
    settings: SettingsDep,
    response: Response,
    partial: Annotated[bool, Query()] = False,
) -> ReviewResult:
    run = await _load_run(session, scope, review_id)
    if run.status in IN_FLIGHT and not partial:
        raise PRGuardError(ErrorCode.RESULT_NOT_READY, details={"status": run.status})
    if run.status in IN_FLIGHT:
        # A partial result is a snapshot of a moving run; say so rather than let a cache
        # keep it.
        response.headers["Cache-Control"] = "no-store"

    pull_request = await _load_pull_request(session, run)
    repository = await _load_repository(session, pull_request)
    findings = list(
        (
            await session.execute(
                scope.apply(sa.select(models.Finding))
                .where(models.Finding.review_run_id == run.id)
                .order_by(models.Finding.created_at.asc(), models.Finding.id.asc())
            )
        )
        .scalars()
        .all()
    )
    blocking_ids = [finding.id for finding in findings if finding.blocking]
    counts = await _finding_counts(session, run.id)
    usage = dict(run.token_usage or {})

    return ReviewResult(
        review_id=run.id,
        status=cast(RunStatusName, run.status),
        repository=RepositoryInfo(
            owner=repository.owner,
            name=repository.name,
            default_branch=repository.default_branch,
        ),
        pull_request=PullRequestInfo(
            number=pull_request.number,
            title=pull_request.title,
            author=pull_request.author_login,
            head_sha=pull_request.head_sha,
            base_sha=pull_request.base_sha,
            url=pull_request.url,
        ),
        risk_tier=cast(RiskTierName | None, run.risk_tier),
        context=_context_info(run),
        gate=_gate_info(run, blocking_ids, settings),
        delivery=_delivery_info(run, findings),
        counts=ResultCounts(
            proposed=counts.get(models.FindingStatus.PROPOSED.value, 0),
            published=counts.get(models.FindingStatus.PUBLISHED.value, 0),
            suppressed=counts.get(models.FindingStatus.SUPPRESSED.value, 0),
            dropped=counts.get(models.FindingStatus.DROPPED.value, 0),
            disproven=counts.get(models.FindingStatus.DISPROVEN.value, 0),
            blocking=counts.get("blocking", 0),
        ),
        cost=CostInfo(
            usd_estimate=run.cost_usd_estimate,
            input_tokens=int(usage.get("input_tokens", 0)),
            output_tokens=int(usage.get("output_tokens", 0)),
            cache_read_tokens=int(usage.get("cache_read_tokens", 0)),
        ),
        timing=TimingInfo(
            queued_at=run.created_at,
            started_at=run.started_at,
            finished_at=run.finished_at,
            duration_seconds=_duration_seconds(run),
        ),
        degradations=[str(item) for item in run.degradations or []],
        findings=await render_findings(session, findings, settings),
        review_payload=run.review_payload,
        audit_url=f"/v1/audit?review_id={run.id}",
    )


# --------------------------------------------------------------------------------------
# Stage reporting (§6.2)
# --------------------------------------------------------------------------------------
def stage_index_of(stage: str | None) -> int | None:
    """1-based position in §4.1's nine stages; `None` for a stage we do not recognise."""
    if stage is None:
        return None
    try:
        return PIPELINE_STAGES.index(stage) + 1
    except ValueError:
        return None


def stage_label_of(stage: str | None, risk_tier: str | None) -> str | None:
    if stage is None:
        return None
    template = STAGE_LABELS.get(stage)
    if template is None:
        return None
    specialists = SPECIALISTS_PER_TIER.get(risk_tier or "", SPECIALISTS_DEFAULT)
    return template.format(specialists=specialists)


# --------------------------------------------------------------------------------------
# Row access
# --------------------------------------------------------------------------------------
async def _load_run(
    session: AsyncSession, scope: TenantScope, review_id: str
) -> models.ReviewRun:
    found = (
        (
            await session.execute(
                scope.apply(sa.select(models.ReviewRun)).where(models.ReviewRun.id == review_id)
            )
        )
        .scalars()
        .first()
    )
    if found is None:
        raise PRGuardError(ErrorCode.REVIEW_NOT_FOUND, details={"review_id": review_id})
    return found


async def _load_pull_request(
    session: AsyncSession, run: models.ReviewRun
) -> models.PullRequest:
    pull_request = await session.get(models.PullRequest, run.pull_request_id)
    if pull_request is None:  # pragma: no cover - a FK makes this unreachable
        raise PRGuardError(ErrorCode.PR_NOT_FOUND, details={"review_id": run.id})
    return pull_request


async def _load_repository(
    session: AsyncSession, pull_request: models.PullRequest
) -> models.Repository:
    repository = await session.get(models.Repository, pull_request.repository_id)
    if repository is None:  # pragma: no cover - a FK makes this unreachable
        raise PRGuardError(ErrorCode.PR_NOT_FOUND, details={"pull_request_id": pull_request.id})
    return repository


async def _upsert_repository(
    session: AsyncSession, scope: TenantScope, target: ReviewTarget
) -> models.Repository:
    """The unique `(tenant, provider, owner, name)` key is the upsert key on every trigger."""
    statement = scope.apply(sa.select(models.Repository)).where(
        models.Repository.provider == models.Provider.GITHUB.value,
        models.Repository.owner == target.owner,
        models.Repository.name == target.name,
    )
    repository = (await session.execute(statement)).scalars().first()
    if repository is None:
        repository = models.Repository(
            id=new_uuid(),
            tenant_id=scope.tenant_id,
            provider=models.Provider.GITHUB.value,
            external_repo_id=target.external_repo_id,
            owner=target.owner,
            name=target.name,
            default_branch=target.default_branch,
            is_private=False,
            created_at=utcnow(),
        )
        session.add(repository)
        await session.flush()
        return repository
    if target.default_branch and not repository.default_branch:
        repository.default_branch = target.default_branch
    if target.external_repo_id and not repository.external_repo_id:
        repository.external_repo_id = target.external_repo_id
    return repository


async def _upsert_pull_request(
    session: AsyncSession,
    scope: TenantScope,
    repository: models.Repository,
    target: ReviewTarget,
) -> models.PullRequest:
    """PRs are identified by number, not by our id — the unique key is `(repo, number)`."""
    statement = scope.apply(sa.select(models.PullRequest)).where(
        models.PullRequest.repository_id == repository.id,
        models.PullRequest.number == target.number,
    )
    pull_request = (await session.execute(statement)).scalars().first()
    if pull_request is None:
        pull_request = models.PullRequest(
            id=new_uuid(),
            tenant_id=scope.tenant_id,
            repository_id=repository.id,
            number=target.number,
            title=target.title,
            author_login=target.author_login,
            head_sha=target.head_sha,
            head_ref=target.head_ref,
            base_sha=target.base_sha,
            base_ref=target.base_ref,
            state=target.state,
            url=target.url or _default_pr_url(target),
            is_draft=bool(target.is_draft),
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        session.add(pull_request)
        await session.flush()
        return pull_request

    # Only the door that actually knows a fact overwrites it (the API door knows none).
    for attribute in ("title", "author_login", "head_sha", "head_ref", "base_sha", "base_ref"):
        value = getattr(target, attribute)
        if value:
            setattr(pull_request, attribute, value)
    if target.state:
        pull_request.state = target.state
    if target.url:
        pull_request.url = target.url
    if target.is_draft is not None:
        pull_request.is_draft = target.is_draft
    pull_request.updated_at = utcnow()
    return pull_request


async def _deduplicate_against(
    session: AsyncSession, pull_request: models.PullRequest, target: ReviewTarget
) -> models.ReviewRun | None:
    """E21: the run a second trigger for the same head SHA should get back.

    With a known head SHA (the webhook door) that is any run on that SHA. Without one (the
    API door, where the SHA is resolved in the worker) it is any run still in flight — the
    conservative reading, because a finished run cannot be assumed to be on today's head.
    """
    statement = (
        sa.select(models.ReviewRun)
        .where(models.ReviewRun.pull_request_id == pull_request.id)
        .order_by(models.ReviewRun.created_at.desc())
        .limit(1)
    )
    if target.head_sha is not None:
        statement = statement.where(models.ReviewRun.head_sha == target.head_sha)
    else:
        statement = statement.where(models.ReviewRun.status.in_(IN_FLIGHT))
    return (await session.execute(statement)).scalars().first()


async def _supersede_in_flight(
    session: AsyncSession, pull_request: models.PullRequest, target: ReviewTarget
) -> None:
    """E3/§6.10 rule 4: a push to a new head cancels the run on the old one."""
    if target.head_sha is None:
        return
    statement = (
        sa.update(models.ReviewRun)
        .where(
            models.ReviewRun.pull_request_id == pull_request.id,
            models.ReviewRun.status.in_(IN_FLIGHT),
            sa.or_(
                models.ReviewRun.head_sha.is_(None),
                models.ReviewRun.head_sha != target.head_sha,
            ),
        )
        .values(
            status=models.RunStatus.CANCELLED.value,
            error_code="SUPERSEDED",
            error_message=f"Superseded by a newer head SHA ({target.head_sha}).",
            finished_at=utcnow(),
        )
    )
    await session.execute(statement)


async def _finding_counts(session: AsyncSession, review_run_id: str) -> dict[str, int]:
    """Counts derived from the rows, so the numbers and the `findings` array never disagree."""
    statement = (
        sa.select(models.Finding.status, sa.func.count())
        .where(models.Finding.review_run_id == review_run_id)
        .group_by(models.Finding.status)
    )
    counts = {str(name): int(total) for name, total in (await session.execute(statement)).all()}
    blocking = await session.scalar(
        sa.select(sa.func.count())
        .select_from(models.Finding)
        .where(
            models.Finding.review_run_id == review_run_id,
            models.Finding.blocking.is_(True),
        )
    )
    counts["blocking"] = int(blocking or 0)
    return counts


# --------------------------------------------------------------------------------------
# Result assembly (§6.3)
# --------------------------------------------------------------------------------------
def _context_info(run: models.ReviewRun) -> ContextInfo:
    """S2 records its accounting in the config snapshot; absent until the stage has run."""
    snapshot = dict(run.model_config_snapshot or {})
    context = snapshot.get("context")
    if not isinstance(context, dict):
        return ContextInfo(truncated=run.context_truncated)
    excluded = context.get("excluded_reasons")
    return ContextInfo(
        files_changed=int(context.get("files_changed", 0)),
        files_reviewed=int(context.get("files_reviewed", 0)),
        files_excluded=int(context.get("files_excluded", 0)),
        excluded_reasons=(
            {str(path): str(reason) for path, reason in excluded.items()}
            if isinstance(excluded, dict)
            else {}
        ),
        truncated=run.context_truncated,
    )


def _gate_info(
    run: models.ReviewRun, blocking_ids: Sequence[str], settings: Settings
) -> GateInfo | None:
    if run.gate_conclusion is None:
        return None
    conclusion = cast(GateConclusionName, run.gate_conclusion)
    return GateInfo(
        conclusion=conclusion,
        reason=_gate_reason(conclusion, blocking_ids),
        delivery=cast(GateDeliveryName | None, run.gate_delivery),
        context_name=settings.GATE_CONTEXT_NAME,
        blocking_finding_ids=list(blocking_ids),
    )


def _gate_reason(conclusion: GateConclusionName, blocking_ids: Sequence[str]) -> str:
    """Why the gate is what it is, in one sentence — the reader is a human on a PR."""
    if conclusion == "failure":
        count = len(blocking_ids)
        subject = "1 finding carries" if count == 1 else f"{count} findings carry"
        return f"{subject} a repro test that passes at base and fails at head."
    if conclusion == "neutral":
        return "Nothing could be executed in this run, so nothing is claimed or blocked."
    return "No finding was both proven by execution and severe enough to block."


def _delivery_info(
    run: models.ReviewRun, findings: Sequence[models.Finding]
) -> DeliveryInfo | None:
    if run.delivery_status is None:
        return None
    published = [
        finding
        for finding in findings
        if finding.status == models.FindingStatus.PUBLISHED.value
    ]
    breakdown = LadderBreakdown(
        inline_exact=_rung(published, models.DeliveryMode.INLINE_EXACT),
        inline_nearest=_rung(published, models.DeliveryMode.INLINE_NEAREST),
        file_level=_rung(published, models.DeliveryMode.FILE_LEVEL),
        summary_only=_rung(published, models.DeliveryMode.SUMMARY_ONLY),
    )
    return DeliveryInfo(
        status=cast(DeliveryStatusName, run.delivery_status),
        github_review_id=run.github_review_id,
        # A comment that exists on GitHub has an id; a degraded run reports 0 here and
        # still shows where every finding would have landed (E17).
        comments_posted=sum(1 for finding in findings if finding.github_comment_id),
        ladder_breakdown=breakdown,
    )


def _rung(findings: Sequence[models.Finding], mode: models.DeliveryMode) -> int:
    return sum(1 for finding in findings if finding.delivery_mode == mode.value)


def _duration_seconds(run: models.ReviewRun) -> float | None:
    if run.started_at is None or run.finished_at is None:
        return None
    return (as_utc(run.finished_at) - as_utc(run.started_at)).total_seconds()


def _seconds_since(moment: datetime | None) -> int | None:
    if moment is None:
        return None
    return max(0, int((utcnow() - as_utc(moment)).total_seconds()))


def _default_pr_url(target: ReviewTarget) -> str:
    return f"https://github.com/{target.owner}/{target.name}/pull/{target.number}"
