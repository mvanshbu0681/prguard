"""One core, two doors — spec §4.2, G6, AC-20.

`POST /v1/reviews` and `POST /webhooks/github` both call `enqueue_review` and both hand the
same id to the same pipeline. The proof is the artefact a human reads: for the same pull
request, the review payload the two runs produce is **byte-identical**, and `trigger` is the
only column that differs.

That property is not free — anything run-specific leaking into the review body would break it
— which is exactly why it is asserted rather than assumed.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import respx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.core.pipeline import Pipeline
from prguard.core.queue import SyncJobQueue
from prguard.db import models
from tests.fixtures.loader import RecordedDelivery, webhook_delivery
from tests.integration.conftest import (
    app_for,
    make_pipeline,
    make_settings,
    mock_delivery,
    mock_pull_request,
    trigger_review,
)

SECRET = "it-is-a-secret-to-everybody"


def signed_headers(delivery: RecordedDelivery) -> dict[str, str]:
    """GitHub signs the raw body: `X-Hub-Signature-256: sha256=<hex>` (§6.10)."""
    digest = hmac.new(SECRET.encode("utf-8"), delivery.raw_body, hashlib.sha256).hexdigest()
    return {**delivery.headers, "X-Hub-Signature-256": f"sha256={digest}"}


async def deliver_webhook(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    pipeline: Pipeline,
    delivery: RecordedDelivery,
    *,
    tenant: str | None = None,
) -> str:
    """Drive a run through the webhook door, inline, and return its id."""
    queue = SyncJobQueue(pipeline.run)
    headers = signed_headers(delivery)
    if tenant is not None:
        headers["X-Tenant-Id"] = tenant
    async with app_for(settings, session_factory, queue) as client:
        response = await client.post(
            "/webhooks/github", content=delivery.raw_body, headers=headers
        )
    assert response.status_code == 202, response.text
    return str(response.json()["review_id"])


async def test_api_and_webhook_produce_identical_review(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    tenant_b: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-20: same PR, two doors, one review payload — differing only in `trigger`.

    The two runs are under different tenants because E21 is doing its job: a second trigger
    for a head SHA that already has a run is *supposed* to be deduplicated. Two tenants is the
    honest way to ask the question AC-20 asks — the same pull request, reviewed twice, through
    two different doors.
    """
    webhook_settings = make_settings(settings, GITHUB_WEBHOOK_SECRET=SECRET)
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)

    api_id = await trigger_review(
        webhook_settings,
        session_factory,
        make_pipeline(settings=webhook_settings, session_factory=session_factory),
    )
    hook_id = await deliver_webhook(
        webhook_settings,
        session_factory,
        make_pipeline(settings=webhook_settings, session_factory=session_factory),
        webhook_delivery("pull_request_synchronize"),
        tenant=tenant_b.slug,
    )

    assert api_id != hook_id, "two triggers, two runs"
    api_run = await session.get(models.ReviewRun, api_id)
    hook_run = await session.get(models.ReviewRun, hook_id)
    assert api_run is not None and hook_run is not None
    await session.refresh(api_run)
    await session.refresh(hook_run)
    assert api_run.status == "succeeded", f"{api_run.error_code}: {api_run.error_message}"
    assert hook_run.status == "succeeded", f"{hook_run.error_code}: {hook_run.error_message}"

    assert json.dumps(api_run.review_payload, sort_keys=True) == json.dumps(
        hook_run.review_payload, sort_keys=True
    ), "AC-20: the review is a function of the pull request, never of the door"
    assert (api_run.trigger, hook_run.trigger) == ("api", "webhook")
    assert routes["review"].call_count == 2, "one review per run, two runs"


async def test_both_doors_reach_the_same_verdict_and_the_same_evidence(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    tenant_b: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """The payload is the visible half; the gate and the fingerprint are the load-bearing one."""
    webhook_settings = make_settings(settings, GITHUB_WEBHOOK_SECRET=SECRET)
    mock_pull_request(github_mock)
    mock_delivery(github_mock)

    api_id = await trigger_review(
        webhook_settings,
        session_factory,
        make_pipeline(settings=webhook_settings, session_factory=session_factory),
    )
    hook_id = await deliver_webhook(
        webhook_settings,
        session_factory,
        make_pipeline(settings=webhook_settings, session_factory=session_factory),
        webhook_delivery("pull_request_synchronize"),
        tenant=tenant_b.slug,
    )

    findings = {
        review_id: (
            await session.execute(
                sa.select(models.Finding).where(models.Finding.review_run_id == review_id)
            )
        )
        .scalars()
        .all()
        for review_id in (api_id, hook_id)
    }
    (api_finding,) = findings[api_id]
    (hook_finding,) = findings[hook_id]

    identities = {
        finding.id: await session.get(models.FindingFingerprint, finding.fingerprint_id)
        for finding in (api_finding, hook_finding)
    }
    assert identities[api_finding.id] is not None
    assert identities[hook_finding.id] is not None
    assert (
        identities[api_finding.id].fingerprint == identities[hook_finding.id].fingerprint
    ), "identity is a property of the code, not of the tenant that asked"
    assert api_finding.proof_status == hook_finding.proof_status == "proven"
    assert api_finding.blocking is hook_finding.blocking is True

    api_run = await session.get(models.ReviewRun, api_id)
    hook_run = await session.get(models.ReviewRun, hook_id)
    assert api_run is not None and hook_run is not None
    assert api_run.gate_conclusion == hook_run.gate_conclusion == "failure"
    assert api_run.risk_tier == hook_run.risk_tier
