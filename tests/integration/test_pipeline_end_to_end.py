"""The whole product, once, with the world switched off — AC-4, AC-12b.

This is the test the demo is. A fake model reading T3's recorded completions, a faked GitHub
replaying T3's recorded responses, and a **real** pytest process running a generated repro
against the committed fixture repo at base and at head. Nothing below the classifier is
mocked: the two exit codes that make the gate red are this machine's.

It runs with the network off and the Docker daemon stopped (X7, §9.1), which is the state of
the machine it was written on.
"""

from __future__ import annotations

import json

import respx
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.api.routes_reviews import PIPELINE_STAGES
from prguard.config import Settings
from prguard.core.pipeline import PIPELINE_STAGES as CORE_STAGES
from prguard.db import models
from tests.fixtures.loader import llm_fixture
from tests.integration.conftest import (
    BASE_SHA,
    HEAD_SHA,
    OWNER,
    PR_NUMBER,
    REPO,
    fake_llm,
    local_workspace_source,
    make_pipeline,
    mock_delivery,
    mock_pull_request,
    trigger_review,
)


async def test_full_run_with_fake_backends(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    client: AsyncClient,
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-4: a `succeeded` run whose `/result` carries the whole evidence chain."""
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    review_id = await trigger_review(settings, session_factory, pipeline)

    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    assert run.status == "succeeded", f"{run.error_code}: {run.error_message}"
    assert run.head_sha == HEAD_SHA
    assert run.base_sha == BASE_SHA
    assert run.risk_tier == "full", "app/billing.py is a §4.4 sensitive path"
    assert run.stage == "finalise"
    assert run.finished_at is not None
    assert routes["review"].call_count == 1, "exactly one review per run (§4.7, AC-17)"

    response = await client.get(f"/v1/reviews/{review_id}/result")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["repository"] == {
        "owner": OWNER,
        "name": REPO,
        "default_branch": "main",
    }
    assert body["pull_request"]["number"] == PR_NUMBER
    assert body["pull_request"]["head_sha"] == HEAD_SHA
    assert body["context"]["files_changed"] == 2
    assert body["context"]["files_reviewed"] == 2

    # A finding, with the arithmetic behind its severity (AC-4, AC-5).
    (finding,) = [item for item in body["findings"] if item["status"] == "published"]
    assert finding["rule_key"] == "unguarded_none_arithmetic"
    assert finding["location"]["file_path"] == "app/billing.py"
    assert finding["location"]["symbol_path"] == "app/billing.py::apply_discount"
    assert finding["severity"]["inputs"]["path_sensitivity"] == 1.0
    assert finding["severity"]["inputs"]["proof_confidence"] == 1.0
    assert finding["severity"]["weights"] == dict(settings.SEVERITY_WEIGHTS)
    assert finding["severity"]["explanation"]
    assert finding["fingerprint"]

    # The proof artifact, with both real exit codes (AC-4, M1).
    proof = finding["proof"]
    assert proof["status"] == "proven"
    assert proof["runner"] == "subprocess"
    assert proof["isolation"] == "degraded"
    assert proof["baseline_mode"] == "compared"
    assert proof["base"]["exit_code"] == 0
    assert proof["head"]["exit_code"] == 1
    assert "TypeError" in (proof["head"]["excerpt"] or "")
    assert proof["test_code"]

    # The gate, and the payload that was actually posted.
    assert body["gate"]["conclusion"] == "failure"
    assert body["gate"]["blocking_finding_ids"] == [finding["id"]]
    assert body["gate"]["context_name"] == settings.GATE_CONTEXT_NAME
    assert body["gate"]["delivery"] == "commit_status"
    assert body["delivery"]["status"] == "posted"
    assert body["delivery"]["ladder_breakdown"]["inline_exact"] == 1
    assert body["review_payload"]["event"] == "COMMENT"
    assert len(body["review_payload"]["comments"]) == 1
    assert body["review_payload"]["comments"][0]["path"] == "app/billing.py"
    assert body["counts"]["published"] == 1
    assert body["counts"]["blocking"] == 1


async def test_all_nine_stages_are_recorded_in_order(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-4: "all nine stages recorded" — and in §4.1's order, from the audit chain alone."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    review_id = await trigger_review(settings, session_factory, pipeline)

    stages = (
        (
            await session.execute(
                sa.select(models.AuditEvent)
                .where(
                    models.AuditEvent.review_run_id == review_id,
                    models.AuditEvent.event_type == "review.stage_completed",
                )
                .order_by(models.AuditEvent.seq.asc())
            )
        )
        .scalars()
        .all()
    )

    assert [event.payload["stage"] for event in stages] == list(PIPELINE_STAGES)
    assert [event.payload["stage_index"] for event in stages] == list(range(1, 10))
    assert CORE_STAGES == PIPELINE_STAGES, "core and api must name the nine stages identically"


async def test_the_gate_is_red_only_because_something_was_executed(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-15 through the whole machine: the commit status carries the proven claim."""
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    await trigger_review(settings, session_factory, pipeline)

    assert routes["status"].call_count == 1
    payload = json.loads(routes["status"].calls[0].request.content)
    assert payload["state"] == "failure"
    assert payload["context"] == settings.GATE_CONTEXT_NAME
    assert "repro" in payload["description"]
    assert routes["check_run"].call_count == 0, "E18: rung 1 needs an App token we do not have"


async def test_a_degraded_sandbox_still_publishes_and_still_blocks(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """E14/X7: Docker is stopped on this machine. That is a label, not a verdict."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    review_id = await trigger_review(settings, session_factory, pipeline)

    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    assert run.degradations == ["sandbox_degraded"]
    assert run.status == "succeeded"
    assert run.gate_conclusion == "failure", "a degraded sandbox does not soften a proven bug"


async def test_the_run_persists_what_the_coordinator_refused(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """E15/AC-25b: the hallucinated path is dropped, with its reason, and kept on the record."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    review_id = await trigger_review(settings, session_factory, pipeline)

    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    dropped = (run.model_config_snapshot or {})["dropped"]
    reasons = {item["file_path"]: item["drop_reason"] for item in dropped}
    assert reasons["app/legacy_pricing.py"] == "hallucinated_path"
    assert "app/legacy_pricing.py" not in {
        row.file_path
        for row in (
            await session.execute(
                sa.select(models.Finding).where(models.Finding.review_run_id == review_id)
            )
        )
        .scalars()
        .all()
    }


async def test_the_model_config_snapshot_keeps_what_the_request_asked_for(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """§6.1: the worker merges into `model_config_snapshot`; it never overwrites T7's keys."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    review_id = await trigger_review(
        settings, session_factory, pipeline, pr_url=f"{OWNER}/{REPO}#{PR_NUMBER}"
    )

    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    snapshot = run.model_config_snapshot or {}
    assert snapshot["specialist_model"] == settings.MODEL_SPECIALIST
    assert snapshot["severity_weights"] == dict(settings.SEVERITY_WEIGHTS)
    assert snapshot["context"]["files_reviewed"] == 2
    assert snapshot["context"]["excluded_reasons"] == {}


async def test_proof_failure_modes_leave_the_run_succeeded(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-12b: an inconclusive proof is a finding without a claim, not a broken run."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    pipeline = make_pipeline(
        settings=settings,
        session_factory=session_factory,
        # The repro that asserts the bug instead of the contract: red at base, green at head.
        llm=fake_llm(
            {
                "proof_generator:": llm_fixture("proof_generator_inverted_repro").response_text,
            }
        ),
        workspace_source=local_workspace_source(),
    )

    review_id = await trigger_review(settings, session_factory, pipeline)

    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    assert run.status == "succeeded", "S7 degrades on everything; it never fails a run"
    findings = (
        (
            await session.execute(
                sa.select(models.Finding).where(models.Finding.review_run_id == review_id)
            )
        )
        .scalars()
        .all()
    )
    (finding,) = findings
    assert finding.proof_status == "inconclusive"
    assert finding.blocking is False
    assert run.gate_conclusion == "success", "nothing was proven, so nothing blocks"
    artifacts = (
        (
            await session.execute(
                sa.select(models.ProofArtifact).where(
                    models.ProofArtifact.review_run_id == review_id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(artifacts) == 1, "the attempt is still recorded, verdict and all"
