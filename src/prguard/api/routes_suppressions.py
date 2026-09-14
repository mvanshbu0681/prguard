"""POST /v1/findings/{id}/suppress, GET/DELETE /v1/suppressions (spec §6.6–6.7).

The ledger is the human half of the governance rail: the gate is machine-decided, and this
is where a person overrules it *on the record*. Three properties are load-bearing.

* **A reason is mandatory** (§6.6). A ledger without reasons is not evidence.
* **Nothing is ever deleted** (§5.1). `DELETE` writes `revoked_at`; the row stays, and both
  the write and the revoke land in the audit chain.
* **Suppression outranks proof** (E29). Suppressing is a human decision, and the caller is
  recorded so the decision has an owner.

`created_by` `[ASSUMED]`: auth is one static bearer token (§11.2 assumption 12), so there is
no user identity to read. The optional `X-Actor-Id` header names the human; absent, the row
records `api`.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Annotated, Any, cast

import sqlalchemy as sa
from fastapi import APIRouter, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.api.deps import (
    RequireBearer,
    SessionDep,
    SettingsDep,
    TenantScope,
    TenantScopeDep,
)
from prguard.api.errors import ErrorCode, PRGuardError, request_id_of
from prguard.api.pagination import decode_cursor, encode_cursor
from prguard.api.schemas import (
    AffectedFindings,
    Category,
    PageInfo,
    SuppressionCreated,
    SuppressionItem,
    SuppressionList,
    SuppressionScopeName,
    SuppressionTotals,
    SuppressRequest,
)
from prguard.core import audit
from prguard.core.severity import is_blocking
from prguard.core.types import Band, FindingStatus, ProofStatus
from prguard.db import models
from prguard.db.base import as_utc, new_uuid, utcnow

router = APIRouter(prefix="/v1", tags=["suppressions"])

#: §6.7 shares §6.5's paging caps.
SUPPRESSION_LIMIT_MAX = 200
SUPPRESSION_LIMIT_DEFAULT = 50

#: `[ASSUMED]` — the header a caller uses to name the human behind a suppression.
ACTOR_HEADER = "X-Actor-Id"
DEFAULT_ACTOR = "api"


@router.post(
    "/findings/{finding_id}/suppress",
    status_code=status.HTTP_201_CREATED,
    response_model=SuppressionCreated,
    dependencies=[RequireBearer],
    summary="Suppress a finding (§6.6)",
)
async def suppress_finding(
    finding_id: str,
    body: SuppressRequest,
    request: Request,
    session: SessionDep,
    scope: TenantScopeDep,
    settings: SettingsDep,
    x_actor_id: Annotated[str | None, Header(alias=ACTOR_HEADER)] = None,
) -> SuppressionCreated:
    finding = await _load_finding(session, scope, finding_id)
    fingerprint = (
        await session.get(models.FindingFingerprint, finding.fingerprint_id)
        if finding.fingerprint_id
        else None
    )
    run = await session.get(models.ReviewRun, finding.review_run_id)
    pull_request = (
        await session.get(models.PullRequest, run.pull_request_id) if run is not None else None
    )

    suppression = models.Suppression(
        id=new_uuid(),
        tenant_id=scope.tenant_id,
        repository_id=pull_request.repository_id if pull_request is not None else None,
        fingerprint_id=finding.fingerprint_id,
        scope=body.scope,
        match_path=_match_path_for(body.scope, body.match_path, finding),
        match_rule_key=finding.rule_key,
        reason=body.reason.strip(),
        created_by=x_actor_id or DEFAULT_ACTOR,
        source=models.SuppressionSource.HUMAN_API.value,
        expires_at=as_utc(body.expires_at) if body.expires_at is not None else None,
        revoked_at=None,
        created_at=utcnow(),
    )
    session.add(suppression)
    await session.flush()

    # The finding is suppressed, and the ledger row is why (§6.6 side effects).
    finding.status = models.FindingStatus.SUPPRESSED.value
    finding.suppression_id = suppression.id
    finding.blocking = is_blocking(
        proof_status=cast("ProofStatus", finding.proof_status),
        band=cast("Band", finding.severity_band or "info"),
        language=finding.language or "",
        status=cast("FindingStatus", finding.status),
        block_min_severity=settings.BLOCK_MIN_SEVERITY,
    )
    session.add(
        models.FindingOutcome(
            id=new_uuid(),
            tenant_id=scope.tenant_id,
            finding_id=finding.id,
            fingerprint_id=finding.fingerprint_id,
            # An explicit suppression is a dismissal — §11.2 assumption 16, and the input
            # to `/v1/accuracy.human_dismissal_rate`.
            outcome=models.OutcomeKind.DISMISSED.value,
            detected_at=utcnow(),
            evidence={"suppression_id": suppression.id, "reason": suppression.reason},
        )
    )
    affected = await _affected_findings(session, scope, finding)

    await audit.append(
        session,
        tenant_id=scope.tenant_id,
        event_type=models.AuditEventType.SUPPRESSION_CREATED,
        actor_type=models.ActorType.HUMAN,
        actor_id=suppression.created_by,
        review_run_id=finding.review_run_id,
        finding_id=finding.id,
        payload={
            "suppression_id": suppression.id,
            "scope": suppression.scope,
            "match_path": suppression.match_path,
            "reason": suppression.reason,
            "expires_at": (
                as_utc(suppression.expires_at).isoformat()
                if suppression.expires_at is not None
                else None
            ),
        },
        request_id=request_id_of(request),
    )

    return SuppressionCreated(
        suppression_id=suppression.id,
        fingerprint=fingerprint.fingerprint if fingerprint is not None else None,
        scope=cast(SuppressionScopeName, suppression.scope),
        match_path=suppression.match_path,
        reason=suppression.reason,
        created_by=suppression.created_by,
        source=models.SuppressionSource.HUMAN_API.value,
        expires_at=suppression.expires_at,
        revoked_at=None,
        affected_findings=affected,
        created_at=suppression.created_at,
    )


@router.get("/suppressions", response_model=SuppressionList, summary="The ledger (§6.7)")
async def list_suppressions(
    session: SessionDep,
    scope: TenantScopeDep,
    repository: Annotated[str | None, Query(description="`owner/name`")] = None,
    suppression_scope: Annotated[SuppressionScopeName | None, Query(alias="scope")] = None,
    active: Annotated[bool, Query()] = True,
    fingerprint: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=SUPPRESSION_LIMIT_MAX)] = SUPPRESSION_LIMIT_DEFAULT,
    cursor: Annotated[str | None, Query()] = None,
) -> SuppressionList:
    statement = scope.apply(sa.select(models.Suppression))
    if suppression_scope is not None:
        statement = statement.where(models.Suppression.scope == suppression_scope)
    if fingerprint is not None:
        statement = statement.where(
            models.Suppression.fingerprint_id.in_(
                sa.select(models.FindingFingerprint.id).where(
                    models.FindingFingerprint.fingerprint == fingerprint
                )
            )
        )
    if repository is not None:
        owner, _, name = repository.partition("/")
        statement = statement.where(
            models.Suppression.repository_id.in_(
                sa.select(models.Repository.id).where(
                    models.Repository.owner == owner, models.Repository.name == name
                )
            )
        )

    # Totals describe the same slice of the ledger *before* the `active` filter, so a
    # dashboard can say "1 active, 1 expired, 1 revoked" from one request. Counted in
    # Python over the tenant's ledger rather than in SQL, so that `_is_active` stays the
    # single definition of "active" — three hand-written COUNT predicates would be faster
    # and would eventually disagree with it.
    totals = _totals(list((await session.execute(statement)).scalars().all()))

    if active:
        now = utcnow()
        statement = statement.where(
            models.Suppression.revoked_at.is_(None),
            sa.or_(
                models.Suppression.expires_at.is_(None),
                models.Suppression.expires_at > now,
            ),
        )
    ordered = statement.order_by(
        models.Suppression.created_at.desc(), models.Suppression.id.desc()
    )
    if cursor is not None:
        ordered = ordered.where(await _cursor_predicate(session, scope, cursor))

    found = list((await session.execute(ordered.limit(limit + 1))).scalars().all())
    has_more = len(found) > limit
    page = found[:limit]

    return SuppressionList(
        items=await _render(session, page),
        page=PageInfo(
            limit=limit,
            next_cursor=encode_cursor({"id": page[-1].id}) if has_more and page else None,
            has_more=has_more,
        ),
        totals=totals,
    )


@router.delete(
    "/suppressions/{suppression_id}",
    response_model=SuppressionItem,
    dependencies=[RequireBearer],
    summary="Revoke a suppression — never delete it (§6.7)",
)
async def revoke_suppression(
    suppression_id: str,
    request: Request,
    session: SessionDep,
    scope: TenantScopeDep,
    x_actor_id: Annotated[str | None, Header(alias=ACTOR_HEADER)] = None,
) -> SuppressionItem:
    found = (
        (
            await session.execute(
                scope.apply(sa.select(models.Suppression)).where(
                    models.Suppression.id == suppression_id
                )
            )
        )
        .scalars()
        .first()
    )
    if found is None:
        raise PRGuardError(
            ErrorCode.SUPPRESSION_NOT_FOUND, details={"suppression_id": suppression_id}
        )

    if found.revoked_at is None:
        found.revoked_at = utcnow()
        await audit.append(
            session,
            tenant_id=scope.tenant_id,
            event_type=models.AuditEventType.SUPPRESSION_REVOKED,
            actor_type=models.ActorType.HUMAN,
            actor_id=x_actor_id or DEFAULT_ACTOR,
            payload={"suppression_id": found.id, "scope": found.scope},
            request_id=request_id_of(request),
        )

    rendered = await _render(session, [found])
    return rendered[0]


def _match_path_for(
    scope: SuppressionScopeName, supplied: str | None, finding: models.Finding
) -> str | None:
    """The path this ledger row is written against (§6.6, `core.suppression._scope_matches`).

    §6.6 makes `match_path` "required for `pattern`, ignored otherwise", so the request body
    is only consulted for `pattern`. `file` still *needs* a path — `_scope_matches` compares
    one, and fails closed without it — and the only honest source for it is the finding the
    human was looking at when they pressed the button. Storing `None` there made `scope="file"`
    permanently inert: the decision was lost on the next run and a previously-suppressed proven
    finding blocked the merge again.
    """
    if scope == "pattern":
        return supplied
    if scope == "file":
        return finding.file_path
    return None


async def _load_finding(
    session: AsyncSession, scope: TenantScope, finding_id: str
) -> models.Finding:
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
    return found


async def _affected_findings(
    session: AsyncSession, scope: TenantScope, finding: models.Finding
) -> AffectedFindings:
    """How far this decision reaches, split by "this run" and "everything before it".

    This is the ledger's own reckoning and it is deliberately narrow: same fingerprint when
    the finding has one, else the same rule in the same file. The *enforcement* matrix lives
    in `core.suppression.matches` (S6) — these two numbers are a report, not a gate.
    """
    statement = scope.apply(sa.select(models.Finding.review_run_id))
    if finding.fingerprint_id:
        statement = statement.where(models.Finding.fingerprint_id == finding.fingerprint_id)
    else:
        statement = statement.where(
            models.Finding.rule_key == finding.rule_key,
            models.Finding.file_path == finding.file_path,
        )
    run_ids = list((await session.execute(statement)).scalars().all())
    this_run = sum(1 for run_id in run_ids if run_id == finding.review_run_id)
    return AffectedFindings(this_run=this_run, historical=len(run_ids) - this_run)


async def _render(
    session: AsyncSession, suppressions: Sequence[models.Suppression]
) -> list[SuppressionItem]:
    if not suppressions:
        return []
    usage = await _usage(session, [row.id for row in suppressions])
    fingerprints = await _fingerprints(
        session, [row.fingerprint_id for row in suppressions if row.fingerprint_id]
    )
    now = utcnow()
    items: list[SuppressionItem] = []
    for row in suppressions:
        fingerprint = fingerprints.get(row.fingerprint_id or "")
        count, last_matched_at = usage.get(row.id, (0, None))
        items.append(
            SuppressionItem(
                suppression_id=row.id,
                scope=cast(SuppressionScopeName, row.scope),
                match_path=row.match_path,
                rule_key=fingerprint.rule_key if fingerprint is not None else row.match_rule_key,
                category=(
                    cast(Category, fingerprint.category) if fingerprint is not None else None
                ),
                reason=row.reason,
                created_by=row.created_by,
                source=cast(Any, row.source),
                active=_is_active(row, now),
                expires_at=row.expires_at,
                revoked_at=row.revoked_at,
                suppressed_count=count,
                last_matched_at=last_matched_at,
                created_at=row.created_at,
            )
        )
    return items


def _is_active(row: models.Suppression, now: datetime) -> bool:
    if row.revoked_at is not None:
        return False
    return row.expires_at is None or as_utc(row.expires_at) > now


def _totals(rows: Sequence[models.Suppression]) -> SuppressionTotals:
    now = utcnow()
    revoked = sum(1 for row in rows if row.revoked_at is not None)
    expired = sum(
        1
        for row in rows
        if row.revoked_at is None
        and row.expires_at is not None
        and as_utc(row.expires_at) <= now
    )
    return SuppressionTotals(
        active=len(rows) - revoked - expired, expired=expired, revoked=revoked
    )


async def _usage(
    session: AsyncSession, suppression_ids: Sequence[str]
) -> dict[str, tuple[int, datetime | None]]:
    """`suppressed_count` and `last_matched_at`, straight from the findings they touched."""
    statement = (
        sa.select(
            models.Finding.suppression_id,
            sa.func.count(),
            sa.func.max(models.Finding.created_at),
        )
        .where(models.Finding.suppression_id.in_(suppression_ids))
        .group_by(models.Finding.suppression_id)
    )
    found = (await session.execute(statement)).all()
    return {
        str(suppression_id): (int(total), _as_datetime(last_seen))
        for suppression_id, total, last_seen in found
    }


def _as_datetime(value: Any) -> datetime | None:
    """SQLite returns `max(created_at)` as a string; Postgres returns a datetime."""
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


async def _fingerprints(
    session: AsyncSession, fingerprint_ids: Sequence[str]
) -> dict[str, models.FindingFingerprint]:
    if not fingerprint_ids:
        return {}
    statement = sa.select(models.FindingFingerprint).where(
        models.FindingFingerprint.id.in_(set(fingerprint_ids))
    )
    found = (await session.execute(statement)).scalars().all()
    return {row.id: row for row in found}


async def _cursor_predicate(
    session: AsyncSession, scope: TenantScope, cursor: str
) -> sa.ColumnElement[bool]:
    cursor_id = str(decode_cursor(cursor).get("id", ""))
    anchor = (
        (
            await session.execute(
                scope.apply(sa.select(models.Suppression)).where(
                    models.Suppression.id == cursor_id
                )
            )
        )
        .scalars()
        .first()
    )
    if anchor is None:
        raise PRGuardError(
            ErrorCode.VALIDATION_ERROR,
            "That cursor points at a suppression this tenant cannot see.",
            details={"cursor": cursor},
        )
    return sa.or_(
        models.Suppression.created_at < anchor.created_at,
        sa.and_(
            models.Suppression.created_at == anchor.created_at,
            models.Suppression.id < anchor.id,
        ),
    )
