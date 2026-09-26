from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.db import models
from tests.conftest import RowFactory


async def test_x_actor_id_is_bounded_by_the_column_it_lands_in(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """`suppressions.created_by` is String(255); the header is unvalidated."""
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)

    response = await client.post(
        f"/v1/findings/{finding.id}/suppress",
        json={"scope": "repo", "reason": "why"},
        headers={"X-Actor-Id": "A" * 5000},
    )
    assert response.status_code == 201, response.text
    stored = (await session.get(models.Suppression, response.json()["suppression_id"]))
    assert stored is not None
    assert len(stored.created_by or "") <= 255, (
        f"stored {len(stored.created_by or '')} chars into a String(255) column; "
        "Postgres raises StringDataRightTruncation here"
    )
