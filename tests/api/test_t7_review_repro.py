"""Reviewer scratch tests — reproductions only, no implementation changes."""

from __future__ import annotations

import hashlib
import hmac
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient, Response

from prguard.api.deps import get_db_session, get_job_queue, get_settings_dep
from prguard.config import Settings
from prguard.main import create_app
from tests.api.conftest import ClientFactory, settings_with
from tests.fixtures.loader import RecordedDelivery, webhook_delivery

SECRET = "it-is-a-secret-to-everybody"


@asynccontextmanager
async def lenient_client(app_settings, session_factory, job_queue):
    """Same as tests.api.conftest.client_for but surfaces a 500 instead of re-raising."""
    app = create_app(settings=app_settings, job_queue=job_queue)

    async def _override_session():
        async with session_factory() as db_session:
            yield db_session

    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_job_queue] = lambda: job_queue
    app.dependency_overrides[get_settings_dep] = lambda: app_settings
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client


@pytest.fixture
def webhook_settings(settings: Settings) -> Settings:
    return settings_with(settings, GITHUB_WEBHOOK_SECRET=SECRET)


def signed_headers(delivery: RecordedDelivery, *, secret: str = SECRET) -> dict[str, str]:
    digest = hmac.new(secret.encode("utf-8"), delivery.raw_body, hashlib.sha256).hexdigest()
    return {**delivery.headers, "X-Hub-Signature-256": f"sha256={digest}"}


async def _post(
    client: AsyncClient, delivery: RecordedDelivery, headers: dict[str, str]
) -> Response:
    return await client.post("/webhooks/github", content=delivery.raw_body, headers=headers)


async def test_repeated_invalid_signature_returns_401_twice(
    session_factory, job_queue, webhook_settings: Settings
) -> None:
    """GitHub retries a delivery with the same X-GitHub-Delivery. A probing attacker
    replays too. The second bad-signature POST must still be 401 INVALID_SIGNATURE."""
    delivery = webhook_delivery("pull_request_synchronize")
    bad = {**delivery.headers, "X-Hub-Signature-256": "sha256=" + "0" * 64}

    async with lenient_client(webhook_settings, session_factory, job_queue) as client:
        first = await _post(client, delivery, bad)
        assert first.status_code == 401, first.text
        assert first.json()["error"]["code"] == "INVALID_SIGNATURE"

        second = await _post(client, delivery, bad)
        assert second.status_code == 401, (
            f"second replay returned {second.status_code}: {second.text}"
        )
        assert second.json()["error"]["code"] == "INVALID_SIGNATURE"


async def test_valid_delivery_after_bad_signature_still_runs(
    client_for: ClientFactory, webhook_settings: Settings
) -> None:
    """Secret rotation: GitHub's first attempt fails HMAC, the retry is correctly signed.
    The retry must still enqueue a run rather than be swallowed as a duplicate."""
    delivery = webhook_delivery("pull_request_synchronize")
    bad = {**delivery.headers, "X-Hub-Signature-256": "sha256=" + "0" * 64}

    async with client_for(webhook_settings) as client:
        assert (await _post(client, delivery, bad)).status_code == 401
        good = await _post(client, delivery, signed_headers(delivery))
        assert good.status_code == 202, f"{good.status_code}: {good.text}"


async def test_bad_signature_on_a_non_json_body_is_still_401(
    client_for: ClientFactory, webhook_settings: Settings
) -> None:
    """Rule 2 authenticates the delivery. Unverified bytes must not be parsed first."""
    async with client_for(webhook_settings) as client:
        response = await client.post(
            "/webhooks/github",
            content=b"not json at all",
            headers={
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "aaaaaaaa-0000-0000-0000-000000000001",
                "X-Hub-Signature-256": "sha256=" + "0" * 64,
            },
        )
    assert response.status_code == 401, (
        f"unauthenticated body was parsed first: {response.status_code} {response.text}"
    )
    assert response.json()["error"]["code"] == "INVALID_SIGNATURE"


async def test_replaying_a_signed_body_without_the_delivery_header_is_idempotent(
    client_for: ClientFactory, webhook_settings: Settings, job_queue
) -> None:
    """E20/rule 3: a captured signed delivery replayed with the header stripped must not
    start a second review."""
    delivery = webhook_delivery("pull_request_synchronize")
    headers = signed_headers(delivery)
    headers.pop("X-GitHub-Delivery", None)
    headers.pop("x-github-delivery", None)

    async with client_for(webhook_settings) as client:
        first = await client.post("/webhooks/github", content=delivery.raw_body, headers=headers)
        second = await client.post("/webhooks/github", content=delivery.raw_body, headers=headers)
        third = await client.post("/webhooks/github", content=delivery.raw_body, headers=headers)

    assert first.status_code == 202, first.text
    assert len(job_queue.enqueued) == 1, (
        f"one signed delivery replayed 3x started {len(job_queue.enqueued)} runs "
        f"(statuses {[first.status_code, second.status_code, third.status_code]})"
    )


async def test_deeply_nested_unsigned_body_does_not_500(
    session_factory, job_queue, webhook_settings: Settings
) -> None:
    """The body is json.loads'd before the HMAC is checked, so this is unauthenticated."""
    body = (b"[" * 200000) + (b"]" * 200000)
    async with lenient_client(webhook_settings, session_factory, job_queue) as client:
        response = await client.post(
            "/webhooks/github",
            content=body,
            headers={
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "bbbbbbbb-0000-0000-0000-000000000002",
                "X-Hub-Signature-256": "sha256=" + "0" * 64,
            },
        )
    assert response.status_code == 401, f"{response.status_code}: {response.text[:300]}"
