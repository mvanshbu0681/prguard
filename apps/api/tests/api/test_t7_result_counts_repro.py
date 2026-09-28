"""Reviewer scratch: §6.3 `counts.proposed`."""

from __future__ import annotations

from httpx import AsyncClient

from prguard.db import models
from tests.conftest import RowFactory


async def test_result_counts_match_the_spec_worked_example(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """§6.3's own example: proposed 9 = published 4 + suppressed 3 + dropped 1 +
    disproven 1. `proposed` is what the specialists proposed, not a leftover status."""
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value
    )
    plan = {
        models.FindingStatus.PUBLISHED.value: 4,
        models.FindingStatus.SUPPRESSED.value: 3,
        models.FindingStatus.DROPPED.value: 1,
        models.FindingStatus.DISPROVEN.value: 1,
    }
    for status, count in plan.items():
        for _ in range(count):
            await rows.finding(default_tenant, run, status=status)

    counts = (await client.get(f"/v1/reviews/{run.id}/result")).json()["counts"]

    assert counts["published"] == 4
    assert counts["suppressed"] == 3
    assert counts["dropped"] == 1
    assert counts["disproven"] == 1
    assert counts["proposed"] == 9, (
        f"§6.3 example has proposed == the sum of the terminal statuses; got {counts}"
    )
