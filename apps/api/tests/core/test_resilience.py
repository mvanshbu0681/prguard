"""Spec §8.1 as a test file — what the pipeline does when each dependency is down. AC-23a.

The table in §8.1 is the product's honesty policy, and every row of it is a decision the
pipeline makes rather than an exception it propagates:

* one specialist fails → the review ships with the rest, and says one is missing;
* **every** specialist fails → the run fails with `LLM_UNAVAILABLE` and **nothing is posted**,
  because a missing gate is safer than a wrong green;
* the coordinator fails → a deterministic merge, dumber and louder, never silent;
* GitHub fails in S1 → fatal; in S2 → that file leaves context; in S8 → the payload is kept
  and the run still succeeds.

And under all of them: **no exception escapes the worker.**
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
import respx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.core.pipeline import Pipeline
from prguard.db import models
from tests.fixtures.loader import llm_fixture
from tests.integration.conftest import (
    API_BASE,
    OWNER,
    PR_NUMBER,
    REPO,
    fake_llm,
    make_pipeline,
    make_settings,
    mock_delivery,
    mock_pull_request,
    recorded,
    trigger_review,
)

#: A chatty non-JSON answer. The structured layer repairs once, then gives up (E23).
PROSE = llm_fixture("specialist_quality_prose").response_text


@pytest.fixture
def github_mock() -> Iterator[respx.Router]:
    with respx.mock(base_url=API_BASE, assert_all_called=False) as router:
        yield router


@pytest.fixture
def posting_settings(settings: Settings) -> Settings:
    """§4.8's `auto` delivery mode posts when there is a token to post with."""
    return make_settings(settings, GITHUB_TOKEN="ghp_test_token")


async def _run_of(session: AsyncSession, review_id: str) -> models.ReviewRun:
    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    return run


async def _findings_of(session: AsyncSession, review_id: str) -> list[models.Finding]:
    return list(
        (
            await session.execute(
                sa.select(models.Finding).where(models.Finding.review_run_id == review_id)
            )
        )
        .scalars()
        .all()
    )


