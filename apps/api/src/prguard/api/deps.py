"""Request dependencies — DB session, tenant scope, bearer auth.

Spec §5: "every read path goes through a `TenantScope` dependency that injects
`WHERE tenant_id = :tid`". Spec §6: the bearer token guards mutating endpoints and is a
no-op while `PRGUARD_API_TOKEN` is unset.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated, Any, TypeVar

import sqlalchemy as sa
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from prguard.api.errors import ErrorCode, PRGuardError
from prguard.config import Settings, get_settings
from prguard.core.queue import JobQueue, NullJobQueue
from prguard.db.models import Tenant
from prguard.db.session import get_session

TENANT_HEADER = "X-Tenant-Id"

_T = TypeVar("_T", bound=Any)


def get_settings_dep(request: Request) -> Settings:
    """App-scoped settings, so tests can override them per app instance."""
    settings = getattr(request.app.state, "settings", None)
    return settings if isinstance(settings, Settings) else get_settings()


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async for session in get_session():
        yield session


def get_job_queue(request: Request) -> JobQueue:
    queue = getattr(request.app.state, "job_queue", None)
    if queue is None:
        queue = NullJobQueue()
        request.app.state.job_queue = queue
    assert isinstance(queue, JobQueue)
    return queue


@dataclass(frozen=True)
class TenantScope:
    """The `WHERE tenant_id = :tid` every read path goes through."""

    tenant_id: str
    slug: str

    def apply(self, statement: Select[_T]) -> Select[_T]:
        return statement.filter_by(tenant_id=self.tenant_id)

    def owns(self, row: object) -> bool:
        return getattr(row, "tenant_id", None) == self.tenant_id


async def get_tenant_scope(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> TenantScope:
    """`X-Tenant-Id` (id or slug) → that tenant; absent → the seeded `default` tenant."""
    requested = request.headers.get(TENANT_HEADER)
    if requested is None:
        tenant = await _tenant_by_slug(session, settings.DEFAULT_TENANT_SLUG)
        if tenant is None:
            raise PRGuardError(
                ErrorCode.DATABASE_UNAVAILABLE,
                "The default tenant is missing; run `alembic upgrade head`.",
                details={"slug": settings.DEFAULT_TENANT_SLUG},
            )
        return TenantScope(tenant_id=tenant.id, slug=tenant.slug)

    tenant = await _tenant_by_id_or_slug(session, requested)
    if tenant is None:
        raise PRGuardError(
            ErrorCode.NOT_FOUND,
            "No tenant with that id or slug.",
            details={"tenant": requested},
        )
    return TenantScope(tenant_id=tenant.id, slug=tenant.slug)


async def _tenant_by_slug(session: AsyncSession, slug: str) -> Tenant | None:
    result = await session.execute(sa.select(Tenant).where(Tenant.slug == slug))
    return result.scalars().first()


async def _tenant_by_id_or_slug(session: AsyncSession, value: str) -> Tenant | None:
    statement = sa.select(Tenant).where(sa.or_(Tenant.id == value, Tenant.slug == value))
    result = await session.execute(statement)
    return result.scalars().first()


async def require_bearer_token(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> None:
    """No-op while `PRGUARD_API_TOKEN` is unset — open in dev only (spec §4.8)."""
    expected = settings.PRGUARD_API_TOKEN
    if not expected:
        return
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or token.strip() != expected:
        raise PRGuardError(ErrorCode.UNAUTHORIZED)


SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
TenantScopeDep = Annotated[TenantScope, Depends(get_tenant_scope)]
JobQueueDep = Annotated[JobQueue, Depends(get_job_queue)]
RequireBearer = Depends(require_bearer_token)
