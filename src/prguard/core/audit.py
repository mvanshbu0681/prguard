"""The audit chain — append-only writer, hash chain and read-time verifier (spec §5.1, §6.8).

Every stage boundary and every human decision lands here, and the chain is the ground truth
for "what did the AI do" (§4.1). Two properties make it evidence rather than a log:

* **Append-only.** There is no UPDATE or DELETE path in this module, and none anywhere else
  in the codebase. A mistake is corrected by appending, never by editing.
* **Tamper-evident.** `event_hash = sha256(prev_hash + canonical_json(tenant_id, seq,
  event_type, actor_*, payload, created_at))`, recomputed on every read. A mutated row makes
  :func:`verify_chain` return `verified=False` with the `seq` of the first broken link, and
  `GET /v1/audit` serves that verdict rather than hiding it.

**E30, the concurrency escape hatch.** `seq` is monotonic per tenant and is allocated by
reading the current maximum, so two writers racing would allocate the same number. Spec R10
authorises serialising audit writes through a single writer on SQLite rather than spending
the night on advisory locks: :func:`append` therefore holds a per-tenant lock across
read-max → insert → commit. The unique `(tenant_id, seq)` index is the backstop — a
cross-process race fails loudly instead of corrupting the chain.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from weakref import WeakKeyDictionary

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.db.base import as_utc, new_uuid, utcnow
from prguard.db.models import ActorType, AuditEvent, AuditEventType

#: One lock per (event loop, tenant), held across the whole allocate-and-commit window
#: (E30, spec R10). The loop is part of the key because an `asyncio.Lock` binds to the loop
#: it first contends on and raises on any other one: the service has a single loop, but a
#: test suite builds a fresh loop per test and the seeded `default` tenant's id never
#: changes, so a process-wide lock would be reused across loops and blow up under
#: contention. Entries die with their loop.
_TENANT_LOCKS: WeakKeyDictionary[asyncio.AbstractEventLoop, dict[str, asyncio.Lock]] = (
    WeakKeyDictionary()
)


@dataclass(frozen=True)
class ChainVerification:
    """What `GET /v1/audit` reports under `chain` (§6.8)."""

    verified: bool
    checked: int
    first_seq: int | None = None
    last_seq: int | None = None
    #: The `seq` of the *first* link that failed to recompute; `None` when intact.
    broken_at_seq: int | None = None


def canonical_json(document: Mapping[str, Any]) -> str:
    """Key-sorted, whitespace-free JSON — the only serialisation the hash ever sees."""
    return json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_event_hash(
    *,
    prev_hash: str | None,
    tenant_id: str,
    seq: int,
    event_type: str,
    actor_type: str,
    actor_id: str | None,
    payload: Mapping[str, Any],
    created_at: datetime,
) -> str:
    document: dict[str, Any] = {
        "tenant_id": tenant_id,
        "seq": seq,
        "event_type": event_type,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "payload": dict(payload),
        # Normalised, because SQLite hands the same instant back without its tzinfo.
        "created_at": as_utc(created_at).isoformat(),
    }
    material = (prev_hash or "") + canonical_json(document)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def event_hash_of(event: AuditEvent) -> str:
    """Recompute a stored row's hash from the fields the hash covers."""
    return compute_event_hash(
        prev_hash=event.prev_hash,
        tenant_id=event.tenant_id,
        seq=event.seq,
        event_type=event.event_type,
        actor_type=event.actor_type,
        actor_id=event.actor_id,
        payload=event.payload or {},
        created_at=event.created_at,
    )


