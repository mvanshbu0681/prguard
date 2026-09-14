"""Re-review after a force push — spec §7 E3/E4, AC-7b.

The failure this file exists to prevent is the one that makes a bot unreadable: the same bug
reported twice because the author rebased. Run 2 is at a different head SHA with the bug forty
lines lower, and it must post **zero** new comments — the fingerprint survives the drift
(§4.5), the existing comment is updated in place, and the gate is re-set anyway (E4).

The second half of E3 is the other direction: a run still in flight on the old SHA is
cancelled with `SUPERSEDED`, and the worker executing it notices at the next stage boundary.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import respx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.core.queue import ERROR_SUPERSEDED
from prguard.db import models
from tests.conftest import RowFactory
from tests.fixtures.loader import llm_fixture
from tests.integration.conftest import (
    FORCE_PUSH_SHA,
    OWNER,
    PR_NUMBER,
    REPO,
    fake_llm,
    local_workspace_source,
    make_pipeline,
    mock_delivery,
    mock_pull_request,
    recorded,
    trigger_review,
)

#: The comment id GitHub gave run 1's inline comment (`pr_review_comments_existing`).
EXISTING_COMMENT_ID = 1188402931


def drifted(name: str) -> str:
    """A recorded completion with the finding's lines moved to the force-pushed head.

    `repos/buggy_calc_drift` puts the identical bug forty lines lower; the recorded responses
    describe head 1, so the reviewer's line numbers — and only those — move with it. That is
    exactly the input AC-6 says must produce the same fingerprint.
    """
    return (
        llm_fixture(name)
        .response_text.replace('"start_line": 41', '"start_line": 78')
        .replace('"end_line": 44', '"end_line": 81')
    )


def drifted_llm() -> Any:
    return fake_llm(
        {
            "Reviewer: bugs": drifted("specialist_bugs_valid"),
            "Coordinator": drifted("coordinator_valid"),
        }
    )


def mock_force_pushed_head(router: respx.Router) -> None:
    """The same PR after the force push: new head SHA, drifted files, drifted bodies."""
    mock_pull_request(
        router,
        detail="pr_detail_force_push",
        files="pr_files_force_push",
        tree="buggy_calc_drift",
    )
    router.post(f"/repos/{OWNER}/{REPO}/statuses/{FORCE_PUSH_SHA}").mock(
        return_value=recorded("commit_status_created")
    )


def existing_comments_from(run: models.ReviewRun) -> list[dict[str, Any]]:
    """Run 1's posted comments, as GitHub would hand them back on run 2 (E3).

    Built from what this product actually posted rather than from the recorded fixture, so the
    fingerprint marker in the body is the real one and the round trip is what is tested.
    """
    payload = run.review_payload or {}
    return [
        {
            "id": EXISTING_COMMENT_ID + index,
            "path": comment["path"],
            "line": comment.get("line"),
            "side": comment.get("side"),
            "body": comment["body"],
        }
        for index, comment in enumerate(payload.get("comments", []))
    ]


async def _findings_of(session: AsyncSession, review_id: str) -> list[models.Finding]:
    return list(
        (
            await session.execute(
                sa.select(models.Finding)
                .where(models.Finding.review_run_id == review_id)
                .order_by(models.Finding.created_at.asc())
            )
        )
        .scalars()
        .all()
    )


async def test_force_push_posts_no_duplicate_comments(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """AC-7b: the same bug at a new head reuses its comment and posts nothing new."""
    mock_pull_request(github_mock)
    first_routes = mock_delivery(github_mock)
    first_id = await trigger_review(
        settings,
        session_factory,
        make_pipeline(settings=settings, session_factory=session_factory),
    )
    first_run = await session.get(models.ReviewRun, first_id)
    assert first_run is not None
    await session.refresh(first_run)
    assert first_run.status == "succeeded", f"{first_run.error_code}: {first_run.error_message}"
    assert first_routes["review"].call_count == 1
    (first_finding,) = await _findings_of(session, first_id)

    # Run 2: the author force-pushed. Same bug, forty lines lower, new head SHA.
    github_mock.reset()
    mock_force_pushed_head(github_mock)
    second_routes = mock_delivery(github_mock)
    second_routes["comments"].mock(
        return_value=httpx.Response(200, json=existing_comments_from(first_run))
    )
    patched = github_mock.patch(
        f"/repos/{OWNER}/{REPO}/pulls/comments/{EXISTING_COMMENT_ID}"
    ).mock(return_value=httpx.Response(200, json={"id": EXISTING_COMMENT_ID}))

    second_id = await trigger_review(
        settings,
        session_factory,
        make_pipeline(
            settings=settings,
            session_factory=session_factory,
            llm=drifted_llm(),
            workspace_source=local_workspace_source("buggy_calc_drift"),
        ),
    )

    second_run = await session.get(models.ReviewRun, second_id)
    assert second_run is not None
    await session.refresh(second_run)
    assert second_run.status == "succeeded", (
        f"{second_run.error_code}: {second_run.error_message}"
    )
    assert second_run.head_sha == FORCE_PUSH_SHA
    (second_finding,) = await _findings_of(session, second_id)

    assert second_finding.start_line == 78, "the bug moved; the identity did not"
    assert second_finding.fingerprint_id == first_finding.fingerprint_id
    assert second_finding.github_comment_id == EXISTING_COMMENT_ID
    assert patched.call_count == 1, "the existing comment is updated, not replaced"

    posted = json.loads(second_routes["review"].calls[0].request.content)
    assert posted["comments"] == [], "AC-7b: zero new review comments on a re-review"
    assert posted["event"] == "COMMENT"
    assert second_routes["review"].call_count == 1, "E4: the review and gate are still set"

    identity = await session.get(models.FindingFingerprint, second_finding.fingerprint_id)
    assert identity is not None
    assert identity.occurrence_count == 2, "the second sighting is counted, not re-created"


async def test_a_vanished_fingerprint_is_recorded_as_addressed(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """E3: a finding that stopped being reported at the new head was addressed."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    first_id = await trigger_review(
        settings,
        session_factory,
        make_pipeline(settings=settings, session_factory=session_factory),
    )
    (first_finding,) = await _findings_of(session, first_id)

    github_mock.reset()
    mock_force_pushed_head(github_mock)
    mock_delivery(github_mock)
    # The author fixed it: every reviewer comes back empty at the new head.
    empty = llm_fixture("specialist_bugs_empty").response_text
    silent = fake_llm(
        {f"Reviewer: {name}": empty for name in ("bugs", "security", "tests", "quality")}
    )

    second_id = await trigger_review(
        settings,
        session_factory,
        make_pipeline(
            settings=settings,
            session_factory=session_factory,
            llm=silent,
            workspace_source=local_workspace_source("buggy_calc_drift"),
        ),
    )

    second_run = await session.get(models.ReviewRun, second_id)
    assert second_run is not None
    await session.refresh(second_run)
    assert second_run.status == "succeeded"
    assert await _findings_of(session, second_id) == []

    outcomes = (
        (
            await session.execute(
                sa.select(models.FindingOutcome).where(
                    models.FindingOutcome.finding_id == first_finding.id
                )
            )
        )
        .scalars()
        .all()
    )
    assert [outcome.outcome for outcome in outcomes] == ["addressed"]
    assert outcomes[0].evidence["resolved_in_run"] == second_id
    identity = await session.get(models.FindingFingerprint, first_finding.fingerprint_id)
    assert identity is not None
    assert identity.addressed_count == 1


