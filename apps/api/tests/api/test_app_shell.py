"""The app shell — spec §6.0 end to end with zero business logic.

Proves the envelope path, the request-id middleware and the router seam T7 fills in.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
import sqlalchemy as sa
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard import __version__
from prguard.api import (
    routes_accuracy,
    routes_audit,
    routes_findings,
    routes_health,
    routes_reviews,
    routes_suppressions,
    routes_webhooks,
    schemas,
)
from prguard.api.deps import RequireBearer
from prguard.api.errors import (
    ERROR_STATUS,
    REQUEST_ID_HEADER,
    SPEC_ERROR_CODES,
    ErrorCode,
    PRGuardError,
)
from prguard.config import Settings
from prguard.core.queue import NullJobQueue
from prguard.db.models import Repository, Tenant
from prguard.main import ROUTERS, create_app
from tests.conftest import RowFactory

#: Spec §6.0, code → HTTP status, verbatim.
SPEC_REGISTRY = {
    "INVALID_PR_URL": 422,
    "VALIDATION_ERROR": 422,
    "UNAUTHORIZED": 401,
    "INVALID_SIGNATURE": 401,
    "WEBHOOK_NOT_CONFIGURED": 503,
    "REVIEW_NOT_FOUND": 404,
    "FINDING_NOT_FOUND": 404,
    "SUPPRESSION_NOT_FOUND": 404,
    "PR_NOT_FOUND": 404,
    "REPO_FORBIDDEN": 403,
    "RESULT_NOT_READY": 409,
    "GITHUB_UNAVAILABLE": 502,
    "LLM_UNAVAILABLE": 502,
    "DATABASE_UNAVAILABLE": 503,
    "RATE_LIMITED": 429,
    "INTERNAL_ERROR": 500,
}


def _assert_envelope(body: dict[str, object], *, code: str) -> None:
    assert set(body) == {"error"}, "the envelope has exactly one top-level key (§6.0)"
    error = body["error"]
    assert isinstance(error, dict)
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert isinstance(error["request_id"], str) and error["request_id"]


async def test_app_starts_and_unknown_route_returns_envelope(client: AsyncClient) -> None:
    response = await client.get("/v1/definitely-not-a-route")

    assert response.status_code == 404
    _assert_envelope(response.json(), code="NOT_FOUND")
    assert response.headers[REQUEST_ID_HEADER]
    assert response.json()["error"]["request_id"] == response.headers[REQUEST_ID_HEADER]


async def test_every_request_gets_a_distinct_request_id(client: AsyncClient) -> None:
    first = await client.get("/v1/nope")
    second = await client.get("/v1/nope")
    assert first.headers[REQUEST_ID_HEADER] != second.headers[REQUEST_ID_HEADER]


async def test_inbound_request_id_is_echoed(client: AsyncClient) -> None:
    response = await client.get("/v1/nope", headers={REQUEST_ID_HEADER: "01J9Z6Q2K7R8M4T0"})
    assert response.headers[REQUEST_ID_HEADER] == "01J9Z6Q2K7R8M4T0"
    assert response.json()["error"]["request_id"] == "01J9Z6Q2K7R8M4T0"


def test_error_registry_matches_spec_section_6_0() -> None:
    registry = {code.value: status for code, status in ERROR_STATUS.items()}
    for code, status in SPEC_REGISTRY.items():
        assert registry[code] == status, f"{code} must map to {status}"
    assert {code.value for code in SPEC_ERROR_CODES} == set(SPEC_REGISTRY)


def test_app_registers_every_router(settings: Settings) -> None:
    app = create_app(settings=settings)
    assert isinstance(app, FastAPI)
    assert app.version == __version__
    assert len(ROUTERS) == 7, "spec §4.3 lists seven route modules"
    expected = [
        routes_health.router,
        routes_reviews.router,
        routes_findings.router,
        routes_suppressions.router,
        routes_audit.router,
        routes_accuracy.router,
        routes_webhooks.router,
    ]
    assert all(actual is wanted for actual, wanted in zip(ROUTERS, expected, strict=True))


async def test_handlers_added_to_a_router_reach_the_app(settings: Settings) -> None:
    """The seam T7 relies on: add a handler to the router module, never touch main.py."""
    router = routes_health.router

    @router.get("/_t1_seam_probe")
    async def _probe() -> dict[str, str]:
        return {"ok": "yes"}

    try:
        app = create_app(settings=settings)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as probe_client:
            response = await probe_client.get("/_t1_seam_probe")
        assert response.status_code == 200
        assert response.json() == {"ok": "yes"}
    finally:
        router.routes[:] = [
            route for route in router.routes if getattr(route, "path", None) != "/_t1_seam_probe"
        ]


def test_job_queue_defaults_to_null(settings: Settings) -> None:
    app = create_app(settings=settings)
    assert isinstance(app.state.job_queue, NullJobQueue)
    assert app.state.settings is settings


@pytest.mark.parametrize(
    ("code", "status"),
    [(ErrorCode(name), status) for name, status in SPEC_REGISTRY.items()],
)
async def test_raised_domain_errors_render_the_envelope(
    settings: Settings, code: ErrorCode, status: int
) -> None:
    app = create_app(settings=settings)

    @app.get("/_probe")
    async def _probe() -> None:
        raise PRGuardError(code, details={"probe": code.value})

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as probe_client:
        response = await probe_client.get("/_probe")

    assert response.status_code == status
    _assert_envelope(response.json(), code=code.value)
    assert response.json()["error"]["details"] == {"probe": code.value}


async def test_request_validation_failure_is_a_validation_error(settings: Settings) -> None:
    app = create_app(settings=settings)

    class Body(BaseModel):
        pr_url: str

    @app.post("/_probe")
    async def _probe(body: Body) -> dict[str, str]:
        return {"pr_url": body.pr_url}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as probe_client:
        response = await probe_client.post("/_probe", json={"wrong": 1})

    assert response.status_code == 422
    _assert_envelope(response.json(), code="VALIDATION_ERROR")
    details = response.json()["error"]["details"]
    assert details is not None and details["errors"]


async def test_method_not_allowed_still_returns_an_envelope(settings: Settings) -> None:
    app = create_app(settings=settings)

    @app.get("/_probe")
    async def _probe() -> dict[str, str]:
        return {"ok": "yes"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as probe_client:
        response = await probe_client.post("/_probe", json={})

    assert response.status_code == 405
    _assert_envelope(response.json(), code="METHOD_NOT_ALLOWED")


async def test_seeded_rows_survive_a_request_session_closing(
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    rows: RowFactory,
    tenant_a: Tenant,
) -> None:
    """The frozen conftest's contract: a request must not discard seed data.

    The in-memory engine hands every session the same connection, and a request session
    rolls back when it closes or when a handler raises. `RowFactory` therefore commits —
    without that, the first 404 test in T7 would eat its own fixtures.
    """
    repository = await rows.repository(tenant_a)

    async with session_factory() as request_session:
        await request_session.execute(sa.select(Repository))

    surviving = await session.execute(sa.select(Repository).where(Repository.id == repository.id))
    assert surviving.scalars().one().id == repository.id


async def test_openapi_schema_is_servable(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "prguard"


# --------------------------------------------------------------------------------------
# Dependencies (spec §6 preamble) — the bearer guard on mutating endpoints
# --------------------------------------------------------------------------------------
async def _bearer_probe(settings: Settings, headers: dict[str, str]) -> int:
    app = create_app(settings=settings)

    @app.post("/_probe", dependencies=[RequireBearer])
    async def _probe() -> dict[str, str]:
        return {"ok": "yes"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as probe_client:
        return (await probe_client.post("/_probe", headers=headers)).status_code


async def test_bearer_is_a_noop_while_the_token_is_unset(settings: Settings) -> None:
    assert settings.PRGUARD_API_TOKEN is None
    assert await _bearer_probe(settings, headers={}) == 200


async def test_bearer_is_required_once_the_token_is_set() -> None:
    guarded = Settings(DATABASE_URL="sqlite+aiosqlite://", PRGUARD_API_TOKEN="s3cret")

    assert await _bearer_probe(guarded, headers={}) == 401
    assert await _bearer_probe(guarded, headers={"Authorization": "Bearer wrong"}) == 401
    assert await _bearer_probe(guarded, headers={"Authorization": "Token s3cret"}) == 401
    assert await _bearer_probe(guarded, headers={"Authorization": "Bearer s3cret"}) == 200


# --------------------------------------------------------------------------------------
# Schemas — the two validations §6.6 states in prose, and §6.9's required caveats
# --------------------------------------------------------------------------------------
def test_suppress_request_requires_a_non_empty_reason() -> None:
    with pytest.raises(ValidationError):
        schemas.SuppressRequest(scope="repo", reason="   ")


def test_suppress_request_requires_match_path_for_pattern_scope() -> None:
    with pytest.raises(ValidationError):
        schemas.SuppressRequest(scope="pattern", reason="agreed on 2026-08-11")

    rule = schemas.SuppressRequest(scope="pattern", reason="agreed", match_path="cli/**")
    assert rule.match_path == "cli/**"


def test_accuracy_report_requires_caveats() -> None:
    field = schemas.AccuracyReport.model_fields["caveats"]
    assert any(getattr(meta, "min_length", None) == 1 for meta in field.metadata)


def test_timestamps_serialise_with_a_trailing_z() -> None:
    accepted = schemas.ReviewAccepted(
        review_id="b9f1c2d0",
        status="queued",
        trigger="api",
        repository=schemas.RepositoryRef(owner="octocat", name="hello-world"),
        pull_request=schemas.PullRequestRef(number=42),
        poll_url="/v1/reviews/b9f1c2d0",
        result_url="/v1/reviews/b9f1c2d0/result",
        created_at=datetime(2026, 9, 14, 23, 41, 7, tzinfo=UTC),
    )
    assert accepted.model_dump(mode="json")["created_at"] == "2026-09-14T23:41:07Z"
