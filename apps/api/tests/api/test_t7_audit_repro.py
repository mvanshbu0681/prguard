"""Reviewer scratch tests for the audit chain — reproductions only."""

from __future__ import annotations

import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.core import audit
from prguard.db import models
from prguard.db.models import ActorType, AuditEventType
from tests.conftest import RowFactory


async def _seed(
    session: AsyncSession,
    tenant: models.Tenant,
    run: models.ReviewRun,
    finding: models.Finding,
) -> None:
    for kind in (
        AuditEventType.FINDING_PROPOSED,
        AuditEventType.PROOF_EXECUTED,
        AuditEventType.GATE_EVALUATED,
        AuditEventType.REVIEW_COMPLETED,
    ):
        await audit.append(
            session,
            tenant_id=tenant.id,
            event_type=kind,
            actor_type=ActorType.SYSTEM,
            actor_id="gate",
            review_run_id=run.id,
            finding_id=finding.id,
            payload={"kind": kind.value},
        )


async def test_deleting_an_audit_row_is_detected(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """§5.1 calls the chain tamper-evident and append-only. Excising the row that records
    a `proof.executed` is the tamper an auditor cares about most."""
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    await _seed(session, default_tenant, run, finding)

    intact = (await client.get("/v1/audit")).json()
    assert intact["chain"]["verified"] is True
    assert [item["seq"] for item in intact["items"]] == [1, 2, 3, 4]

    await session.execute(
        sa.delete(models.AuditEvent).where(models.AuditEvent.seq == 2)
    )
    await session.commit()

    body = (await client.get("/v1/audit")).json()
    assert [item["seq"] for item in body["items"]] == [1, 3, 4]
    assert body["chain"]["verified"] is False, (
        "a row was excised from the chain and the verifier still says verified="
        f"{body['chain']['verified']}"
    )
