"""Reviewer scratch tests for /v1/accuracy arithmetic — reproductions only."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from prguard.db import models
from tests.conftest import RowFactory

NOW = datetime(2026, 9, 14, 23, 0, 0, tzinfo=UTC)


async def test_human_dismissal_rate_stays_a_rate_under_the_normal_suppress_flow(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """A run publishes 4 findings; a human suppresses 3 of them through the documented
    endpoint. `human_dismissal_rate` is a rate, so it cannot exceed 1.0."""
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value, created_at=NOW
    )
    findings = [
        await rows.finding(
            default_tenant, run, status=models.FindingStatus.PUBLISHED.value
        )
        for _ in range(4)
    ]

    for finding in findings[:3]:
        response = await client.post(
            f"/v1/findings/{finding.id}/suppress",
            json={"scope": "repo", "reason": "intentional, discussed 2026-08-11"},
        )
        assert response.status_code == 201, response.text

    body = (await client.get("/v1/accuracy")).json()
    metric = body["precision_proxies"]["human_dismissal_rate"]
    assert metric["value"] is not None
    assert metric["value"] <= 1.0, (
        f"human_dismissal_rate={metric['value']} with n={metric['n']}; "
        f"findings counts={body['findings']}"
    )


async def test_addressed_rate_stays_a_rate_across_a_window_boundary(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """PR #42 is re-run inside the window (so it supplies the denominator). PR #7 is
    re-run *after* `until`, so its two addressed findings land in the numerator while the
    PR contributes nothing to the denominator."""
    until = NOW + timedelta(days=1)

    # PR #42: two runs inside the window, one published finding -> denominator = 1.
    for _ in range(2):
        await rows.review_run(
            default_tenant,
            pull_request,
            status=models.RunStatus.SUCCEEDED.value,
            created_at=NOW,
        )
    inside = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value, created_at=NOW
    )
    await rows.finding(default_tenant, inside, status=models.FindingStatus.PUBLISHED.value)

    # PR #7: run 1 inside the window, run 2 after `until`; both findings were addressed.
    other_pr = await rows.pull_request(default_tenant, repository, number=7)
    first_run = await rows.review_run(
        default_tenant, other_pr, status=models.RunStatus.SUCCEEDED.value, created_at=NOW
    )
    await rows.review_run(
        default_tenant,
        other_pr,
        status=models.RunStatus.SUCCEEDED.value,
        created_at=until + timedelta(days=1),
    )
    for _ in range(2):
        addressed = await rows.finding(
            default_tenant, first_run, status=models.FindingStatus.PUBLISHED.value
        )
        await rows.finding_outcome(
            default_tenant, addressed, outcome=models.OutcomeKind.ADDRESSED.value
        )

    body = (
        await client.get(
            "/v1/accuracy",
            params={"since": (NOW - timedelta(days=1)).isoformat(), "until": until.isoformat()},
        )
    ).json()
    metric = body["precision_proxies"]["addressed_rate"]
    assert metric["value"] is not None
    assert metric["value"] <= 1.0, (
        f"addressed_rate={metric['value']} with n={metric['n']}"
    )
