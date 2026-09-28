"""The suppression ledger — spec §6.6, §6.7, AC-8a.

A ledger without reasons is not evidence, and a ledger you can delete from is not a ledger:
`DELETE` revokes, the row survives, and every write lands in the audit chain.

T9 appended `::test_suppress_then_rerun_excludes_finding` in wave 3 (plan §9.2): the
end-to-end half of AC-8 needs a pipeline to re-run, and E29's break-glass event needs a
finding the gate would otherwise have blocked on.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
import respx
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.db import models
from tests.conftest import RowFactory
from tests.integration.conftest import (
    make_pipeline,
    make_settings,
    mock_delivery,
    mock_pull_request,
    trigger_review,
)

REASON = "We intentionally allow bare except in the CLI entrypoint; discussed 2026-08-11."


async def _finding_with_fingerprint(
    rows: RowFactory,
    tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> tuple[models.ReviewRun, models.Finding, models.FindingFingerprint]:
    run = await rows.review_run(tenant, pull_request)
    fingerprint = await rows.fingerprint(tenant, repository)
    finding = await rows.finding(
        tenant,
        run,
        fingerprint_id=fingerprint.id,
        status=models.FindingStatus.PUBLISHED.value,
    )
    return run, finding, fingerprint


async def test_suppress_records_the_decision_and_its_side_effects(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """§6.6: finding → `suppressed`, a `finding_outcomes` row, a `suppression.created` event."""
    run, finding, fingerprint = await _finding_with_fingerprint(
        rows, default_tenant, repository, pull_request
    )

    response = await client.post(
        f"/v1/findings/{finding.id}/suppress",
        json={
            "scope": "pattern",
            "reason": REASON,
            "expires_at": "2027-03-01T00:00:00Z",
            "match_path": "cli/**",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["scope"] == "pattern"
    assert body["match_path"] == "cli/**"
    assert body["reason"] == REASON
    assert body["fingerprint"] == fingerprint.fingerprint
    assert body["source"] == "human_api"
    assert body["expires_at"] == "2027-03-01T00:00:00Z"
    assert body["revoked_at"] is None
    assert body["affected_findings"] == {"this_run": 1, "historical": 0}
    assert body["created_at"].endswith("Z")

    await session.refresh(finding)
    assert finding.status == "suppressed"
    assert finding.suppression_id == body["suppression_id"]

    outcomes = (await session.execute(sa.select(models.FindingOutcome))).scalars().all()
    assert [(row.finding_id, row.outcome) for row in outcomes] == [(finding.id, "dismissed")]

    events = (await session.execute(sa.select(models.AuditEvent))).scalars().all()
    assert [event.event_type for event in events] == ["suppression.created"]
    assert events[0].actor_type == "human"
    assert events[0].finding_id == finding.id
    assert events[0].review_run_id == run.id
    assert events[0].payload["scope"] == "pattern"
    assert events[0].payload["reason"] == REASON


async def test_suppress_counts_historical_matches(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    run, finding, fingerprint = await _finding_with_fingerprint(
        rows, default_tenant, repository, pull_request
    )
    await rows.finding(default_tenant, run, fingerprint_id=fingerprint.id)
    older_run = await rows.review_run(default_tenant, pull_request)
    for _ in range(3):
        await rows.finding(default_tenant, older_run, fingerprint_id=fingerprint.id)

    response = await client.post(
        f"/v1/findings/{finding.id}/suppress", json={"scope": "repo", "reason": REASON}
    )

    assert response.json()["affected_findings"] == {"this_run": 2, "historical": 3}


async def test_suppress_rejects_an_empty_reason_or_a_missing_match_path(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    _, finding, _ = await _finding_with_fingerprint(
        rows, default_tenant, repository, pull_request
    )

    empty_reason = await client.post(
        f"/v1/findings/{finding.id}/suppress", json={"scope": "repo", "reason": "   "}
    )
    no_match_path = await client.post(
        f"/v1/findings/{finding.id}/suppress", json={"scope": "pattern", "reason": REASON}
    )

    for response in (empty_reason, no_match_path):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_suppress_on_an_unknown_finding_is_not_found(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/findings/f-nope/suppress", json={"scope": "repo", "reason": REASON}
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FINDING_NOT_FOUND"


async def test_ledger_lists_suppression_with_reason(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """AC-8a: reason, scope, actor and `suppressed_count` are all on the ledger row."""
    _, finding, fingerprint = await _finding_with_fingerprint(
        rows, default_tenant, repository, pull_request
    )
    created = await client.post(
        f"/v1/findings/{finding.id}/suppress",
        json={"scope": "pattern", "reason": REASON, "match_path": "cli/**"},
    )

    response = await client.get("/v1/suppressions")

    assert response.status_code == 200
    body = response.json()
    assert body["totals"] == {"active": 1, "expired": 0, "revoked": 0}
    assert body["page"] == {"limit": 50, "next_cursor": None, "has_more": False}
    (item,) = body["items"]
    assert item["suppression_id"] == created.json()["suppression_id"]
    assert item["scope"] == "pattern"
    assert item["match_path"] == "cli/**"
    assert item["reason"] == REASON
    assert item["rule_key"] == fingerprint.rule_key
    assert item["category"] == fingerprint.category
    assert item["created_by"]
    assert item["source"] == "human_api"
    assert item["active"] is True
    assert item["revoked_at"] is None
    assert item["suppressed_count"] == 1
    assert item["last_matched_at"] is not None


async def test_ledger_filters_and_reports_expiry(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
) -> None:
    other_repo = await rows.repository(default_tenant, name="other")
    fingerprint = await rows.fingerprint(default_tenant, repository)
    live = await rows.suppression(
        default_tenant,
        repository_id=repository.id,
        fingerprint_id=fingerprint.id,
        scope=models.SuppressionScope.REPO.value,
    )
    expired = await rows.suppression(
        default_tenant,
        repository_id=repository.id,
        scope=models.SuppressionScope.FILE.value,
        expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    revoked = await rows.suppression(
        default_tenant,
        repository_id=other_repo.id,
        scope=models.SuppressionScope.TENANT.value,
        revoked_at=datetime.now(UTC),
    )

    active_only = await client.get("/v1/suppressions")
    everything = await client.get("/v1/suppressions", params={"active": "false"})
    by_repository = await client.get(
        "/v1/suppressions", params={"repository": "octocat/other", "active": "false"}
    )
    by_scope = await client.get(
        "/v1/suppressions", params={"scope": "file", "active": "false"}
    )
    by_fingerprint = await client.get(
        "/v1/suppressions", params={"fingerprint": fingerprint.fingerprint}
    )

    assert [item["suppression_id"] for item in active_only.json()["items"]] == [live.id]
    assert active_only.json()["totals"] == {"active": 1, "expired": 1, "revoked": 1}
    assert len(everything.json()["items"]) == 3
    assert [item["suppression_id"] for item in by_repository.json()["items"]] == [revoked.id]
    assert [item["suppression_id"] for item in by_scope.json()["items"]] == [expired.id]
    assert [item["active"] for item in by_scope.json()["items"]] == [False]
    assert [item["suppression_id"] for item in by_fingerprint.json()["items"]] == [live.id]


async def test_delete_is_a_soft_revoke(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """§5.1: rows are never deleted — the ledger must be append-only to be evidence."""
    _, finding, _ = await _finding_with_fingerprint(
        rows, default_tenant, repository, pull_request
    )
    created = await client.post(
        f"/v1/findings/{finding.id}/suppress", json={"scope": "repo", "reason": REASON}
    )
    suppression_id = created.json()["suppression_id"]

    response = await client.delete(f"/v1/suppressions/{suppression_id}")

    assert response.status_code == 200
    assert response.json()["suppression_id"] == suppression_id
    assert response.json()["active"] is False
    assert response.json()["revoked_at"] is not None
    assert response.json()["reason"] == REASON

    surviving = await session.get(models.Suppression, suppression_id)
    assert surviving is not None, "the row survives; only `revoked_at` is written"
    assert surviving.revoked_at is not None

    events = (await session.execute(sa.select(models.AuditEvent))).scalars().all()
    assert [event.event_type for event in events] == [
        "suppression.created",
        "suppression.revoked",
    ]


async def test_revoking_twice_is_not_found_free_but_idempotent(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
) -> None:
    suppression = await rows.suppression(default_tenant)

    first = await client.delete(f"/v1/suppressions/{suppression.id}")
    second = await client.delete(f"/v1/suppressions/{suppression.id}")
    missing = await client.delete("/v1/suppressions/s-nope")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["revoked_at"] == first.json()["revoked_at"]
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "SUPPRESSION_NOT_FOUND"


async def test_ledger_is_scoped_to_the_requesting_tenant(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    tenant_b: models.Tenant,
) -> None:
    suppression = await rows.suppression(default_tenant)

    listed = await client.get("/v1/suppressions", headers={"X-Tenant-Id": tenant_b.slug})
    revoke = await client.delete(
        f"/v1/suppressions/{suppression.id}", headers={"X-Tenant-Id": tenant_b.slug}
    )

    assert listed.json()["items"] == []
    assert revoke.status_code == 404


# --------------------------------------------------------------------------------------
# T9 — the ledger applied by a real run (AC-8b, E29)
# --------------------------------------------------------------------------------------
@pytest.fixture
def github_mock() -> Iterator[respx.Router]:
    """respx over the GitHub API base, for the tests here that run a whole review."""
    with respx.mock(base_url="https://api.github.com", assert_all_called=False) as router:
        yield router


async def test_suppress_then_rerun_excludes_finding(
    client: AsyncClient,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    settings: Settings,
    github_mock: respx.Router,
) -> None:
    """AC-8b: suppress a finding, re-run the PR, and it is `suppressed` and unpublished.

    E29 rides along, because the finding being silenced here is the one that turned the gate
    red: the suppression wins, the proof artifact from the run that proved it is still on the
    record, and `override.break_glass` names the human who decided (§5.4).
    """
    posting = make_settings(settings, GITHUB_TOKEN="ghp_test_token")
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)

    first_id = await trigger_review(
        posting,
        session_factory,
        make_pipeline(settings=posting, session_factory=session_factory),
    )
    first = (
        (
            await session.execute(
                sa.select(models.Finding).where(models.Finding.review_run_id == first_id)
            )
        )
        .scalars()
        .one()
    )
    assert (first.status, first.blocking) == ("published", True), "it blocked before"

    created = await client.post(
        f"/v1/findings/{first.id}/suppress",
        json={"scope": "repo", "reason": REASON},
        headers={"X-Actor-Id": "vansh.m@shavastudios.ai"},
    )
    assert created.status_code == 201

    second_id = await trigger_review(
        posting,
        session_factory,
        make_pipeline(settings=posting, session_factory=session_factory),
        force=True,
    )

    second = (
        (
            await session.execute(
                sa.select(models.Finding).where(models.Finding.review_run_id == second_id)
            )
        )
        .scalars()
        .one()
    )
    assert second.status == "suppressed"
    assert second.suppression_id == created.json()["suppression_id"]
    assert second.blocking is False, "a suppressed finding cannot block a merge"
    assert second.proof_status == "not_attempted", "we do not spend a sandbox on a silenced bug"

    run = await session.get(models.ReviewRun, second_id)
    assert run is not None
    await session.refresh(run)
    assert run.status == "succeeded"
    assert run.findings_suppressed == 1
    assert run.findings_published == 0
    assert run.gate_conclusion == "success", "nothing left to block on"
    assert run.review_payload is not None
    assert run.review_payload["comments"] == [], "AC-8b: excluded from the review payload"
    assert "No blocking issues found" in run.review_payload["body"]
    assert routes["review"].call_count == 2

    result = await client.get(f"/v1/reviews/{second_id}/result")
    assert result.status_code == 200
    assert result.json()["counts"]["suppressed"] == 1
    assert result.json()["counts"]["published"] == 0
    (rendered,) = result.json()["findings"]
    assert rendered["status"] == "suppressed"
    assert rendered["suppression"]["reason"] == REASON

    ledger = await client.get("/v1/suppressions")
    (item,) = ledger.json()["items"]
    assert item["reason"] == REASON
    assert item["scope"] == "repo"
    assert item["created_by"] == "vansh.m@shavastudios.ai"
    assert item["suppressed_count"] == 2, "both sightings of the fingerprint"

    events = (
        (
            await session.execute(
                sa.select(models.AuditEvent)
                .where(models.AuditEvent.review_run_id == second_id)
                .order_by(models.AuditEvent.seq.asc())
            )
        )
        .scalars()
        .all()
    )
    kinds = [event.event_type for event in events]
    assert "finding.suppressed" in kinds
    assert "override.break_glass" in kinds, "E29: silencing a blocking-eligible finding is loud"
    assert "finding.published" not in kinds
    break_glass = next(event for event in events if event.event_type == "override.break_glass")
    assert break_glass.actor_type == "human"
    assert break_glass.actor_id == "vansh.m@shavastudios.ai"
    assert break_glass.payload["reason"] == REASON
    assert break_glass.payload["severity_band"] == "high"
    assert break_glass.finding_id == second.id

    artifacts = (
        (
            await session.execute(
                sa.select(models.ProofArtifact).where(
                    models.ProofArtifact.finding_id == first.id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(artifacts) == 1, "E29: the finding is suppressed *with* its proof artifact"
    assert artifacts[0].outcome == "failing_as_expected"
