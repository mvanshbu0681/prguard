"""The error envelope on real endpoints — spec §6.0, AC-2.

T1 proved the envelope machinery on synthetic routes. This file proves the four cases the
spec documents by name, through the endpoints a client actually calls.
"""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.api.errors import REQUEST_ID_HEADER
from prguard.config import Settings
from prguard.db import models
from tests.api.conftest import ClientFactory, settings_with
from tests.conftest import RowFactory

MISSING_ID = "b9f1c2d0-3a44-4e21-9a0c-6f1c0a2b7e55"


def assert_envelope(response: Response, *, status: int, code: str) -> dict[str, Any]:
    """§6.0: one top-level key, four fields, and the request id echoed in the header."""
    assert response.status_code == status
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert error["request_id"] == response.headers[REQUEST_ID_HEADER]
    return error


async def test_error_envelope_matrix(
    client: AsyncClient,
    client_for: ClientFactory,
    settings: Settings,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-2: bad URL → 422, unknown id → 404, no bearer → 401, running → 409."""
    running = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.RUNNING.value
    )

    invalid_url = await client.post(
        "/v1/reviews", json={"pr_url": "https://github.com/owner/repo/pull/abc"}
    )
    unknown_review = await client.get(f"/v1/reviews/{MISSING_ID}")
    not_ready = await client.get(f"/v1/reviews/{running.id}/result")

    guarded = settings_with(settings, PRGUARD_API_TOKEN="s3cret")
    async with client_for(guarded) as authed_client:
        unauthorized = await authed_client.post(
            "/v1/reviews", json={"pr_url": "https://github.com/octocat/hello-world/pull/42"}
        )
        authorized = await authed_client.post(
            "/v1/reviews",
            json={"pr_url": "https://github.com/octocat/hello-world/pull/42"},
            headers={"Authorization": "Bearer s3cret"},
        )

    details = assert_envelope(invalid_url, status=422, code="INVALID_PR_URL")
    assert details["details"] == {"pr_url": "https://github.com/owner/repo/pull/abc"}

    details = assert_envelope(unknown_review, status=404, code="REVIEW_NOT_FOUND")
    assert details["details"] == {"review_id": MISSING_ID}

    assert_envelope(unauthorized, status=401, code="UNAUTHORIZED")
    assert authorized.status_code == 202, "the same request succeeds with the token"

    details = assert_envelope(not_ready, status=409, code="RESULT_NOT_READY")
    assert details["details"] == {"status": "running"}


async def test_every_not_found_carries_its_own_code(
    client: AsyncClient, rows: RowFactory, default_tenant: models.Tenant
) -> None:
    """§6.0 has four distinct 404s; a generic "not found" would lose which thing is missing."""
    review = await client.get(f"/v1/reviews/{MISSING_ID}")
    finding = await client.get(f"/v1/findings/{MISSING_ID}")
    suppress = await client.post(
        f"/v1/findings/{MISSING_ID}/suppress", json={"scope": "repo", "reason": "why not"}
    )
    suppression = await client.delete(f"/v1/suppressions/{MISSING_ID}")

    assert_envelope(review, status=404, code="REVIEW_NOT_FOUND")
    assert_envelope(finding, status=404, code="FINDING_NOT_FOUND")
    assert_envelope(suppress, status=404, code="FINDING_NOT_FOUND")
    assert_envelope(suppression, status=404, code="SUPPRESSION_NOT_FOUND")


async def test_malformed_request_bodies_are_validation_errors(client: AsyncClient) -> None:
    missing_field = await client.post("/v1/reviews", json={})
    wrong_type = await client.post("/v1/reviews", json={"pr_url": 42})
    empty_url = await client.post("/v1/reviews", json={"pr_url": ""})

    for response in (missing_field, wrong_type, empty_url):
        error = assert_envelope(response, status=422, code="VALIDATION_ERROR")
        assert error["details"] is not None and error["details"]["errors"]


async def test_unknown_tenant_header_is_not_found(client: AsyncClient) -> None:
    response = await client.get("/v1/findings", headers={"X-Tenant-Id": "no-such-tenant"})

    error = assert_envelope(response, status=404, code="NOT_FOUND")
    assert error["details"] == {"tenant": "no-such-tenant"}


async def test_bearer_guards_every_mutating_endpoint(
    client_for: ClientFactory,
    settings: Settings,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """§6 preamble: the token guards POST and DELETE, and reads stay open."""
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)
    suppression = await rows.suppression(default_tenant)
    guarded = settings_with(settings, PRGUARD_API_TOKEN="s3cret")

    async with client_for(guarded) as client:
        mutations = [
            await client.post("/v1/reviews", json={"pr_url": "octocat/hello-world#42"}),
            await client.post(f"/v1/reviews/{run.id}/rerun"),
            await client.post(
                f"/v1/findings/{finding.id}/suppress",
                json={"scope": "repo", "reason": "because"},
            ),
            await client.delete(f"/v1/suppressions/{suppression.id}"),
        ]
        reads = [
            await client.get("/v1/findings"),
            await client.get("/v1/suppressions"),
            await client.get("/v1/audit"),
            await client.get("/v1/accuracy"),
            await client.get(f"/v1/reviews/{run.id}"),
        ]

    for response in mutations:
        assert_envelope(response, status=401, code="UNAUTHORIZED")
    for response in reads:
        assert response.status_code == 200
