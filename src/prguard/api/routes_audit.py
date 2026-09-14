"""GET /v1/audit (spec §6.8).

The trail is served in chain order (`seq` ascending) with `chain.verified` recomputed from
the rows themselves on every read. A broken chain is still served — hiding it would defeat
the purpose of having one.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

import sqlalchemy as sa
from fastapi import APIRouter, Query

from prguard.api.deps import SessionDep, TenantScopeDep
from prguard.api.pagination import decode_cursor, encode_cursor
from prguard.api.schemas import AuditChain, AuditItem, AuditList, PageInfo
from prguard.core import audit
from prguard.db.base import as_utc
from prguard.db.models import AuditEvent

router = APIRouter(prefix="/v1", tags=["audit"])

#: §6.8 — `limit` (≤500).
AUDIT_LIMIT_MAX = 500


@router.get("/audit", response_model=AuditList, summary="The audit trail (§6.8)")
async def list_audit_events(
    session: SessionDep,
    scope: TenantScopeDep,
    review_id: Annotated[str | None, Query()] = None,
    finding_id: Annotated[str | None, Query()] = None,
    event_type: Annotated[str | None, Query()] = None,
    actor_type: Annotated[Literal["ai", "human", "system"] | None, Query()] = None,
    since: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=AUDIT_LIMIT_MAX)] = AUDIT_LIMIT_MAX,
    cursor: Annotated[str | None, Query()] = None,
) -> AuditList:
    statement = scope.apply(sa.select(AuditEvent)).order_by(AuditEvent.seq.asc())
    if review_id is not None:
        statement = statement.where(AuditEvent.review_run_id == review_id)
    if finding_id is not None:
        statement = statement.where(AuditEvent.finding_id == finding_id)
    if event_type is not None:
        statement = statement.where(AuditEvent.event_type == event_type)
    if actor_type is not None:
        statement = statement.where(AuditEvent.actor_type == actor_type)
    if since is not None:
        statement = statement.where(AuditEvent.created_at >= as_utc(since))
    if cursor is not None:
        statement = statement.where(AuditEvent.seq > _cursor_seq(cursor))

    found = list((await session.execute(statement.limit(limit + 1))).scalars().all())
    has_more = len(found) > limit
    events = found[:limit]
    chain = audit.verify_chain(events)

    return AuditList(
        items=[_audit_item(event) for event in events],
        chain=AuditChain(
            verified=chain.verified,
            checked=chain.checked,
            first_seq=chain.first_seq,
            last_seq=chain.last_seq,
            broken_at_seq=chain.broken_at_seq,
        ),
        page=PageInfo(
            limit=limit,
            next_cursor=encode_cursor({"seq": events[-1].seq}) if has_more and events else None,
            has_more=has_more,
        ),
    )


def _cursor_seq(cursor: str) -> int:
    value = decode_cursor(cursor).get("seq")
    return int(value) if isinstance(value, int | str) else 0


def _audit_item(event: AuditEvent) -> AuditItem:
    return AuditItem(
        seq=event.seq,
        event_type=event.event_type,
        # `actor_type` is constrained by a CheckConstraint, so the cast is safe.
        actor_type=event.actor_type,  # type: ignore[arg-type]
        actor_id=event.actor_id,
        review_id=event.review_run_id,
        finding_id=event.finding_id,
        payload=event.payload or {},
        event_hash=event.event_hash,
        prev_hash=event.prev_hash,
        created_at=event.created_at,
    )
