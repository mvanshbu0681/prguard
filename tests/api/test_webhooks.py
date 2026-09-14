"""`POST /webhooks/github` — spec §6.10, AC-19, E20.

Every case here runs against T3's recorded deliveries, signed with a real HMAC, so the
contract is proven against GitHub's actual payload shape rather than a hand-written stub.

The endpoint fails **closed**: with no secret configured and `ALLOW_UNSIGNED_WEBHOOKS=false`
it refuses the delivery rather than trusting it.
"""

from __future__ import annotations

import hashlib
import hmac

import pytest
import sqlalchemy as sa
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.config import Settings
from prguard.core.queue import NullJobQueue
from prguard.db import models
from tests.api.conftest import ClientFactory, settings_with
from tests.conftest import RowFactory
from tests.fixtures.loader import RecordedDelivery, webhook_delivery

SECRET = "it-is-a-secret-to-everybody"


@pytest.fixture
def webhook_settings(settings: Settings) -> Settings:
    return settings_with(settings, GITHUB_WEBHOOK_SECRET=SECRET)


def signed_headers(delivery: RecordedDelivery, *, secret: str = SECRET) -> dict[str, str]:
    """GitHub signs the raw body: `X-Hub-Signature-256: sha256=<hex>`."""
    digest = hmac.new(secret.encode("utf-8"), delivery.raw_body, hashlib.sha256).hexdigest()
    return {
        **delivery.headers,
        "X-Hub-Signature-256": f"sha256={digest}",
    }


async def _post(
    client: AsyncClient, delivery: RecordedDelivery, headers: dict[str, str] | None = None
) -> Response:
    return await client.post(
        "/webhooks/github",
        content=delivery.raw_body,
        headers=headers if headers is not None else signed_headers(delivery),
    )


async def test_valid_signature_enqueues(
    client_for: ClientFactory,
    webhook_settings: Settings,
    job_queue: NullJobQueue,
    session: AsyncSession,
) -> None:
    """AC-19: a signed `pull_request.synchronize` queues exactly one run."""
    delivery = webhook_delivery("pull_request_synchronize")

    async with client_for(webhook_settings) as client:
        response = await _post(client, delivery)

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "accepted"
    assert body["event"] == "pull_request"
    assert body["action"] == "synchronize"
    assert body["delivery_id"] == delivery.delivery_id
    assert job_queue.enqueued == [body["review_id"]]

    run = await session.get(models.ReviewRun, body["review_id"])
    assert run is not None
    assert run.status == "queued"
    assert run.trigger == "webhook", "the webhook door differs from the API door only here"
    assert run.head_sha == delivery.payload["pull_request"]["head"]["sha"]

    repository = (await session.execute(sa.select(models.Repository))).scalars().one()
    assert (repository.owner, repository.name) == ("octocat", "hello-world")

    recorded = (await session.execute(sa.select(models.WebhookDelivery))).scalars().one()
    assert recorded.delivery_id == delivery.delivery_id
    assert recorded.status == "accepted"
    assert recorded.review_run_id == body["review_id"]


@pytest.mark.parametrize(
    "name",
    [
        "pull_request_opened",
        "pull_request_reopened",
        "pull_request_ready_for_review",
        "pull_request_opened_prompt_injection",
    ],
)
async def test_every_handled_action_is_accepted(
    client_for: ClientFactory, webhook_settings: Settings, name: str
) -> None:
    """§6.10 rule 4 — including the injected title, which is data, never instruction."""
    delivery = webhook_delivery(name)

    async with client_for(webhook_settings) as client:
        response = await _post(client, delivery)

    assert response.status_code == delivery.expected_response["status"]
    body = response.json()
    for key, value in delivery.expected_response["body"].items():
        assert body[key] == value


async def test_invalid_signature_rejected(
    client_for: ClientFactory, webhook_settings: Settings, session: AsyncSession
) -> None:
    """AC-19: a wrong signature is 401 `INVALID_SIGNATURE` and is recorded as `invalid`."""
    delivery = webhook_delivery("pull_request_synchronize")

    async with client_for(webhook_settings) as client:
        response = await _post(
            client, delivery, headers=signed_headers(delivery, secret="wrong-secret")
        )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_SIGNATURE"

    recorded = (await session.execute(sa.select(models.WebhookDelivery))).scalars().one()
    assert recorded.status == "invalid"
    assert (await session.execute(sa.select(models.ReviewRun))).scalars().all() == []


async def test_missing_signature_header_is_rejected(
    client_for: ClientFactory, webhook_settings: Settings
) -> None:
    delivery = webhook_delivery("pull_request_synchronize")

    async with client_for(webhook_settings) as client:
        response = await _post(client, delivery, headers=dict(delivery.headers))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_SIGNATURE"


