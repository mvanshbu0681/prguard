"""Fixtures for the API surface.

The root `tests/conftest.py` is frozen after T1 (plan §9.3 rule 2), so everything T7
needs on top of `client` / `rows` / `default_tenant` lives here.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.api.deps import get_db_session, get_job_queue, get_settings_dep
from prguard.config import Settings
from prguard.core.queue import NullJobQueue
from prguard.db import models
from prguard.main import create_app
from tests.conftest import RowFactory

#: `async with client_for(other_settings) as client: …`
ClientFactory = Callable[[Settings], AbstractAsyncContextManager[AsyncClient]]


def settings_with(settings: Settings, **overrides: Any) -> Settings:
    """A variant of the test settings, re-validated — a bad override fails loudly."""
    return Settings(**{**settings.model_dump(), **overrides})


@pytest.fixture
def client_for(
    session_factory: async_sessionmaker[AsyncSession],
    job_queue: NullJobQueue,
) -> ClientFactory:
    """The root `client`, but for settings a single test needs to change (token, secret)."""

    @asynccontextmanager
    async def _client(app_settings: Settings) -> AsyncIterator[AsyncClient]:
        app = create_app(settings=app_settings, job_queue=job_queue)

        async def _override_session() -> AsyncIterator[AsyncSession]:
            async with session_factory() as db_session:
                yield db_session

        app.dependency_overrides[get_db_session] = _override_session
        app.dependency_overrides[get_job_queue] = lambda: job_queue
        app.dependency_overrides[get_settings_dep] = lambda: app_settings
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
            yield http_client

    return _client


@pytest.fixture
async def repository(rows: RowFactory, default_tenant: models.Tenant) -> models.Repository:
    """`octocat/hello-world` under the tenant a header-less request resolves to."""
    return await rows.repository(default_tenant)


@pytest.fixture
async def pull_request(
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
) -> models.PullRequest:
    return await rows.pull_request(default_tenant, repository)
