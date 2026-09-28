"""The audit trail and its hash chain — spec §5.1, §6.8, E30.

"Audit trail" without tamper-evidence is just a log (§11.2 assumption 15). The chain is
recomputed on every read, and a broken chain is *served* with `verified: false` rather than
hidden — hiding it would defeat the purpose.

T9 appended `::test_run_emits_complete_ordered_event_set` in wave 3 (plan §9.2): the ordering
of a *whole run*'s events needs the pipeline, which did not exist in that track.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
import respx
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.core import audit
from prguard.db import models
from prguard.db.models import ActorType, AuditEventType
from tests.conftest import RowFactory
from tests.integration.conftest import (
    make_pipeline,
    make_settings,
    mock_delivery,
    mock_pull_request,
    trigger_review,
)


async def _seed_chain(
    session: AsyncSession,
    tenant: models.Tenant,
    run: models.ReviewRun,
    finding: models.Finding,
) -> list[models.AuditEvent]:
    """The §6.8 example, in order: proposed → executed → evaluated."""
    return [
        await audit.append(
            session,
            tenant_id=tenant.id,
            event_type=AuditEventType.FINDING_PROPOSED,
            actor_type=ActorType.AI,
            actor_id="specialist:bugs:claude-sonnet-5",
            review_run_id=run.id,
            finding_id=finding.id,
            payload={"rule_key": "unguarded_none_arithmetic", "llm_severity_hint": "high"},
        ),
        await audit.append(
            session,
            tenant_id=tenant.id,
            event_type=AuditEventType.PROOF_EXECUTED,
            actor_type=ActorType.SYSTEM,
            actor_id="proof-runner:docker",
            review_run_id=run.id,
            finding_id=finding.id,
            payload={"outcome": "failing_as_expected", "base_exit_code": 0, "head_exit_code": 1},
        ),
        await audit.append(
            session,
            tenant_id=tenant.id,
            event_type=AuditEventType.GATE_EVALUATED,
            actor_type=ActorType.SYSTEM,
            actor_id="gate",
            review_run_id=run.id,
            payload={"conclusion": "failure", "blocking_finding_ids": [finding.id]},
        ),
    ]


# --------------------------------------------------------------------------------------
# core/audit.py — the writer
# --------------------------------------------------------------------------------------
async def test_seq_is_monotonic_per_tenant(
    session: AsyncSession, tenant_a: models.Tenant, tenant_b: models.Tenant
) -> None:
    first_a = await audit.append(
        session,
        tenant_id=tenant_a.id,
        event_type=AuditEventType.REVIEW_REQUESTED,
        actor_type=ActorType.HUMAN,
    )
    first_b = await audit.append(
        session,
        tenant_id=tenant_b.id,
        event_type=AuditEventType.REVIEW_REQUESTED,
        actor_type=ActorType.HUMAN,
    )
    second_a = await audit.append(
        session,
        tenant_id=tenant_a.id,
        event_type=AuditEventType.REVIEW_STARTED,
        actor_type=ActorType.SYSTEM,
    )

    assert (first_a.seq, second_a.seq) == (1, 2)
    assert first_b.seq == 1, "seq is monotonic *per tenant*"
    assert first_a.prev_hash is None
    assert second_a.prev_hash == first_a.event_hash
    assert second_a.event_hash != first_a.event_hash


async def test_event_hash_covers_the_documented_fields(
    session: AsyncSession, tenant_a: models.Tenant
) -> None:
    event = await audit.append(
        session,
        tenant_id=tenant_a.id,
        event_type=AuditEventType.REVIEW_REQUESTED,
        actor_type=ActorType.HUMAN,
        actor_id="api",
        payload={"pr_url": "https://github.com/octocat/hello-world/pull/42"},
    )

    assert len(event.event_hash) == 64
    assert event.event_hash == audit.event_hash_of(event)
    recomputed = audit.compute_event_hash(
        prev_hash=event.prev_hash,
        tenant_id=event.tenant_id,
        seq=event.seq,
        event_type=event.event_type,
        actor_type=event.actor_type,
        actor_id=event.actor_id,
        payload=event.payload,
        created_at=event.created_at,
    )
    assert recomputed == event.event_hash


async def test_request_id_is_echoed_into_the_event(
    session: AsyncSession, tenant_a: models.Tenant
) -> None:
    """§6.0: `request_id` is generated per request and echoed in every audit event."""
    event = await audit.append(
        session,
        tenant_id=tenant_a.id,
        event_type=AuditEventType.REVIEW_REQUESTED,
        actor_type=ActorType.HUMAN,
        payload={"pr_url": "octocat/hello-world#42"},
        request_id="01J9Z6Q2K7R8M4T0",
    )

    assert event.payload["request_id"] == "01J9Z6Q2K7R8M4T0"


async def test_concurrent_appends_keep_one_unbroken_chain(
    session_factory: async_sessionmaker[AsyncSession],
    session: AsyncSession,
    tenant_a: models.Tenant,
) -> None:
    """E30: two writers appending at once must not corrupt `seq` or the chain."""

    async def write(index: int) -> None:
        async with session_factory() as writer:
            await audit.append(
                writer,
                tenant_id=tenant_a.id,
                event_type=AuditEventType.REVIEW_STAGE_COMPLETED,
                actor_type=ActorType.SYSTEM,
                payload={"index": index},
            )

    await asyncio.gather(*(write(index) for index in range(8)))

    events = (
        (
            await session.execute(
                sa.select(models.AuditEvent)
                .where(models.AuditEvent.tenant_id == tenant_a.id)
                .order_by(models.AuditEvent.seq)
            )
        )
        .scalars()
        .all()
    )
    assert [event.seq for event in events] == list(range(1, 9))
    assert audit.verify_chain(list(events)).verified is True


@pytest.mark.parametrize("attempt", [1, 2])
async def test_concurrent_appends_survive_a_second_event_loop(
    session_factory: async_sessionmaker[AsyncSession],
    session: AsyncSession,
    default_tenant: models.Tenant,
    attempt: int,
) -> None:
    """The writer lock outlives the loop that first contended on it.

    Migration 0001 seeds the `default` tenant with a *fixed* id, so its lock is reused by
    every process — and every test. An `asyncio.Lock` raises "bound to a different event
    loop" the second time it is contended on a new loop, which is exactly what a worker
    pool in T9's integration tests would do. Running this case twice reproduces it.
    """

    async def write(index: int) -> None:
        async with session_factory() as writer:
            await audit.append(
                writer,
                tenant_id=default_tenant.id,
                event_type=AuditEventType.REVIEW_STAGE_COMPLETED,
                actor_type=ActorType.SYSTEM,
                payload={"index": index, "attempt": attempt},
            )

    await asyncio.gather(*(write(index) for index in range(4)))

    events = (
        (
            await session.execute(
                sa.select(models.AuditEvent).order_by(models.AuditEvent.seq)
            )
        )
        .scalars()
        .all()
    )
    assert [event.seq for event in events] == [1, 2, 3, 4]
    assert audit.verify_chain(list(events)).verified is True


def test_verifier_reports_the_first_broken_link() -> None:
    """A pure-function check, so the endpoint's verdict is not the only proof."""
    events = [
        models.AuditEvent(
            id=f"e{index}",
            tenant_id="t",
            seq=index,
            actor_type=ActorType.SYSTEM.value,
            actor_id="pipeline",
            event_type=AuditEventType.REVIEW_STAGE_COMPLETED.value,
            payload={"stage": index},
            prev_hash=None,
            event_hash="",
            created_at=datetime(2026, 9, 14, 23, 41, index, tzinfo=UTC),
        )
        for index in range(1, 4)
    ]
    previous: str | None = None
    for event in events:
        event.prev_hash = previous
        event.event_hash = audit.event_hash_of(event)
        previous = event.event_hash

    assert audit.verify_chain(events).verified is True

    events[1].payload = {"stage": "tampered"}
    broken = audit.verify_chain(events)
    assert broken.verified is False
    assert broken.broken_at_seq == 2
    assert broken.checked == 3


