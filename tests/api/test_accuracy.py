"""`GET /v1/accuracy` — the self-report (spec §6.9, AC-22, AC-11b).

Every number is computed from this deployment's own database, so every number ships with
its `n` and the definition it was computed from, and `caveats` says out loud what the
numbers are not. An honest self-report is the differentiator; an unlabelled ratio is a
marketing claim.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.core import audit
from prguard.db import models
from prguard.db.models import ActorType, AuditEventType
from tests.conftest import RowFactory

NOW = datetime(2026, 9, 14, 23, 0, 0, tzinfo=UTC)


async def _seed_deployment(
    rows: RowFactory,
    tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> dict[str, models.ReviewRun]:
    """Four runs and six findings with hand-checkable arithmetic."""
    succeeded_fast = await rows.review_run(
        tenant,
        pull_request,
        status=models.RunStatus.SUCCEEDED.value,
        created_at=NOW,
        started_at=NOW,
        finished_at=NOW + timedelta(seconds=100),
        gate_conclusion=models.GateConclusion.FAILURE.value,
    )
    succeeded_slow = await rows.review_run(
        tenant,
        pull_request,
        status=models.RunStatus.SUCCEEDED.value,
        created_at=NOW,
        started_at=NOW,
        finished_at=NOW + timedelta(seconds=200),
        gate_conclusion=models.GateConclusion.SUCCESS.value,
    )
    failed = await rows.review_run(
        tenant,
        pull_request,
        status=models.RunStatus.FAILED.value,
        created_at=NOW,
        gate_conclusion=models.GateConclusion.NEUTRAL.value,
    )
    cancelled = await rows.review_run(
        tenant, pull_request, status=models.RunStatus.CANCELLED.value, created_at=NOW
    )

    await rows.finding(
        tenant,
        succeeded_fast,
        status=models.FindingStatus.PUBLISHED.value,
        proof_status=models.ProofStatus.PROVEN.value,
    )
    await rows.finding(
        tenant,
        succeeded_fast,
        status=models.FindingStatus.PUBLISHED.value,
        proof_status=models.ProofStatus.PROVEN.value,
    )
    await rows.finding(
        tenant,
        succeeded_slow,
        status=models.FindingStatus.PUBLISHED.value,
        proof_status=models.ProofStatus.INCONCLUSIVE.value,
    )
    await rows.finding(
        tenant,
        succeeded_slow,
        status=models.FindingStatus.DISPROVEN.value,
        proof_status=models.ProofStatus.DISPROVEN.value,
    )
    dismissed = await rows.finding(
        tenant, succeeded_slow, status=models.FindingStatus.SUPPRESSED.value
    )
    dropped = await rows.finding(
        tenant, succeeded_slow, status=models.FindingStatus.DROPPED.value
    )

    await rows.finding_outcome(tenant, dismissed, outcome=models.OutcomeKind.DISMISSED.value)
    await rows.finding_outcome(tenant, dropped, outcome=models.OutcomeKind.ADDRESSED.value)
    await rows.finding_outcome(
        tenant, dismissed, outcome=models.OutcomeKind.ADDRESSED.value
    )
    return {
        "succeeded_fast": succeeded_fast,
        "succeeded_slow": succeeded_slow,
        "failed": failed,
        "cancelled": cancelled,
    }


async def test_report_math_matches_definitions(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-22: every ratio equals its documented definition against a seeded database."""
    runs = await _seed_deployment(rows, default_tenant, pull_request)
    await audit.append(
        session,
        tenant_id=default_tenant.id,
        event_type=AuditEventType.OVERRIDE_BREAK_GLASS,
        actor_type=ActorType.HUMAN,
        review_run_id=runs["succeeded_fast"].id,
    )

    response = await client.get("/v1/accuracy")

    assert response.status_code == 200
    body = response.json()
    assert body["runs"] == {
        "total": 4,
        "succeeded": 2,
        "failed": 1,
        "cancelled": 1,
        "median_duration_seconds": 150.0,
    }
    assert body["findings"] == {
        "proposed": 6,
        "published": 3,
        "suppressed": 1,
        "dropped_by_coordinator": 1,
        "per_review_published_mean": 0.75,
    }
    assert body["proof"] == {
        "attempted": 4,
        "proven": 2,
        "disproven": 1,
        "inconclusive": 1,
        "skipped_no_env": 0,
        "proven_rate": 0.5,
        "disproven_rate": 0.25,
    }
    proxies = body["precision_proxies"]
    assert proxies["execution_verified_precision"]["value"] == 1.0
    assert proxies["execution_verified_precision"]["n"] == 2
    assert proxies["self_caught_false_positive_rate"]["value"] == 0.25
    assert proxies["self_caught_false_positive_rate"]["n"] == 4
    assert proxies["human_dismissal_rate"]["value"] == 0.333
    assert proxies["human_dismissal_rate"]["n"] == 3
    assert proxies["addressed_rate"]["value"] == 0.667
    assert proxies["addressed_rate"]["n"] == 3
    assert body["gate"] == {
        "runs_red": 1,
        "runs_green": 1,
        "runs_neutral": 1,
        "break_glass_overrides": 1,
    }