# ---------------------------------------------------------------------------------------
# Anthropic (§8.1 row 2)
# ---------------------------------------------------------------------------------------
async def test_single_specialist_failure_degrades(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-23a: the bugs reviewer falls over; the review ships with what the others found."""
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)
    # `bugs` answers in prose and is unrecoverable; `security` finds what it found.
    llm = fake_llm(
        {
            "Reviewer: bugs": PROSE,
            "Reviewer: security": llm_fixture("specialist_bugs_valid").response_text,
        }
    )

    review_id = await trigger_review(
        posting_settings,
        session_factory,
        make_pipeline(settings=posting_settings, session_factory=session_factory, llm=llm),
    )

    run = await _run_of(session, review_id)
    assert run.status == "succeeded", f"{run.error_code}: {run.error_message}"
    assert "specialist_bugs_failed" in run.degradations, "E23's exact degradation key"
    assert run.error_code is None
    (finding,) = await _findings_of(session, review_id)
    assert finding.status == "published", "a failed reviewer does not silence the others"
    assert finding.specialist == "security"
    assert routes["review"].call_count == 1


async def test_total_llm_outage_fails_run_cleanly(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-23a: every reviewer down → `failed`/`LLM_UNAVAILABLE`, nothing posted, no exception."""
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)
    outage = fake_llm(
        {f"Reviewer: {name}": PROSE for name in ("bugs", "security", "tests", "quality")}
    )

    # If anything escaped the pipeline this would be a 500 rather than a 202.
    review_id = await trigger_review(
        posting_settings,
        session_factory,
        make_pipeline(settings=posting_settings, session_factory=session_factory, llm=outage),
    )

    run = await _run_of(session, review_id)
    assert run.status == "failed"
    assert run.error_code == "LLM_UNAVAILABLE"
    assert run.error_message
    assert run.finished_at is not None
    assert run.stage == "specialists", "it failed where it failed, and says so"
    assert await _findings_of(session, review_id) == []
    assert routes["review"].call_count == 0, "§8.1: nothing is posted to GitHub"
    assert run.gate_conclusion is None, "a missing gate is safer than a wrong green"
    assert run.review_payload is None

    events = (
        (
            await session.execute(
                sa.select(models.AuditEvent)
                .where(models.AuditEvent.review_run_id == review_id)
                .order_by(models.AuditEvent.seq.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [event.event_type for event in events][-1] == "review.failed"
    assert events[-1].payload["error_code"] == "LLM_UNAVAILABLE"


async def test_coordinator_failure_falls_back_to_a_deterministic_merge(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """§8.1: a dead coordinator is a union with exact dedupe, and it says so out loud."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    llm = fake_llm({"Coordinator": PROSE})

    review_id = await trigger_review(
        posting_settings,
        session_factory,
        make_pipeline(settings=posting_settings, session_factory=session_factory, llm=llm),
    )

    run = await _run_of(session, review_id)
    assert run.status == "succeeded", f"{run.error_code}: {run.error_message}"
    assert "coordinator_fallback" in run.degradations
    findings = await _findings_of(session, review_id)
    rule_keys = sorted(finding.rule_key for finding in findings)
    assert rule_keys == ["promotion_rate_not_normalised", "unguarded_none_arithmetic"], (
        "the fallback keeps everything the reviewers said; it filters nothing"
    )


# ---------------------------------------------------------------------------------------
# GitHub (§8.1 row 1)
# ---------------------------------------------------------------------------------------
async def test_ingest_failure_is_fatal_and_posts_nothing(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """E16: a PR we cannot read ends the run with `PR_NOT_FOUND` and no partial garbage."""
    github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        return_value=recorded("pr_404_not_found")
    )
    routes = mock_delivery(github_mock)

    review_id = await trigger_review(
        posting_settings,
        session_factory,
        make_pipeline(settings=posting_settings, session_factory=session_factory),
    )

    run = await _run_of(session, review_id)
    assert run.status == "failed"
    assert run.error_code == "PR_NOT_FOUND"
    assert run.stage == "ingest"
    assert run.head_sha is None
    assert await _findings_of(session, review_id) == []
    assert routes["review"].call_count == 0


async def test_an_unfetchable_file_leaves_context_without_failing_the_run(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """§8.1 S2: degrading. The file drops out of context and the degradation is recorded."""
    mock_pull_request(github_mock, contents=("app/billing.py",))
    github_mock.get(f"/repos/{OWNER}/{REPO}/contents/app/checkout.py").mock(
        return_value=recorded("file_contents_404")
    )
    mock_delivery(github_mock)

    review_id = await trigger_review(
        posting_settings,
        session_factory,
        make_pipeline(settings=posting_settings, session_factory=session_factory),
    )

    run = await _run_of(session, review_id)
    assert run.status == "succeeded", f"{run.error_code}: {run.error_message}"
    assert "context_file_unfetchable" in run.degradations
    unfetchable = (run.model_config_snapshot or {})["context"]["unfetchable"]
    assert list(unfetchable) == ["app/checkout.py"]


async def test_a_403_on_the_review_keeps_the_payload_and_succeeds(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """E17/§8.1 S8: the demo runs off `/result` when the token cannot write."""
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)
    routes["review"].mock(return_value=recorded("review_403_forbidden"))

    review_id = await trigger_review(
        posting_settings,
        session_factory,
        make_pipeline(settings=posting_settings, session_factory=session_factory),
    )

    run = await _run_of(session, review_id)
    assert run.status == "succeeded", "delivery degrades; it never fails a run"
    assert run.delivery_status == "degraded"
    assert run.review_payload is not None
    assert run.review_payload["event"] == "COMMENT"
    assert len(run.review_payload["comments"]) == 1, "the payload we would have posted"
    assert run.github_review_id is None
    assert run.gate_conclusion == "failure", "the verdict survives a failed delivery"


async def test_a_pr_that_closed_mid_run_is_analysed_and_not_posted(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """E19: `delivery_status="skipped_pr_closed"` — seventeen characters, and it persists."""
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)
    # S1 reads the PR as open; by S8 it has been merged.
    github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        side_effect=[recorded("pr_detail"), recorded("pr_detail_closed")]
    )

    review_id = await trigger_review(
        posting_settings,
        session_factory,
        make_pipeline(settings=posting_settings, session_factory=session_factory),
    )

    run = await _run_of(session, review_id)
    assert run.status == "succeeded"
    assert run.delivery_status == "skipped_pr_closed"
    assert routes["review"].call_count == 0, "we do not comment on a closed pull request"
    assert run.review_payload is not None, "the analysis is still worth keeping"


async def test_a_pipeline_crash_never_escapes_the_worker(
    posting_settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """§8.1: "never crashes a worker". An unforeseen failure costs one run, not the pool.

    A stage is made to raise something the policy does not name — not a `FatalStage`, not a
    `GitHubError`, just a bug — because that is the case the catch-all exists for.
    """
    mock_pull_request(github_mock)
    mock_delivery(github_mock)

    async def explode(*_: object, **__: object) -> None:
        raise RuntimeError("the specialists module caught fire")

    monkeypatch.setattr(Pipeline, "_stage_specialists", explode)
    pipeline = make_pipeline(settings=posting_settings, session_factory=session_factory)

    review_id = await trigger_review(posting_settings, session_factory, pipeline)

    run = await _run_of(session, review_id)
    assert run.status == "failed", "the run ends; the worker does not"
    assert run.error_code == "INTERNAL_ERROR"
    assert "the specialists module caught fire" in (run.error_message or "")
    assert run.finished_at is not None


async def test_a_run_that_vanished_is_dropped_rather_than_raised(
    posting_settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The queue is a hint: an id with no row behind it is not an error worth crashing over."""
    pipeline = make_pipeline(settings=posting_settings, session_factory=session_factory)

    await pipeline.run("not-a-review-run")

