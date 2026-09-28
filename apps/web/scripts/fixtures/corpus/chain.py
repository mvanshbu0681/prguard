"""The tenant's audit chain — ``audit.append``'s arithmetic, over the whole simulated history.

``audit.append`` allocates ``seq`` as max+1 under a per-tenant lock and hashes
``prev_hash + canonical_json({tenant_id, seq, event_type, actor_type, actor_id, payload,
created_at})``. Here the events of every run and every human decision are put in the order
they happened, numbered from 1 without gaps, and hashed by ``audit.compute_event_hash`` itself.
``audit.verify_chain`` then re-derives every hash and every link, with ``contiguous=True``
because this is the unfiltered chain.
"""

from __future__ import annotations

from collections.abc import Sequence

from corpus.backend import TENANT_ID, audit, models
from corpus.rng import stream, uuid4
from corpus.simulate import PendingEvent


def build(pending: Sequence[PendingEvent]) -> list[models.AuditEvent]:
    ordered = sorted(pending, key=lambda event: (event.at, event.order))
    events: list[models.AuditEvent] = []
    prev_hash: str | None = None
    for seq, item in enumerate(ordered, start=1):
        event_hash = audit.compute_event_hash(
            prev_hash=prev_hash,
            tenant_id=TENANT_ID,
            seq=seq,
            event_type=item.event_type,
            actor_type=item.actor_type,
            actor_id=item.actor_id,
            payload=item.payload,
            created_at=item.at,
        )
        events.append(
            models.AuditEvent(
                id=uuid4(stream(f"event:{seq}")),
                tenant_id=TENANT_ID,
                seq=seq,
                review_run_id=item.review_run_id,
                finding_id=item.finding_id,
                actor_type=item.actor_type,
                actor_id=item.actor_id,
                event_type=item.event_type,
                payload=item.payload,
                prev_hash=prev_hash,
                event_hash=event_hash,
                created_at=item.at,
            )
        )
        prev_hash = event_hash
    verification = audit.verify_chain(events, contiguous=True)
    if not verification.verified:
        raise AssertionError(f"the generated chain does not verify: broken at {verification.broken_at_seq}")
    return events


def verify(events: Sequence[models.AuditEvent]) -> audit.ChainVerification:
    return audit.verify_chain(events, contiguous=True)