async def test_every_metric_has_n_and_definition(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-22: no bare ratio anywhere, and `caveats` is non-empty."""
    await _seed_deployment(rows, default_tenant, pull_request)

    body = (await client.get("/v1/accuracy")).json()

    assert set(body["precision_proxies"]) == {
        "execution_verified_precision",
        "self_caught_false_positive_rate",
        "human_dismissal_rate",
        "addressed_rate",
    }
    for name, metric in body["precision_proxies"].items():
        assert set(metric) == {"value", "n", "definition"}, name
        assert isinstance(metric["n"], int), name
        assert isinstance(metric["definition"], str) and metric["definition"], name
    assert body["caveats"], "§6.9: `caveats` is a required field"
    assert any("not an external benchmark" in caveat.lower() for caveat in body["caveats"])


async def test_disproven_counts_in_fp_rate(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-11b: a finding the system refuted itself shows up in the FP rate, not in silence."""
    run = await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value
    )
    await rows.finding(
        default_tenant,
        run,
        status=models.FindingStatus.PUBLISHED.value,
        proof_status=models.ProofStatus.PROVEN.value,
    )

    before = (await client.get("/v1/accuracy")).json()
    assert before["proof"]["disproven"] == 0
    assert before["precision_proxies"]["self_caught_false_positive_rate"]["value"] == 0.0

    await rows.finding(
        default_tenant,
        run,
        status=models.FindingStatus.DISPROVEN.value,
        proof_status=models.ProofStatus.DISPROVEN.value,
        severity_band=models.Band.INFO.value,
        blocking=False,
    )

    after = (await client.get("/v1/accuracy")).json()
    assert after["proof"] == {
        "attempted": 2,
        "proven": 1,
        "disproven": 1,
        "inconclusive": 0,
        "skipped_no_env": 0,
        "proven_rate": 0.5,
        "disproven_rate": 0.5,
    }
    fp_rate = after["precision_proxies"]["self_caught_false_positive_rate"]
    assert fp_rate == {
        "value": 0.5,
        "n": 2,
        "definition": (
            "disproven / attempted — findings the system itself refuted before publishing"
        ),
    }
    assert after["precision_proxies"]["execution_verified_precision"]["value"] == 1.0, (
        "a disproven finding is never published, so published precision stays 1.0"
    )


async def test_window_and_repository_narrow_the_report(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    await _seed_deployment(rows, default_tenant, pull_request)
    stale_run = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.SUCCEEDED.value,
        created_at=NOW - timedelta(days=90),
    )
    await rows.finding(default_tenant, stale_run)
    other_repo = await rows.repository(default_tenant, name="other")
    other_pr = await rows.pull_request(default_tenant, other_repo, number=7)
    other_run = await rows.review_run(
        default_tenant, other_pr, status=models.RunStatus.SUCCEEDED.value, created_at=NOW
    )
    await rows.finding(default_tenant, other_run)

    everything = (await client.get("/v1/accuracy")).json()
    windowed = (
        await client.get(
            "/v1/accuracy",
            params={
                "since": (NOW - timedelta(days=1)).isoformat(),
                "until": (NOW + timedelta(days=1)).isoformat(),
            },
        )
    ).json()
    scoped = (
        await client.get(
            "/v1/accuracy", params={"repository": f"{repository.owner}/{repository.name}"}
        )
    ).json()

    assert everything["runs"]["total"] == 6
    assert windowed["runs"]["total"] == 5, "the 90-day-old run is outside the window"
    assert windowed["window"]["since"].endswith("Z")
    assert scoped["runs"]["total"] == 5, "the other repository's run is out of scope"
    assert scoped["window"]["repository"] == f"{repository.owner}/{repository.name}"


async def test_empty_deployment_reports_nulls_not_zero_division(client: AsyncClient) -> None:
    body = (await client.get("/v1/accuracy")).json()

    assert body["runs"]["total"] == 0
    assert body["runs"]["median_duration_seconds"] is None
    assert body["proof"]["proven_rate"] is None
    for metric in body["precision_proxies"].values():
        assert metric["value"] is None
        assert metric["n"] == 0
        assert metric["definition"]
    assert body["caveats"]


async def test_accuracy_is_scoped_to_the_requesting_tenant(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    tenant_b: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    await _seed_deployment(rows, default_tenant, pull_request)

    body = (await client.get("/v1/accuracy", headers={"X-Tenant-Id": tenant_b.slug})).json()

    assert body["runs"]["total"] == 0
    assert body["findings"]["proposed"] == 0
