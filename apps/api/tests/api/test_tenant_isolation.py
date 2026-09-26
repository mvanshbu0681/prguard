"""Tenancy at the endpoint layer — spec §5, AC-27.

T1 proved isolation at the `TenantScope` dependency. This is the version a reviewer
actually cares about: every endpoint, driven over HTTP, with one tenant's data and another
tenant's header. There is no untenanted row and no unscoped read.
"""

from __future__ import annotations

import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.core import audit
from prguard.db import models
from prguard.db.models import ActorType, AuditEventType
from tests.conftest import RowFactory

OTHER = "X-Tenant-Id"


async def test_cross_tenant_reads_are_isolated_on_every_endpoint(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    tenant_b: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value
    )
    finding = await rows.finding(default_tenant, run)
    suppression = await rows.suppression(default_tenant, repository_id=repository.id)
    await audit.append(
        session,
        tenant_id=default_tenant.id,
        event_type=AuditEventType.REVIEW_REQUESTED,
        actor_type=ActorType.HUMAN,
        review_run_id=run.id,
    )
    headers = {OTHER: tenant_b.slug}

    not_found = [
        await client.get(f"/v1/reviews/{run.id}", headers=headers),
        await client.get(f"/v1/reviews/{run.id}/result", headers=headers),
        await client.post(f"/v1/reviews/{run.id}/rerun", headers=headers),
        await client.get(f"/v1/findings/{finding.id}", headers=headers),
        await client.post(
            f"/v1/findings/{finding.id}/suppress",
            json={"scope": "repo", "reason": "not mine to suppress"},
            headers=headers,
        ),
        await client.delete(f"/v1/suppressions/{suppression.id}", headers=headers),
    ]
    findings = await client.get("/v1/findings", headers=headers)
    suppressions = await client.get("/v1/suppressions", headers=headers)
    trail = await client.get("/v1/audit", headers=headers)
    report = await client.get("/v1/accuracy", headers=headers)

    for response in not_found:
        assert response.status_code == 404, response.request.url
        assert response.json()["error"]["code"].endswith("NOT_FOUND")

    assert findings.json()["items"] == []
    assert findings.json()["totals"]["matched"] == 0
    assert suppressions.json()["items"] == []
    assert suppressions.json()["totals"] == {"active": 0, "expired": 0, "revoked": 0}
    assert trail.json()["items"] == []
    assert report.json()["runs"]["total"] == 0
    assert report.json()["findings"]["proposed"] == 0

    # The owning tenant still sees everything — isolation, not deletion.
    assert (await client.get(f"/v1/reviews/{run.id}")).status_code == 200
    assert len((await client.get("/v1/findings")).json()["items"]) == 1


async def test_the_same_repository_under_two_tenants_is_two_rows(
    client: AsyncClient,
    session: AsyncSession,
    tenant_b: models.Tenant,
) -> None:
    """The upsert key is `(tenant, provider, owner, name)` — tenants never share a repo row."""
    mine = await client.post(
        "/v1/reviews", json={"pr_url": "https://github.com/octocat/hello-world/pull/42"}
    )
    theirs = await client.post(
        "/v1/reviews",
        json={"pr_url": "https://github.com/octocat/hello-world/pull/42"},
        headers={OTHER: tenant_b.slug},
    )

    assert {mine.status_code, theirs.status_code} == {202}
    assert mine.json()["review_id"] != theirs.json()["review_id"]
    assert theirs.json()["deduplicated"] is False, "another tenant's run is not mine"

    repositories = (await session.execute(sa.select(models.Repository))).scalars().all()
    assert len(repositories) == 2
    assert len({row.tenant_id for row in repositories}) == 2
    # "There is no untenanted row" (§5).
    assert all(row.tenant_id for row in repositories)
    assert tenant_b.id in {row.tenant_id for row in repositories}

    runs = (await session.execute(sa.select(models.ReviewRun))).scalars().all()
    assert len({run.tenant_id for run in runs}) == 2


async def test_audit_chains_are_independent_per_tenant(
    client: AsyncClient,
    session: AsyncSession,
    tenant_b: models.Tenant,
) -> None:
    """Each tenant's chain starts at seq 1 and verifies on its own."""
    await client.post("/v1/reviews", json={"pr_url": "octocat/hello-world#42"})
    await client.post(
        "/v1/reviews",
        json={"pr_url": "octocat/hello-world#42"},
        headers={OTHER: tenant_b.slug},
    )

    mine = (await client.get("/v1/audit")).json()
    theirs = (await client.get("/v1/audit", headers={OTHER: tenant_b.slug})).json()

    assert [item["seq"] for item in mine["items"]] == [1]
    assert [item["seq"] for item in theirs["items"]] == [1]
    assert mine["items"][0]["event_hash"] != theirs["items"][0]["event_hash"]
    assert mine["chain"]["verified"] is True
    assert theirs["chain"]["verified"] is True
