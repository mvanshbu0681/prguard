"""Tenancy — AC-27, third clause.

"A run created under tenant A is invisible to every read endpoint under tenant B."
There is no tenant UI (§3) but there is no untenanted row either, so the isolation is
proved at the dependency that every read path goes through: `TenantScope`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.api.deps import (
    TENANT_HEADER,
    TenantScope,
    TenantScopeDep,
    get_db_session,
    get_settings_dep,
)
from prguard.config import Settings
from prguard.db import models
from prguard.main import create_app
from tests.conftest import RowFactory

#: Every table a read endpoint touches, with the column the scope filters on.
SCOPED_MODELS = (
    models.Installation,
    models.Repository,
    models.PullRequest,
    models.ReviewRun,
    models.Finding,
    models.FindingFingerprint,
    models.Suppression,
    models.ProofArtifact,
    models.AuditEvent,
    models.FindingOutcome,
    models.WebhookDelivery,
)


async def _seed_run(
    rows: RowFactory, tenant: models.Tenant
) -> tuple[models.ReviewRun, models.Finding]:
    repository = await rows.repository(tenant)
    pull_request = await rows.pull_request(tenant, repository)
    run = await rows.review_run(tenant, pull_request, status=models.RunStatus.SUCCEEDED.value)
    fingerprint = await rows.fingerprint(tenant, repository)
    finding = await rows.finding(tenant, run, fingerprint_id=fingerprint.id)
    await rows.proof_artifact(tenant, finding, run)
    await rows.audit_event(tenant, seq=1, review_run_id=run.id, finding_id=finding.id)
    await rows.finding_outcome(tenant, finding)
    await rows.suppression(tenant, repository_id=repository.id, fingerprint_id=fingerprint.id)
    await rows.installation(tenant)
    await rows.webhook_delivery(tenant, review_run_id=run.id)
    await rows.session.commit()
    return run, finding


async def test_cross_tenant_reads_are_isolated(
    session: AsyncSession,
    rows: RowFactory,
    tenant_a: models.Tenant,
    tenant_b: models.Tenant,
) -> None:
    run_a, finding_a = await _seed_run(rows, tenant_a)

    scope_a = TenantScope(tenant_id=tenant_a.id, slug=tenant_a.slug)
    scope_b = TenantScope(tenant_id=tenant_b.id, slug=tenant_b.slug)

    visible_to_a = await session.execute(scope_a.apply(sa.select(models.ReviewRun)))
    assert [row.id for row in visible_to_a.scalars()] == [run_a.id]

    visible_to_b = await session.execute(scope_b.apply(sa.select(models.ReviewRun)))
    assert visible_to_b.scalars().all() == []

    findings_b = await session.execute(scope_b.apply(sa.select(models.Finding)))
    assert findings_b.scalars().all() == []

    assert scope_a.owns(finding_a) is True
    assert scope_b.owns(finding_a) is False


async def test_every_scoped_table_is_empty_for_the_other_tenant(
    session: AsyncSession,
    rows: RowFactory,
    tenant_a: models.Tenant,
    tenant_b: models.Tenant,
) -> None:
    await _seed_run(rows, tenant_a)
    scope_b = TenantScope(tenant_id=tenant_b.id, slug=tenant_b.slug)

    for model in SCOPED_MODELS:
        seeded = await session.execute(sa.select(sa.func.count()).select_from(model))
        assert seeded.scalar_one() >= 1, f"{model.__tablename__} was not seeded for tenant A"

        leaked = await session.execute(scope_b.apply(sa.select(model)))
        assert leaked.scalars().all() == [], f"{model.__tablename__} leaked across tenants"


@asynccontextmanager
async def scope_probe(
    settings: Settings, session_factory: async_sessionmaker[AsyncSession]
) -> AsyncIterator[AsyncClient]:
    """An app whose only route echoes whatever `TenantScope` resolved to."""
    app = create_app(settings=settings)

    async def _override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as db_session:
            yield db_session

    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_settings_dep] = lambda: settings

    @app.get("/_scope")
    async def _scope(scope: TenantScopeDep) -> dict[str, str]:
        return {"tenant_id": scope.tenant_id, "slug": scope.slug}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as probe_client:
        yield probe_client


async def test_missing_header_resolves_to_the_default_tenant(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
) -> None:
    async with scope_probe(settings, session_factory) as probe_client:
        response = await probe_client.get("/_scope")

    assert response.status_code == 200, response.text
    assert response.json() == {"tenant_id": default_tenant.id, "slug": "default"}


async def test_header_selects_the_named_tenant(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    tenant_a: models.Tenant,
) -> None:
    expected = {"tenant_id": tenant_a.id, "slug": tenant_a.slug}
    async with scope_probe(settings, session_factory) as probe_client:
        by_id = await probe_client.get("/_scope", headers={TENANT_HEADER: tenant_a.id})
        by_slug = await probe_client.get("/_scope", headers={TENANT_HEADER: tenant_a.slug})

    assert by_id.json() == expected
    assert by_slug.json() == expected


async def test_unknown_tenant_is_rejected_with_an_envelope(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
) -> None:
    async with scope_probe(settings, session_factory) as probe_client:
        response = await probe_client.get("/_scope", headers={TENANT_HEADER: "no-such-tenant"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert response.json()["error"]["details"] == {"tenant": "no-such-tenant"}
