"""The suppression ledger — spec §6.6, §6.7, AC-8a.

A ledger without reasons is not evidence, and a ledger you can delete from is not a ledger:
`DELETE` revokes, the row survives, and every write lands in the audit chain.

T9 appends `::test_suppress_then_rerun_excludes_finding` here in wave 3 (plan §9.2).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.db import models
from tests.conftest import RowFactory

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