async def test_a_rejected_attempt_does_not_shadow_the_real_delivery(
    client_for: ClientFactory,
    webhook_settings: Settings,
    job_queue: NullJobQueue,
    session: AsyncSession,
) -> None:
    """Rule 3 answers for handled deliveries only (§6.10).

    Secret rotation makes this the ordinary case: GitHub's first attempt fails the HMAC and
    its retry carries the right one. An unauthenticated POST that knew the delivery id
    would otherwise be enough to make the retry answer `duplicate` and never review.
    """
    delivery = webhook_delivery("pull_request_synchronize")
    bad = {**delivery.headers, "X-Hub-Signature-256": "sha256=" + "0" * 64}

    async with client_for(webhook_settings) as client:
        rejected = await _post(client, delivery, headers=bad)
        accepted = await _post(client, delivery)

    assert rejected.status_code == 401
    assert accepted.status_code == 202, accepted.text
    assert job_queue.enqueued == [accepted.json()["review_id"]]

    # One delivery id, one row (§5.1's unique index), holding the disposition that stuck.
    recorded = (await session.execute(sa.select(models.WebhookDelivery))).scalars().one()
    assert recorded.status == "accepted"
    assert recorded.review_run_id == accepted.json()["review_id"]


async def test_a_bad_signature_cannot_undo_an_accepted_delivery(
    client_for: ClientFactory,
    webhook_settings: Settings,
    job_queue: NullJobQueue,
    session: AsyncSession,
) -> None:
    """The mirror case: forged bytes must not reopen a delivery that was already handled,
    or GitHub's next retry would start a second review."""
    delivery = webhook_delivery("pull_request_synchronize")
    bad = {**delivery.headers, "X-Hub-Signature-256": "sha256=" + "0" * 64}

    async with client_for(webhook_settings) as client:
        accepted = await _post(client, delivery)
        forged = await _post(client, delivery, headers=bad)
        retry = await _post(client, delivery)

    assert (accepted.status_code, forged.status_code, retry.status_code) == (202, 401, 200)
    assert retry.json() == {"status": "duplicate", "review_id": accepted.json()["review_id"]}
    assert job_queue.enqueued == [accepted.json()["review_id"]]

    recorded = (await session.execute(sa.select(models.WebhookDelivery))).scalars().one()
    assert recorded.status == "accepted"


async def test_oversized_headers_on_the_unauthenticated_path_are_bounded(
    client_for: ClientFactory, webhook_settings: Settings, session: AsyncSession
) -> None:
    """Rule 2 records headers nobody has authenticated, so they are trimmed to the columns
    they land in — `delivery_id` is String(255) and Postgres would raise, not truncate."""
    delivery = webhook_delivery("pull_request_synchronize")

    async with client_for(webhook_settings) as client:
        response = await _post(
            client,
            delivery,
            headers={
                "X-GitHub-Event": "e" * 500,
                "X-GitHub-Delivery": "d" * 5000,
                "X-Hub-Signature-256": "sha256=" + "0" * 64,
            },
        )

    assert response.status_code == 401
    recorded = (await session.execute(sa.select(models.WebhookDelivery))).scalars().one()
    assert recorded.status == "invalid"
    assert len(recorded.delivery_id) == 255
    assert len(recorded.event or "") == 64


async def test_duplicate_delivery_is_idempotent(
    client_for: ClientFactory,
    webhook_settings: Settings,
    job_queue: NullJobQueue,
    session: AsyncSession,
) -> None:
    """AC-19 / E20: GitHub retries; the second delivery must not start a second run."""
    delivery = webhook_delivery("pull_request_synchronize")

    async with client_for(webhook_settings) as client:
        first = await _post(client, delivery)
        second = await _post(client, delivery)

    assert first.status_code == 202
    assert second.status_code == 200
    assert second.json() == {
        "status": "duplicate",
        "review_id": first.json()["review_id"],
    }
    assert job_queue.enqueued == [first.json()["review_id"]]
    runs = (await session.execute(sa.select(models.ReviewRun))).scalars().all()
    assert len(runs) == 1


async def test_unhandled_event_ignored(
    client_for: ClientFactory,
    webhook_settings: Settings,
    job_queue: NullJobQueue,
    session: AsyncSession,
) -> None:
    """AC-19: an `issues` event is not an error — it is simply not ours."""
    delivery = webhook_delivery("issues_opened")

    async with client_for(webhook_settings) as client:
        response = await _post(client, delivery)

    assert response.status_code == 200
    assert response.json() == {"status": "ignored", "reason": "unhandled_event"}
    assert job_queue.enqueued == []
    recorded = (await session.execute(sa.select(models.WebhookDelivery))).scalars().one()
    assert recorded.status == "ignored"


async def test_unhandled_action_on_a_pull_request_is_ignored(
    client_for: ClientFactory, webhook_settings: Settings, job_queue: NullJobQueue
) -> None:
    delivery = webhook_delivery("pull_request_synchronize")
    closed = RecordedDelivery(
        name=delivery.name,
        event=delivery.event,
        delivery_id="closed-1",
        headers={**delivery.headers, "x-github-delivery": "closed-1"},
        payload={**delivery.payload, "action": "closed"},
        handled=False,
        expected_response={},
        notes="",
    )

    async with client_for(webhook_settings) as client:
        response = await _post(client, closed)

    assert response.status_code == 200
    assert response.json() == {"status": "ignored", "reason": "unhandled_event"}
    assert job_queue.enqueued == []