def verify_chain(events: Sequence[AuditEvent], *, contiguous: bool = False) -> ChainVerification:
    """Recompute every hash in `events`, and the linkage of every adjacent pair.

    `events` is whatever the caller is serving — `GET /v1/audit` filters, so the page is
    not always contiguous. Linkage is therefore only asserted between rows that really are
    neighbours in the chain (`seq` + 1, same tenant); the per-row hash is always checked,
    and that alone catches a mutated payload, actor or timestamp.

    `contiguous=True` says the caller is serving an *unfiltered* window of one tenant's
    chain, where `seq` runs without gaps by construction. A missing `seq` is then not a
    filtered-out row but a **deleted** one — excising the `proof.executed` event is exactly
    the tamper an auditor looks for, and it leaves every surviving hash intact. Callers
    that filter must leave this off: there, a gap is the filter doing its job.
    """
    broken_at: int | None = None
    previous: AuditEvent | None = None
    for event in events:
        intact = event.event_hash == event_hash_of(event)
        if intact and previous is not None:
            if _are_neighbours(previous, event):
                intact = event.prev_hash == previous.event_hash
            elif contiguous:
                # Nothing was filtered out, so the row that held this `seq` is gone.
                intact = False
        if not intact:
            broken_at = event.seq
            break
        previous = event
    sequence_numbers = [event.seq for event in events]
    return ChainVerification(
        verified=broken_at is None,
        checked=len(events),
        first_seq=min(sequence_numbers) if sequence_numbers else None,
        last_seq=max(sequence_numbers) if sequence_numbers else None,
        broken_at_seq=broken_at,
    )


async def append(
    session: AsyncSession,
    *,
    tenant_id: str,
    event_type: AuditEventType,
    actor_type: ActorType,
    actor_id: str | None = None,
    payload: Mapping[str, Any] | None = None,
    review_run_id: str | None = None,
    finding_id: str | None = None,
    request_id: str | None = None,
) -> AuditEvent:
    """Append one event and commit it.

    The writer owns the transaction on purpose: a committed event is a fact, and holding
    the per-tenant lock across the commit is what makes the `seq` allocation safe (E30).
    Callers stage exactly the rows the event describes before calling, so the run and its
    `review.requested` land together or not at all.
    """
    body: dict[str, Any] = dict(payload or {})
    if request_id is not None:
        # §6.0: the request id is echoed in every audit event raised during that request.
        body["request_id"] = request_id

    # Write the caller's staged rows first. The docstring's contract is that a caller
    # stages exactly the rows the event describes and they land together -- but nothing
    # declares an ORM relationship from audit_events to review_runs, so SQLAlchemy's unit
    # of work does not know the dependency and is free to emit the event INSERT first.
    # On Postgres that is a ForeignKeyViolationError; SQLite never noticed because it does
    # not enforce foreign keys unless PRAGMA foreign_keys is on.
    await session.flush()

    async with _tenant_lock(tenant_id):
        previous = await _last_event(session, tenant_id)
        seq = 1 if previous is None else previous.seq + 1
        prev_hash = None if previous is None else previous.event_hash
        created_at = utcnow()
        event = AuditEvent(
            id=new_uuid(),
            tenant_id=tenant_id,
            seq=seq,
            review_run_id=review_run_id,
            finding_id=finding_id,
            actor_type=actor_type.value,
            actor_id=actor_id,
            event_type=event_type.value,
            payload=body,
            prev_hash=prev_hash,
            event_hash=compute_event_hash(
                prev_hash=prev_hash,
                tenant_id=tenant_id,
                seq=seq,
                event_type=event_type.value,
                actor_type=actor_type.value,
                actor_id=actor_id,
                payload=body,
                created_at=created_at,
            ),
            created_at=created_at,
        )
        session.add(event)
        await session.commit()
    return event


def _are_neighbours(previous: AuditEvent, event: AuditEvent) -> bool:
    return previous.tenant_id == event.tenant_id and event.seq == previous.seq + 1


def _tenant_lock(tenant_id: str) -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    per_loop = _TENANT_LOCKS.get(loop)
    if per_loop is None:
        per_loop = {}
        _TENANT_LOCKS[loop] = per_loop
    lock = per_loop.get(tenant_id)
    if lock is None:
        lock = asyncio.Lock()
        per_loop[tenant_id] = lock
    return lock


async def _last_event(session: AsyncSession, tenant_id: str) -> AuditEvent | None:
    statement = (
        sa.select(AuditEvent)
        .where(AuditEvent.tenant_id == tenant_id)
        .order_by(AuditEvent.seq.desc())
        .limit(1)
    )
    return (await session.execute(statement)).scalars().first()
