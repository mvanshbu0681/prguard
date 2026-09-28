"""GET /v1/findings, GET /v1/findings/{id} (spec §6.4–6.5).

This module also owns the **Finding object** itself (§6.4), because three endpoints serve
it: the two below and `/v1/reviews/{id}/result`. :func:`render_findings` is the one place
that turns rows into it, so the three can never drift apart.

Severity always ships with its `inputs` *and* the `weights` they were multiplied by (AC-5b,
§4.4). The weights come from the run's `model_config_snapshot` when it has them, so a run
stays explainable after someone retunes the config — that is the entire point of storing
the snapshot (§5.1).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Annotated, Any, cast

import sqlalchemy as sa
from fastapi import APIRouter, Query
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.api.deps import SessionDep, SettingsDep, TenantScope, TenantScopeDep
from prguard.api.errors import ErrorCode, PRGuardError
from prguard.api.pagination import decode_cursor, encode_cursor
from prguard.api.schemas import (
    Band,
    Category,
    DeliveryModeName,
    Finding,
    FindingDelivery,
    FindingHistory,
    FindingList,
    FindingLocation,
    FindingProof,
    FindingSeverity,
    FindingStatusName,
    FindingSuppression,
    FindingTotals,
    PageInfo,
    ProofExecution,
    ProofStatusName,
    SeverityInputs,
    SuppressionScopeName,
)
from prguard.config import Settings
from prguard.core.types import BAND_RANK, SEVERITY_INPUT_FIELDS
from prguard.db import models

router = APIRouter(prefix="/v1", tags=["findings"])

#: §6.5 — `limit` (≤200, default 50).
FINDING_LIMIT_MAX = 200
FINDING_LIMIT_DEFAULT = 50

#: Captured stdout/stderr is already truncated at `PROOF_OUTPUT_MAX_BYTES` before insert;
#: the API shows the *tail*, because that is where the failure signal is.
EXCERPT_MAX_CHARS = 2000


@router.get("/findings", response_model=FindingList, summary="List findings (§6.5)")
async def list_findings(
    session: SessionDep,
    scope: TenantScopeDep,
    settings: SettingsDep,
    review_id: Annotated[str | None, Query()] = None,
    repository: Annotated[str | None, Query(description="`owner/name`")] = None,
    pr_number: Annotated[int | None, Query()] = None,
    fingerprint: Annotated[str | None, Query()] = None,
    status: Annotated[FindingStatusName | None, Query()] = None,
    severity_min: Annotated[Band | None, Query()] = None,
    blocking: Annotated[bool | None, Query()] = None,
    proof_status: Annotated[ProofStatusName | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=FINDING_LIMIT_MAX)] = FINDING_LIMIT_DEFAULT,
    cursor: Annotated[str | None, Query()] = None,
) -> FindingList:
    # The tenant predicate is applied before any join: `filter_by` binds to whatever entity
    # is current, and after a join that is no longer `findings`.
    statement = scope.apply(sa.select(models.Finding))
    if review_id is not None:
        statement = statement.where(models.Finding.review_run_id == review_id)
    if fingerprint is not None:
        statement = statement.where(
            models.Finding.fingerprint_id.in_(
                sa.select(models.FindingFingerprint.id).where(
                    models.FindingFingerprint.fingerprint == fingerprint
                )
            )
        )
    if status is not None:
        statement = statement.where(models.Finding.status == status)
    if proof_status is not None:
        statement = statement.where(models.Finding.proof_status == proof_status)
    if blocking is not None:
        statement = statement.where(models.Finding.blocking.is_(blocking))
    if severity_min is not None:
        statement = statement.where(models.Finding.severity_band.in_(_bands_at_least(severity_min)))
    if repository is not None or pr_number is not None:
        statement = statement.where(
            models.Finding.review_run_id.in_(_run_ids_for(repository, pr_number))
        )

    matched = await session.scalar(
        sa.select(sa.func.count()).select_from(statement.subquery())
    )
    ordered = statement.order_by(models.Finding.created_at.desc(), models.Finding.id.desc())
    if cursor is not None:
        ordered = ordered.where(await _finding_cursor_predicate(session, scope, cursor))

    found = list((await session.execute(ordered.limit(limit + 1))).scalars().all())
    has_more = len(found) > limit
    page = found[:limit]

    return FindingList(
        items=await render_findings(session, page, settings),
        page=PageInfo(
            limit=limit,
            next_cursor=encode_cursor({"id": page[-1].id}) if has_more and page else None,
            has_more=has_more,
        ),
        totals=FindingTotals(matched=int(matched or 0)),
    )


@router.get("/findings/{finding_id}", response_model=Finding, summary="One finding (§6.4)")
async def get_finding(
    finding_id: str,
    session: SessionDep,
    scope: TenantScopeDep,
    settings: SettingsDep,
) -> Finding:
    found = (
        (
            await session.execute(
                scope.apply(sa.select(models.Finding)).where(models.Finding.id == finding_id)
            )
        )
        .scalars()
        .first()
    )
    if found is None:
        raise PRGuardError(ErrorCode.FINDING_NOT_FOUND, details={"finding_id": finding_id})
    rendered = await render_findings(session, [found], settings)
    return rendered[0]


async def render_findings(
    session: AsyncSession,
    findings: Sequence[models.Finding],
    settings: Settings,
) -> list[Finding]:
    """Build the §6.4 object for each row, loading every related table in bulk."""
    if not findings:
        return []
    artifacts = await _latest_artifacts(session, [row.id for row in findings])
    fingerprints = await _by_id(
        session, models.FindingFingerprint, [row.fingerprint_id for row in findings]
    )
    suppressions = await _by_id(
        session, models.Suppression, [row.suppression_id for row in findings]
    )
    runs = await _by_id(session, models.ReviewRun, [row.review_run_id for row in findings])
    return [
        _finding_object(
            row,
            artifact=artifacts.get(row.id),
            fingerprint=fingerprints.get(row.fingerprint_id or ""),
            suppression=suppressions.get(row.suppression_id or ""),
            run=runs.get(row.review_run_id),
            settings=settings,
        )
        for row in findings
    ]


def _finding_object(
    finding: models.Finding,
    *,
    artifact: models.ProofArtifact | None,
    fingerprint: models.FindingFingerprint | None,
    suppression: models.Suppression | None,
    run: models.ReviewRun | None,
    settings: Settings,
) -> Finding:
    return Finding(
        id=finding.id,
        review_id=finding.review_run_id,
        fingerprint=fingerprint.fingerprint if fingerprint is not None else None,
        specialist=finding.specialist,
        category=cast(Category, finding.category),
        rule_key=finding.rule_key,
        title=finding.title,
        body_markdown=finding.body_markdown,
        location=FindingLocation(
            file_path=finding.file_path,
            start_line=finding.start_line,
            end_line=finding.end_line,
            side=cast(Any, finding.side),
            language=finding.language,
            symbol_path=fingerprint.symbol_path if fingerprint is not None else None,
        ),
        severity=_severity(finding, run=run, settings=settings),
        proof=_proof(finding, artifact),
        status=cast(FindingStatusName, finding.status),
        blocking=finding.blocking,
        delivery=FindingDelivery(
            mode=cast(DeliveryModeName, finding.delivery_mode),
            delivered_line=finding.delivered_line,
            github_comment_id=finding.github_comment_id,
        ),
        history=FindingHistory(
            occurrence_count=fingerprint.occurrence_count if fingerprint is not None else 1,
            first_seen_run_id=fingerprint.first_seen_run_id if fingerprint is not None else None,
            previously_addressed=fingerprint.addressed_count if fingerprint is not None else 0,
            previously_dismissed=fingerprint.dismissed_count if fingerprint is not None else 0,
        ),
        suppression=(
            None
            if suppression is None
            else FindingSuppression(
                suppression_id=suppression.id,
                scope=cast(SuppressionScopeName, suppression.scope),
                reason=suppression.reason,
                created_by=suppression.created_by,
                expires_at=suppression.expires_at,
            )
        ),
        created_at=finding.created_at,
    )


def _severity(
    finding: models.Finding,
    *,
    run: models.ReviewRun | None,
    settings: Settings,
) -> FindingSeverity | None:
    """`None` until S5 has scored the finding — never a manufactured band."""
    if finding.severity_band is None:
        return None
    stored: dict[str, Any] = dict(finding.severity_inputs or {})
    notes = stored.get("notes")
    return FindingSeverity(
        band=cast(Band, finding.severity_band),
        score=float(finding.severity_score or 0.0),
        inputs=SeverityInputs(
            **{name: float(stored.get(name, 0.0)) for name in SEVERITY_INPUT_FIELDS}
        ),
        weights=_weights(stored, run=run, settings=settings),
        explanation=str(stored.get("explanation", "")),
        llm_severity_hint=finding.llm_severity_hint,
        notes=[str(note) for note in notes] if isinstance(notes, list) else [],
    )


def _weights(
    stored: dict[str, Any],
    *,
    run: models.ReviewRun | None,
    settings: Settings,
) -> dict[str, float]:
    """The weights this finding was actually scored with, newest evidence first."""
    snapshot = (run.model_config_snapshot or {}) if run is not None else {}
    for candidate in (stored.get("weights"), snapshot.get("severity_weights")):
        if isinstance(candidate, dict) and candidate:
            return {str(name): float(value) for name, value in candidate.items()}
    return dict(settings.SEVERITY_WEIGHTS)


def _proof(finding: models.Finding, artifact: models.ProofArtifact | None) -> FindingProof:
    if artifact is None:
        return FindingProof(status=cast(ProofStatusName, finding.proof_status))
    return FindingProof(
        status=cast(ProofStatusName, finding.proof_status),
        runner=cast(Any, artifact.runner),
        isolation=cast(Any, artifact.isolation),
        baseline_mode=cast(Any, artifact.baseline_mode),
        test_file_path=artifact.test_file_path,
        test_code=artifact.test_code,
        command=artifact.command,
        base=ProofExecution(
            exit_code=artifact.base_exit_code,
            excerpt=_excerpt(artifact.base_stdout, artifact.base_stderr),
        ),
        head=ProofExecution(
            exit_code=artifact.head_exit_code,
            excerpt=_excerpt(artifact.head_stdout, artifact.head_stderr),
        ),
        duration_ms=artifact.duration_ms,
        deps_install_ok=artifact.deps_install_ok,
    )


def _excerpt(stdout: str | None, stderr: str | None) -> str | None:
    text = "\n".join(part for part in (stdout, stderr) if part)
    if not text:
        return None
    return text[-EXCERPT_MAX_CHARS:]


def _bands_at_least(minimum: Band) -> list[str]:
    floor = BAND_RANK[minimum]
    return [band for band, rank in BAND_RANK.items() if rank >= floor]


def _run_ids_for(repository: str | None, pr_number: int | None) -> sa.Select[tuple[str]]:
    """Run ids for `owner/name` and/or a PR number — the §6.5 cross-table filters."""
    statement = sa.select(models.ReviewRun.id).join(
        models.PullRequest, models.PullRequest.id == models.ReviewRun.pull_request_id
    )
    if pr_number is not None:
        statement = statement.where(models.PullRequest.number == pr_number)
    if repository is not None:
        owner, _, name = repository.partition("/")
        statement = statement.join(
            models.Repository, models.Repository.id == models.PullRequest.repository_id
        ).where(models.Repository.owner == owner, models.Repository.name == name)
    return statement


async def _finding_cursor_predicate(
    session: AsyncSession, scope: TenantScope, cursor: str
) -> sa.ColumnElement[bool]:
    """Keyset, not offset: `(created_at, id)` strictly below the cursor row's pair."""
    cursor_id = str(decode_cursor(cursor).get("id", ""))
    anchor = (
        (
            await session.execute(
                scope.apply(sa.select(models.Finding)).where(models.Finding.id == cursor_id)
            )
        )
        .scalars()
        .first()
    )
    if anchor is None:
        raise PRGuardError(
            ErrorCode.VALIDATION_ERROR,
            "That cursor points at a finding this tenant cannot see.",
            details={"cursor": cursor},
        )
    return sa.or_(
        models.Finding.created_at < anchor.created_at,
        sa.and_(
            models.Finding.created_at == anchor.created_at,
            models.Finding.id < anchor.id,
        ),
    )


async def _latest_artifacts(
    session: AsyncSession, finding_ids: Sequence[str]
) -> dict[str, models.ProofArtifact]:
    """One artifact per finding — the newest, because retries append rather than replace."""
    statement = (
        sa.select(models.ProofArtifact)
        .where(models.ProofArtifact.finding_id.in_(finding_ids))
        .order_by(models.ProofArtifact.created_at.asc())
    )
    found = (await session.execute(statement)).scalars().all()
    return {artifact.finding_id: artifact for artifact in found}


async def _by_id[RowT: models.Base](
    session: AsyncSession,
    model: type[RowT],
    ids: Iterable[str | None],
) -> dict[str, RowT]:
    wanted = {value for value in ids if value}
    if not wanted:
        return {}
    statement = sa.select(model).where(model.id.in_(wanted))  # type: ignore[attr-defined]
    found = (await session.execute(statement)).scalars().all()
    return {row.id: row for row in found}  # type: ignore[attr-defined]