async def test_draft_pull_requests_are_skipped_unless_configured(
    client_for: ClientFactory, webhook_settings: Settings, settings: Settings
) -> None:
    """§6.10 rule 5: a draft is ignored with 200 — a draft is not an error."""
    delivery = webhook_delivery("pull_request_opened_draft")

    async with client_for(webhook_settings) as client:
        skipped = await _post(client, delivery)

    assert skipped.status_code == 200
    assert skipped.json() == {"status": "ignored", "reason": "draft"}

    # A fresh delivery id, or rule 3 (duplicate) would answer before rule 5 ever runs.
    redelivered = RecordedDelivery(
        name=delivery.name,
        event=delivery.event,
        delivery_id="draft-again-1",
        headers={**delivery.headers, "x-github-delivery": "draft-again-1"},
        payload=delivery.payload,
        handled=True,
        expected_response={},
        notes="",
    )
    reviewing_drafts = settings_with(
        settings, GITHUB_WEBHOOK_SECRET=SECRET, REVIEW_DRAFT_PRS=True
    )
    async with client_for(reviewing_drafts) as client:
        accepted = await _post(client, redelivered)

    assert accepted.status_code == 202
    assert accepted.json()["status"] == "accepted"


async def test_unconfigured_secret_fails_closed(
    client: AsyncClient, session: AsyncSession
) -> None:
    """AC-19: no secret and `ALLOW_UNSIGNED_WEBHOOKS=false` → 503, nothing processed."""
    delivery = webhook_delivery("pull_request_synchronize")

    response = await client.post(
        "/webhooks/github", content=delivery.raw_body, headers=signed_headers(delivery)
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "WEBHOOK_NOT_CONFIGURED"
    assert (await session.execute(sa.select(models.ReviewRun))).scalars().all() == []
    assert (await session.execute(sa.select(models.WebhookDelivery))).scalars().all() == []


async def test_unsigned_delivery_is_accepted_only_when_explicitly_allowed(
    client_for: ClientFactory, settings: Settings
) -> None:
    """The local-ngrok escape hatch (§11.2 assumption 25), off by default."""
    delivery = webhook_delivery("pull_request_synchronize")
    unsigned = settings_with(settings, ALLOW_UNSIGNED_WEBHOOKS=True)

    async with client_for(unsigned) as client:
        response = await _post(client, delivery, headers=dict(delivery.headers))

    assert response.status_code == 202
    assert response.json()["status"] == "accepted"


async def test_force_push_supersedes_the_in_flight_run(
    client_for: ClientFactory,
    webhook_settings: Settings,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
) -> None:
    """E3 / §6.10 rule 4: a push to a new head cancels the run on the old one."""
    repository = await rows.repository(default_tenant)
    pull_request = await rows.pull_request(default_tenant, repository)
    stale = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        head_sha="2b4d6f8a0c2e4a6c8e0a2c4e6a8c0e2a4c6e8a0c",
    )
    delivery = webhook_delivery("pull_request_synchronize_force_push")

    async with client_for(webhook_settings) as client:
        response = await _post(client, delivery)

    assert response.status_code == 202
    await session.refresh(stale)
    assert stale.status == "cancelled"
    assert stale.error_code == "SUPERSEDED"

    fresh = await session.get(models.ReviewRun, response.json()["review_id"])
    assert fresh is not None
    assert fresh.head_sha == delivery.payload["pull_request"]["head"]["sha"]


async def test_webhook_and_api_share_one_enqueue_core(
    client_for: ClientFactory, webhook_settings: Settings, session: AsyncSession
) -> None:
    """G6: one core, two doors — the rows differ only in `trigger` (AC-20's API half)."""
    delivery = webhook_delivery("pull_request_synchronize")

    async with client_for(webhook_settings) as client:
        from_webhook = await _post(client, delivery)
        from_api = await client.post(
            "/v1/reviews",
            json={
                "pr_url": "https://github.com/octocat/hello-world/pull/42",
                "options": {"force": True},
            },
        )

    webhook_run = await session.get(models.ReviewRun, from_webhook.json()["review_id"])
    api_run = await session.get(models.ReviewRun, from_api.json()["review_id"])
    assert webhook_run is not None and api_run is not None
    assert webhook_run.pull_request_id == api_run.pull_request_id
    assert (webhook_run.trigger, api_run.trigger) == ("webhook", "api")

    events = (
        (
            await session.execute(
                sa.select(models.AuditEvent).order_by(models.AuditEvent.seq)
            )
        )
        .scalars()
        .all()
    )
    assert [event.event_type for event in events] == ["review.requested", "review.requested"]
    assert [event.actor_type for event in events] == ["system", "human"]