async def test_inflight_run_is_superseded(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
    github_mock: respx.Router,
) -> None:
    """AC-7b/§4.2: the older run is cancelled with `SUPERSEDED`, and its worker stops."""
    stale = await rows.review_run(default_tenant, pull_request, head_sha=None)
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    current_id = await trigger_review(settings, session_factory, pipeline, force=True)

    await session.refresh(stale)
    assert stale.status == "cancelled"
    assert stale.error_code == ERROR_SUPERSEDED
    assert stale.finished_at is not None
    assert stale.head_sha is None, "it never got far enough to resolve one"

    # The worker picks the cancelled run up anyway — the queue is only a hint (§4.2).
    await pipeline.run(stale.id)

    await session.refresh(stale)
    assert stale.status == "cancelled", "a cancelled run is not restarted by its worker"
    assert stale.started_at is None
    assert await _findings_of(session, stale.id) == []
    current = await session.get(models.ReviewRun, current_id)
    assert current is not None
    await session.refresh(current)
    assert current.status == "succeeded", "the run that superseded is unaffected"


async def test_cancellation_is_noticed_at_the_next_stage_boundary(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
    github_mock: respx.Router,
) -> None:
    """§4.2: "workers check for cancellation at every stage boundary" — mid-run, not just at
    the start. The force push lands while S1 is still reading the diff."""
    run = await rows.review_run(default_tenant, pull_request, head_sha=None)

    async def cancel_then_answer(request: httpx.Request) -> httpx.Response:
        async with session_factory() as other:
            await other.execute(
                sa.update(models.ReviewRun)
                .where(models.ReviewRun.id == run.id)
                .values(
                    status=models.RunStatus.CANCELLED.value, error_code=ERROR_SUPERSEDED
                )
            )
            await other.commit()
        return recorded("pr_42_files")

    github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        return_value=recorded("pr_detail")
    )
    github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/files").mock(
        side_effect=cancel_then_answer
    )
    reviews = github_mock.post(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews").mock(
        return_value=recorded("review_created")
    )
    pipeline = make_pipeline(settings=settings, session_factory=session_factory)

    await pipeline.run(run.id)

    await session.refresh(run)
    assert run.status == "cancelled"
    assert run.stage == "ingest", "it stopped at the boundary it was cancelled before"
    assert reviews.call_count == 0, "a cancelled run never posts"
    assert await _findings_of(session, run.id) == []
    stages = (
        (
            await session.execute(
                sa.select(models.AuditEvent).where(
                    models.AuditEvent.review_run_id == run.id,
                    models.AuditEvent.event_type == "review.stage_completed",
                )
            )
        )
        .scalars()
        .all()
    )
    assert [event.payload["stage"] for event in stages] == ["ingest"]
