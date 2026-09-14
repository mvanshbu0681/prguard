"""`POST /v1/reviews`, `GET /v1/reviews/{id}`, `/result`, `/rerun` — spec §6.1–6.3.

AC-1 is a performance *contract*, not a nicety: the trigger returns 202 in under 500 ms and
makes zero GitHub calls, because the PR is resolved inside the worker (§4.2, R9).
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.db import models
from tests.conftest import RowFactory

PR_URL = "https://github.com/octocat/hello-world/pull/42"


async def test_trigger_returns_202_without_blocking(
    client: AsyncClient,
    job_queue: object,
    session: AsyncSession,
    default_tenant: models.Tenant,
) -> None:
    """AC-1: 202 under 500 ms, run not complete at return, no GitHub call on the path."""
    async with respx.mock(assert_all_called=False) as github:
        any_github_call = github.route(host="api.github.com")
        started = time.perf_counter()
        response = await client.post("/v1/reviews", json={"pr_url": PR_URL})
        elapsed_ms = (time.perf_counter() - started) * 1000

    assert response.status_code == 202
    assert elapsed_ms < 500, f"§4.2 budget is 500 ms, took {elapsed_ms:.0f} ms"
    assert any_github_call.call_count == 0, "the PR is resolved in the worker, not here"

    body = response.json()
    review_id = body["review_id"]
    assert body["status"] == "queued"
    assert body["trigger"] == "api"
    assert body["repository"] == {"owner": "octocat", "name": "hello-world"}
    assert body["pull_request"] == {"number": 42, "head_sha": None}
    assert body["poll_url"] == f"/v1/reviews/{review_id}"
    assert body["result_url"] == f"/v1/reviews/{review_id}/result"
    assert body["created_at"].endswith("Z")
    assert body["deduplicated"] is False

    assert getattr(job_queue, "enqueued", None) == [review_id]

    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    assert run.status == "queued", "the run is not complete at return time"
    assert run.finished_at is None
    assert run.head_sha is None, "the head SHA is resolved inside the worker (§6.1)"
    assert run.tenant_id == default_tenant.id


async def test_the_zero_github_calls_assertion_has_a_working_sensor() -> None:
    """Guards AC-1's instrument: a `call_count == 0` on a blind router proves nothing.

    If respx ever stopped intercepting this process's httpx traffic, the test above would
    still pass while the request path quietly called GitHub. This proves the sensor fires.
    """
    async with respx.mock(assert_all_called=False) as github:
        any_github_call = github.route(host="api.github.com").mock(
            return_value=httpx.Response(200, json={})
        )
        async with httpx.AsyncClient() as probe:
            await probe.get("https://api.github.com/repos/octocat/hello-world/pulls/42")

    assert any_github_call.call_count == 1


@pytest.mark.parametrize(
    ("value", "expected_number"),
    [
        ("https://github.com/octocat/hello-world/pull/42", 42),
        ("http://github.com/octocat/hello-world/pull/42/files", 42),
        ("https://www.github.com/octocat/hello-world/pull/42#issuecomment-1", 42),
        ("github.com/octocat/hello-world/pull/7", 7),
        ("octocat/hello-world#42", 42),
    ],
)
async def test_trigger_accepts_every_documented_pr_reference(
    client: AsyncClient, value: str, expected_number: int
) -> None:
    response = await client.post("/v1/reviews", json={"pr_url": value})

    assert response.status_code == 202
    assert response.json()["pull_request"]["number"] == expected_number
    assert response.json()["repository"] == {"owner": "octocat", "name": "hello-world"}


async def test_trigger_upserts_the_repository_and_pull_request_once(
    client: AsyncClient, session: AsyncSession
) -> None:
    first = await client.post("/v1/reviews", json={"pr_url": PR_URL})
    second = await client.post("/v1/reviews", json={"pr_url": PR_URL, "options": {"force": True}})

    assert {first.status_code, second.status_code} == {202}
    repositories = (await session.execute(sa.select(models.Repository))).scalars().all()
    pull_requests = (await session.execute(sa.select(models.PullRequest))).scalars().all()
    assert len(repositories) == 1
    assert len(pull_requests) == 1


async def test_second_trigger_is_deduplicated_unless_forced(
    client: AsyncClient, session: AsyncSession
) -> None:
    """E21: two triggers for the same head SHA return the same run unless `force`."""
    first = await client.post("/v1/reviews", json={"pr_url": PR_URL})
    again = await client.post("/v1/reviews", json={"pr_url": PR_URL})
    forced = await client.post("/v1/reviews", json={"pr_url": PR_URL, "options": {"force": True}})

    assert again.status_code == 202
    assert again.json()["review_id"] == first.json()["review_id"]
    assert again.json()["deduplicated"] is True

    assert forced.json()["review_id"] != first.json()["review_id"]
    assert forced.json()["deduplicated"] is False

    runs = (await session.execute(sa.select(models.ReviewRun))).scalars().all()
    assert len(runs) == 2


async def test_trigger_records_a_review_requested_audit_event(
    client: AsyncClient, session: AsyncSession
) -> None:
    response = await client.post("/v1/reviews", json={"pr_url": PR_URL})

    events = (await session.execute(sa.select(models.AuditEvent))).scalars().all()
    assert [event.event_type for event in events] == ["review.requested"]
    assert events[0].review_run_id == response.json()["review_id"]
    assert events[0].actor_type == "human"


async def test_status_reports_stage_progress(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-3a: stage, stage_index, stage_label and seconds_since_heartbeat, from a row."""
    run = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        risk_tier=models.RiskTier.FULL.value,
        stage="specialists",
        stage_started_at=datetime.now(UTC) - timedelta(seconds=20),
        heartbeat_at=datetime.now(UTC) - timedelta(seconds=12),
        started_at=datetime.now(UTC) - timedelta(seconds=60),
    )

    response = await client.get(f"/v1/reviews/{run.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["review_id"] == run.id
    assert body["status"] == "running"
    assert body["stage"] == "specialists"
    assert body["stage_index"] == 3, "§4.1 S3 is the third of nine stages"
    assert body["stage_total"] == 9
    assert body["stage_label"] == "Running 4 specialist passes"
    assert 11 <= body["seconds_since_heartbeat"] <= 14
    assert body["risk_tier"] == "full"
    assert body["head_sha"] == run.head_sha
    assert body["degradations"] == []
    assert body["counts"] == {"proposed": 0, "published": 0, "suppressed": 0, "blocking": 0}
    assert body["started_at"].endswith("Z")
    assert body["finished_at"] is None
    assert body["error"] is None


async def test_status_stage_index_advances_with_the_stage(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.RUNNING.value, stage="ingest"
    )
    seen: list[int] = []
    for stage in ("ingest", "context", "specialists", "proof", "delivery", "finalise"):
        run.stage = stage
        await rows.add(run)
        body = (await client.get(f"/v1/reviews/{run.id}")).json()
        seen.append(body["stage_index"])
        assert body["stage_label"]

    assert seen == sorted(seen), "stage_index advances monotonically across the run"
    assert seen == [1, 2, 3, 7, 8, 9]


async def test_status_counts_come_from_the_findings(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value
    )
    await rows.finding(default_tenant, run, status=models.FindingStatus.PROPOSED.value)
    await rows.finding(
        default_tenant, run, status=models.FindingStatus.PUBLISHED.value, blocking=True
    )
    await rows.finding(default_tenant, run, status=models.FindingStatus.SUPPRESSED.value)

    body = (await client.get(f"/v1/reviews/{run.id}")).json()

    assert body["counts"] == {"proposed": 1, "published": 1, "suppressed": 1, "blocking": 1}


async def test_failed_run_is_http_200_with_the_error_in_the_body(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """§6.2: the *run* failed, the *request* did not."""
    run = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.FAILED.value,
        error_code="GITHUB_UNAVAILABLE",
        error_message="GitHub could not be reached.",
        finished_at=datetime.now(UTC),
    )

    response = await client.get(f"/v1/reviews/{run.id}")

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert response.json()["error"] == {
        "code": "GITHUB_UNAVAILABLE",
        "message": "GitHub could not be reached.",
    }


async def test_result_is_conflict_while_the_run_is_unfinished(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.RUNNING.value
    )

    conflict = await client.get(f"/v1/reviews/{run.id}/result")
    partial = await client.get(f"/v1/reviews/{run.id}/result", params={"partial": "true"})

    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "RESULT_NOT_READY"
    assert partial.status_code == 200
    assert partial.json()["status"] == "running"


async def test_result_assembles_the_full_section_6_3_document(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.SUCCEEDED.value,
        risk_tier=models.RiskTier.FULL.value,
        started_at=datetime(2026, 9, 14, 23, 41, 8, tzinfo=UTC),
        finished_at=datetime(2026, 9, 14, 23, 44, 51, tzinfo=UTC),
        gate_conclusion=models.GateConclusion.FAILURE.value,
        gate_delivery=models.GateDelivery.COMMIT_STATUS.value,
        delivery_status=models.DeliveryStatus.POSTED.value,
        github_review_id=2938475,
        review_payload={"event": "COMMENT", "body": "…markdown…", "comments": []},
        context_truncated=False,
        cost_usd_estimate=0.84,
        token_usage={"input_tokens": 142380, "output_tokens": 9120, "cache_read_tokens": 98210},
    )
    blocking = await rows.finding(
        default_tenant,
        run,
        status=models.FindingStatus.PUBLISHED.value,
        proof_status=models.ProofStatus.PROVEN.value,
        blocking=True,
        delivery_mode=models.DeliveryMode.INLINE_EXACT.value,
        delivered_line=42,
        github_comment_id=1839201,
    )
    disproven = await rows.finding(
        default_tenant,
        run,
        status=models.FindingStatus.DISPROVEN.value,
        proof_status=models.ProofStatus.DISPROVEN.value,
    )

    response = await client.get(f"/v1/reviews/{run.id}/result")

    assert response.status_code == 200
    body = response.json()
    assert body["review_id"] == run.id
    assert body["status"] == "succeeded"
    assert body["repository"] == {
        "owner": repository.owner,
        "name": repository.name,
        "default_branch": repository.default_branch,
    }
    assert body["pull_request"]["number"] == pull_request.number
    assert body["pull_request"]["head_sha"] == pull_request.head_sha
    assert body["risk_tier"] == "full"
    assert body["gate"]["conclusion"] == "failure"
    assert body["gate"]["reason"] == (
        "1 finding carries a repro test that passes at base and fails at head."
    )
    assert body["gate"]["delivery"] == "commit_status"
    assert body["gate"]["context_name"] == "prguard/merge-gate"
    assert body["gate"]["blocking_finding_ids"] == [blocking.id]
    assert body["delivery"]["status"] == "posted"
    assert body["delivery"]["event"] == "COMMENT"
    assert body["delivery"]["github_review_id"] == 2938475
    assert body["delivery"]["comments_posted"] == 1
    assert body["delivery"]["ladder_breakdown"] == {
        "inline_exact": 1,
        "inline_nearest": 0,
        "file_level": 0,
        "summary_only": 0,
    }
    assert body["counts"] == {
        "proposed": 0,
        "published": 1,
        "suppressed": 0,
        "dropped": 0,
        "disproven": 1,
        "blocking": 1,
    }
    assert body["cost"] == {
        "usd_estimate": 0.84,
        "input_tokens": 142380,
        "output_tokens": 9120,
        "cache_read_tokens": 98210,
    }
    assert body["timing"]["duration_seconds"] == 223
    assert body["review_payload"]["event"] == "COMMENT"
    assert body["audit_url"] == f"/v1/audit?review_id={run.id}"
    # A disproven finding stays in `/result` with its verdict — being publicly wrong on the
    # record is part of the trust story (§6.4, AC-11).
    assert [item["id"] for item in body["findings"]] == [blocking.id, disproven.id]
    assert body["findings"][1]["status"] == "disproven"
    assert body["findings"][1]["blocking"] is False


async def test_rerun_creates_a_new_run_for_the_same_pull_request(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value
    )

    response = await client.post(f"/v1/reviews/{run.id}/rerun")

    assert response.status_code == 202
    body = response.json()
    assert body["review_id"] != run.id
    assert body["trigger"] == "rerun"
    assert body["status"] == "queued"
    assert body["deduplicated"] is False
    rerun = await session.get(models.ReviewRun, body["review_id"])
    assert rerun is not None
    assert rerun.pull_request_id == pull_request.id


async def test_unknown_review_is_not_found_everywhere(client: AsyncClient) -> None:
    missing = "b9f1c2d0-3a44-4e21-9a0c-6f1c0a2b7e55"
    for response in (
        await client.get(f"/v1/reviews/{missing}"),
        await client.get(f"/v1/reviews/{missing}/result"),
        await client.post(f"/v1/reviews/{missing}/rerun"),
    ):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "REVIEW_NOT_FOUND"
