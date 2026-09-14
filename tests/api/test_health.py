"""`GET /healthz` · `GET /readyz` — spec §6.11.

`/healthz` answers from memory: a liveness probe that checks dependencies restarts a
healthy process because something *else* is down. `/readyz` checks the database and
*reports* on everything else without failing on it.
"""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from prguard import __version__
from prguard.api.deps import get_db_session, get_settings_dep
from prguard.config import Settings
from prguard.core.queue import NullJobQueue
from prguard.main import create_app
from tests.api.conftest import ClientFactory, settings_with


async def test_healthz_reports_without_touching_a_dependency(client: AsyncClient) -> None:
    response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


async def test_readyz_reports_every_optional_dependency(
    client_for: ClientFactory, settings: Settings, job_queue: NullJobQueue
) -> None:
    await job_queue.start()
    configured = settings_with(
        settings,
        LLM_PROVIDER="anthropic",
        ANTHROPIC_API_KEY="sk-ant-test",
        GITHUB_TOKEN="ghp_test",
        REVIEW_WORKERS=2,
    )

    async with client_for(configured) as client:
        response = await client.get("/readyz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["database"] == "ok"
    assert body["anthropic"] == "configured"
    assert body["github"] == "token_present"
    assert body["docker"] in {"cli_present", "unavailable"}
    assert body["proof_runner"] in {"docker", "subprocess", "none"}
    assert body["workers"] == {"running": 2, "queue_depth": 0}


async def test_readyz_names_the_missing_credentials_without_failing(
    client: AsyncClient,
) -> None:
    """An absent API key is a *report*, not a 503 — only the database can fail readiness."""
    response = await client.get("/readyz")

    assert response.status_code == 200
    assert response.json()["anthropic"] == "fake"
    assert response.json()["github"] == "anonymous"
    assert response.json()["workers"]["running"] == 0


async def test_readyz_reports_queue_depth(
    client: AsyncClient, job_queue: NullJobQueue
) -> None:
    await client.post("/v1/reviews", json={"pr_url": "octocat/hello-world#42"})

    body = (await client.get("/readyz")).json()

    assert job_queue.depth == 1
    assert body["workers"]["queue_depth"] == 1


async def test_readyz_is_503_when_the_database_will_not_answer(settings: Settings) -> None:
    class DeadSession:
        async def execute(self, *args: Any, **kwargs: Any) -> Any:
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    app = create_app(settings=settings)
    app.dependency_overrides[get_db_session] = lambda: DeadSession()
    app.dependency_overrides[get_settings_dep] = lambda: settings

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/readyz")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"


@pytest.mark.parametrize("path", ["/healthz", "/readyz"])
async def test_probes_need_no_tenant_and_no_token(
    path: str, client_for: ClientFactory, settings: Settings
) -> None:
    """A probe that needs a credential is a probe that reports the credential, not the app."""
    guarded = settings_with(settings, PRGUARD_API_TOKEN="s3cret")

    async with client_for(guarded) as client:
        response = await client.get(path)

    assert response.status_code == 200