# --------------------------------------------------------------------------------------
# GET /v1/audit — spec §6.8
# --------------------------------------------------------------------------------------
async def test_chain_verifies(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-21a: the trail is served with `chain.verified = true`."""
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    written = await _seed_chain(session, default_tenant, run, finding)

    response = await client.get("/v1/audit")

    assert response.status_code == 200
    body = response.json()
    assert body["chain"] == {
        "verified": True,
        "checked": 3,
        "first_seq": 1,
        "last_seq": 3,
        "broken_at_seq": None,
    }
    assert [item["seq"] for item in body["items"]] == [1, 2, 3]
    first = body["items"][0]
    assert first["event_type"] == "finding.proposed"
    assert first["actor_type"] == "ai"
    assert first["actor_id"] == "specialist:bugs:claude-sonnet-5"
    assert first["review_id"] == run.id
    assert first["finding_id"] == finding.id
    assert first["payload"]["rule_key"] == "unguarded_none_arithmetic"
    assert first["event_hash"] == written[0].event_hash
    assert first["prev_hash"] is None
    assert body["items"][1]["prev_hash"] == written[0].event_hash
    assert first["created_at"].endswith("Z")
    assert body["page"] == {"limit": 500, "next_cursor": None, "has_more": False}


async def test_tampering_is_detected(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-21a: mutate one payload row → `verified: false` with the right `broken_at_seq`."""
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    await _seed_chain(session, default_tenant, run, finding)

    await session.execute(
        sa.update(models.AuditEvent)
        .where(models.AuditEvent.seq == 2)
        .values(payload={"outcome": "passed_unexpectedly"})
    )
    await session.commit()

    response = await client.get("/v1/audit")

    assert response.status_code == 200, "a broken chain is served, never hidden"
    body = response.json()
    assert body["chain"]["verified"] is False
    assert body["chain"]["broken_at_seq"] == 2
    assert len(body["items"]) == 3


async def test_a_filtered_page_with_gaps_still_verifies(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """The deletion check must not misread the filter doing its job.

    A filtered page is meant to skip `seq` values, so only an *unfiltered* listing may
    read a gap as an excised row.
    """
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    await _seed_chain(session, default_tenant, run, finding)
    # seq 3 (`gate.evaluated`) carries no finding, so filtering on one leaves a hole at 3.
    await audit.append(
        session,
        tenant_id=default_tenant.id,
        event_type=AuditEventType.FINDING_SUPPRESSED,
        actor_type=ActorType.HUMAN,
        review_run_id=run.id,
        finding_id=finding.id,
    )

    filtered = await client.get("/v1/audit", params={"finding_id": finding.id})

    body = filtered.json()
    assert [item["seq"] for item in body["items"]] == [1, 2, 4]
    assert body["chain"]["verified"] is True
    assert body["chain"]["broken_at_seq"] is None


async def test_audit_filters_by_review_finding_type_and_actor(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    other_run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    await _seed_chain(session, default_tenant, run, finding)
    await audit.append(
        session,
        tenant_id=default_tenant.id,
        event_type=AuditEventType.REVIEW_REQUESTED,
        actor_type=ActorType.HUMAN,
        review_run_id=other_run.id,
    )

    by_review = await client.get("/v1/audit", params={"review_id": run.id})
    by_finding = await client.get("/v1/audit", params={"finding_id": finding.id})
    by_type = await client.get("/v1/audit", params={"event_type": "gate.evaluated"})
    by_actor = await client.get("/v1/audit", params={"actor_type": "human"})

    assert [item["review_id"] for item in by_review.json()["items"]] == [run.id] * 3
    assert len(by_finding.json()["items"]) == 2
    assert [item["event_type"] for item in by_type.json()["items"]] == ["gate.evaluated"]
    assert [item["event_type"] for item in by_actor.json()["items"]] == ["review.requested"]
    assert by_review.json()["chain"]["checked"] == 3


async def test_audit_since_and_cursor_pagination(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    await _seed_chain(session, default_tenant, run, finding)

    first_page = await client.get("/v1/audit", params={"limit": 2})
    body = first_page.json()
    assert [item["seq"] for item in body["items"]] == [1, 2]
    assert body["page"]["has_more"] is True
    assert body["page"]["next_cursor"]

    second_page = await client.get(
        "/v1/audit", params={"limit": 2, "cursor": body["page"]["next_cursor"]}
    )
    assert [item["seq"] for item in second_page.json()["items"]] == [3]
    assert second_page.json()["page"]["has_more"] is False

    future = (datetime.now(UTC) + timedelta(minutes=5)).isoformat()
    assert (await client.get("/v1/audit", params={"since": future})).json()["items"] == []


async def test_audit_limit_is_capped_at_500(client: AsyncClient) -> None:
    response = await client.get("/v1/audit", params={"limit": 501})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_audit_is_scoped_to_the_requesting_tenant(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    tenant_b: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    await _seed_chain(session, default_tenant, run, finding)

    other = await client.get("/v1/audit", headers={"X-Tenant-Id": tenant_b.slug})

    assert other.json()["items"] == []
    assert other.json()["chain"]["checked"] == 0
    assert other.json()["chain"]["verified"] is True


# --------------------------------------------------------------------------------------
# T9 — the whole run, in order (AC-21b)
# --------------------------------------------------------------------------------------
@pytest.fixture
def github_mock() -> Iterator[respx.Router]:
    """respx over the GitHub API base, for the one test here that runs a whole review."""
    with respx.mock(base_url="https://api.github.com", assert_all_called=False) as router:
        yield router


async def test_run_emits_complete_ordered_event_set(
    client: AsyncClient,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    settings: Settings,
    github_mock: respx.Router,
) -> None:
    """AC-21b: `review.requested` to `review.completed`, in §4.1's order, for one real run.

    The audit chain is the product's claim about itself (§4.1: "the ground truth for what the
    AI did"), so the order is asserted exactly rather than as a set. `review.degraded` sits
    between the stage events and the findings because this machine has no Docker daemon (E14,
    X7) — a degradation is part of the record, and AC-21's sequence is the projection below.
    """
    posting = make_settings(settings, GITHUB_TOKEN="ghp_test_token")
    mock_pull_request(github_mock)
    mock_delivery(github_mock)

    review_id = await trigger_review(
        posting,
        session_factory,
        make_pipeline(settings=posting, session_factory=session_factory),
    )

    events = (
        (
            await session.execute(
                sa.select(models.AuditEvent)
                .where(models.AuditEvent.review_run_id == review_id)
                .order_by(models.AuditEvent.seq.asc())
            )
        )
        .scalars()
        .all()
    )
    kinds = [event.event_type for event in events]

    assert kinds == [
        "review.requested",
        "review.started",
        *["review.stage_completed"] * 9,
        "review.degraded",
        "finding.proposed",
        "proof.executed",
        "finding.published",
        "gate.evaluated",
        "gate.delivered",
        "review.completed",
    ]
    assert [kind for kind in kinds if kind != "review.degraded"] == [
        "review.requested",
        "review.started",
        *["review.stage_completed"] * 9,
        "finding.proposed",
        "proof.executed",
        "finding.published",
        "gate.evaluated",
        "gate.delivered",
        "review.completed",
    ], "AC-21's prescribed sequence, verbatim"

    by_kind = {event.event_type: event for event in events}
    assert by_kind["review.requested"].actor_type == "human"
    assert by_kind["finding.proposed"].actor_type == "ai"
    assert by_kind["finding.proposed"].actor_id.startswith("specialist:")
    assert by_kind["finding.proposed"].finding_id is not None
    assert by_kind["proof.executed"].payload["proof_status"] == "proven"
    assert by_kind["proof.executed"].payload["base_exit_code"] == 0
    assert by_kind["proof.executed"].payload["head_exit_code"] == 1
    assert by_kind["finding.published"].payload["blocking"] is True
    assert by_kind["gate.evaluated"].payload["conclusion"] == "failure"
    assert by_kind["gate.delivered"].payload["delivery"] == "commit_status"
    assert by_kind["review.completed"].payload["counts"]["published"] == 1

    served = await client.get("/v1/audit", params={"review_id": review_id, "limit": 100})

    assert served.status_code == 200
    assert served.json()["chain"]["verified"] is True
    assert [item["event_type"] for item in served.json()["items"]] == kinds
