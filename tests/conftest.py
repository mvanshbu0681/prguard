"""Root fixtures — frozen after T1 (plan §9.3 rule 2).

Tracks needing extra fixtures add a package-level `tests/<pkg>/conftest.py`; nothing is
added here after this track merges.

Offline by construction: an in-memory SQLite database built by the real Alembic scripts, a
`NullJobQueue` so no worker ever runs inside a request, and an environment scrubbed of
every `Settings` key so a developer's shell cannot change a result.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from prguard.api.deps import get_db_session, get_job_queue, get_settings_dep
from prguard.config import Settings, get_settings
from prguard.core.queue import NullJobQueue
from prguard.db import models
from prguard.db.session import create_engine, create_sessionmaker, run_migrations
from prguard.main import create_app

TENANT_A_SLUG = "tenant-a"
TENANT_B_SLUG = "tenant-b"
#: Seeded by migration 0001; requests without `X-Tenant-Id` resolve here.
DEFAULT_TENANT_SLUG = "default"


def new_id() -> str:
    """Spec §5: ids are `String(36)` UUID4, portable across both engines."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


@pytest.fixture(autouse=True)
def _isolated_settings_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Neither the ambient environment nor a local `.env` may leak into a test."""
    for key in Settings.model_fields:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)  # type: ignore[typeddict-item]
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def settings() -> Settings:
    """In-memory SQLite, no bearer token, fake LLM provider, no GitHub credentials."""
    return Settings(DATABASE_URL="sqlite+aiosqlite://", LLM_PROVIDER="fake")


@pytest.fixture
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    """One shared in-memory connection, schema built by the real migrations."""
    eng = create_engine(settings)
    await run_migrations(eng)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return create_sessionmaker(engine)


@pytest.fixture
async def session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    async with session_factory() as db_session:
        yield db_session


@pytest.fixture
async def default_tenant(session: AsyncSession) -> models.Tenant:
    tenant = await _tenant_by_slug(session, DEFAULT_TENANT_SLUG)
    assert tenant is not None, "migration 0001 seeds the default tenant"
    return tenant


@pytest.fixture
async def tenant_a(session: AsyncSession) -> models.Tenant:
    return await _make_tenant(session, TENANT_A_SLUG, "Tenant A")


@pytest.fixture
async def tenant_b(session: AsyncSession) -> models.Tenant:
    return await _make_tenant(session, TENANT_B_SLUG, "Tenant B")


async def _tenant_by_slug(session: AsyncSession, slug: str) -> models.Tenant | None:
    import sqlalchemy as sa

    result = await session.execute(sa.select(models.Tenant).where(models.Tenant.slug == slug))
    return result.scalars().first()


async def _make_tenant(session: AsyncSession, slug: str, name: str) -> models.Tenant:
    tenant = models.Tenant(id=new_id(), slug=slug, name=name)
    session.add(tenant)
    await session.commit()
    return tenant


@pytest.fixture
def job_queue() -> NullJobQueue:
    """Records enqueues, never executes — AC-1 needs `POST /v1/reviews` non-blocking."""
    return NullJobQueue()


@pytest.fixture
async def client(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    job_queue: NullJobQueue,
) -> AsyncIterator[AsyncClient]:
    app = create_app(settings=settings, job_queue=job_queue)

    async def _override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as db_session:
            yield db_session

    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_job_queue] = lambda: job_queue
    app.dependency_overrides[get_settings_dep] = lambda: settings
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client


# --------------------------------------------------------------------------------------
# Row factories — one per table (spec §5.1). Every factory fills the required columns and
# accepts overrides, so a test only states what it actually cares about.
# --------------------------------------------------------------------------------------
class RowFactory:
    """`rows.review_run(tenant, pull_request=pr, status="running")` and friends.

    Each method commits, because the `client` fixture's request sessions share this
    in-memory database and roll back on any error path: uncommitted seed rows would
    vanish the first time a test asserted a 404.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, row: Any) -> Any:
        self.session.add(row)
        await self.session.commit()
        return row

    async def tenant(self, **kw: Any) -> models.Tenant:
        defaults: dict[str, Any] = {"id": new_id(), "slug": f"t-{new_id()[:8]}", "name": "Tenant"}
        return await self.add(models.Tenant(**{**defaults, **kw}))

    async def installation(self, tenant: models.Tenant, **kw: Any) -> models.Installation:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "provider": models.Provider.GITHUB.value,
            "external_installation_id": None,
            "account_login": "octocat",
            "token_source": models.TokenSource.PAT.value,
        }
        return await self.add(models.Installation(**{**defaults, **kw}))

    async def repository(self, tenant: models.Tenant, **kw: Any) -> models.Repository:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "provider": models.Provider.GITHUB.value,
            "owner": "octocat",
            "name": "hello-world",
            "default_branch": "main",
            "is_private": False,
        }
        return await self.add(models.Repository(**{**defaults, **kw}))

    async def pull_request(
        self, tenant: models.Tenant, repository: models.Repository, **kw: Any
    ) -> models.PullRequest:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "repository_id": repository.id,
            "number": 42,
            "title": "Add discount engine",
            "author_login": "octocat",
            "head_sha": "9a1e3c7f" + "0" * 32,
            "head_ref": "feature/discounts",
            "base_sha": "1f0b2c3d" + "0" * 32,
            "base_ref": "main",
            "state": "open",
            "url": "https://github.com/octocat/hello-world/pull/42",
            "is_draft": False,
        }
        return await self.add(models.PullRequest(**{**defaults, **kw}))

    async def review_run(
        self, tenant: models.Tenant, pull_request: models.PullRequest, **kw: Any
    ) -> models.ReviewRun:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "pull_request_id": pull_request.id,
            "status": models.RunStatus.QUEUED.value,
            "trigger": models.RunTrigger.API.value,
            "head_sha": pull_request.head_sha,
            "base_sha": pull_request.base_sha,
            "degradations": [],
            "context_truncated": False,
            "findings_total": 0,
            "findings_published": 0,
            "findings_suppressed": 0,
            "findings_blocking": 0,
        }
        return await self.add(models.ReviewRun(**{**defaults, **kw}))

    async def fingerprint(
        self, tenant: models.Tenant, repository: models.Repository, **kw: Any
    ) -> models.FindingFingerprint:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "repository_id": repository.id,
            "fingerprint": "8f14e45f" + "0" * 56,
            "category": models.Category.CORRECTNESS.value,
            "rule_key": "unguarded_none_arithmetic",
            "symbol_path": "app/billing.py::apply_discount",
            "shape_hash": "a" * 64,
            "occurrence_count": 1,
            "addressed_count": 0,
            "dismissed_count": 0,
        }
        return await self.add(models.FindingFingerprint(**{**defaults, **kw}))

    async def finding(
        self, tenant: models.Tenant, review_run: models.ReviewRun, **kw: Any
    ) -> models.Finding:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "review_run_id": review_run.id,
            "specialist": "bugs",
            "category": models.Category.CORRECTNESS.value,
            "rule_key": "unguarded_none_arithmetic",
            "title": "apply_discount raises TypeError when rate is None",
            "body_markdown": "`apply_discount` multiplies `price * rate` without checking.",
            "file_path": "app/billing.py",
            "start_line": 41,
            "end_line": 44,
            "side": models.Side.RIGHT.value,
            "language": "python",
            "status": models.FindingStatus.PROPOSED.value,
            "proof_status": models.ProofStatus.NOT_ATTEMPTED.value,
            "blocking": False,
            "delivery_mode": models.DeliveryMode.NOT_DELIVERED.value,
        }
        return await self.add(models.Finding(**{**defaults, **kw}))

    async def suppression(self, tenant: models.Tenant, **kw: Any) -> models.Suppression:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "scope": models.SuppressionScope.REPO.value,
            "reason": "Discussed and accepted on 2026-08-11.",
            "created_by": "vansh.m@shavastudios.ai",
            "source": models.SuppressionSource.HUMAN_API.value,
        }
        return await self.add(models.Suppression(**{**defaults, **kw}))

    async def proof_artifact(
        self,
        tenant: models.Tenant,
        finding: models.Finding,
        review_run: models.ReviewRun,
        **kw: Any,
    ) -> models.ProofArtifact:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "finding_id": finding.id,
            "review_run_id": review_run.id,
            "runner": models.ProofRunner.SUBPROCESS.value,
            "isolation": models.ProofIsolation.DEGRADED.value,
            "outcome": models.ProofOutcome.FAILING_AS_EXPECTED.value,
            "baseline_mode": models.BaselineMode.COMPARED.value,
            "base_exit_code": 0,
            "head_exit_code": 1,
            "deps_install_ok": True,
            "duration_ms": 8412,
        }
        return await self.add(models.ProofArtifact(**{**defaults, **kw}))

    async def audit_event(self, tenant: models.Tenant, seq: int, **kw: Any) -> models.AuditEvent:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "seq": seq,
            "actor_type": models.ActorType.SYSTEM.value,
            "actor_id": "pipeline",
            "event_type": models.AuditEventType.REVIEW_REQUESTED.value,
            "payload": {},
            "prev_hash": None,
            "event_hash": "0" * 64,
        }
        return await self.add(models.AuditEvent(**{**defaults, **kw}))

    async def finding_outcome(
        self, tenant: models.Tenant, finding: models.Finding, **kw: Any
    ) -> models.FindingOutcome:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "finding_id": finding.id,
            "fingerprint_id": finding.fingerprint_id,
            "outcome": models.OutcomeKind.UNKNOWN.value,
            "detected_at": utcnow(),
        }
        return await self.add(models.FindingOutcome(**{**defaults, **kw}))

    async def webhook_delivery(self, tenant: models.Tenant, **kw: Any) -> models.WebhookDelivery:
        defaults: dict[str, Any] = {
            "id": new_id(),
            "tenant_id": tenant.id,
            "delivery_id": new_id(),
            "event": "pull_request",
            "action": "synchronize",
            "received_at": utcnow(),
            "status": models.WebhookStatus.ACCEPTED.value,
        }
        return await self.add(models.WebhookDelivery(**{**defaults, **kw}))


@pytest.fixture
def rows(session: AsyncSession) -> RowFactory:
    return RowFactory(session)
