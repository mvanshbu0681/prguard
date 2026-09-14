"""`GET /v1/findings` and `GET /v1/findings/{id}` — spec §6.4, §6.5.

AC-5b is the API half of M2: severity is *computed*, and the response ships the inputs and
the weights so a dashboard renders "critical because…" without re-deriving anything.
"""

from __future__ import annotations

from datetime import UTC, datetime

from httpx import AsyncClient

from prguard.config import DEFAULT_SEVERITY_WEIGHTS
from prguard.db import models
from tests.conftest import RowFactory

SEVERITY_INPUTS = {
    "reachability": 1.0,
    "blast_radius": 0.7,
    "path_sensitivity": 1.0,
    "coverage_gap": 1.0,
    "churn": 0.35,
    "proof_confidence": 1.0,
}


async def test_response_exposes_severity_inputs(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    """AC-5b: `severity.inputs` **and** `severity.weights`, on both list and detail."""
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(
        default_tenant,
        run,
        severity_band=models.Band.CRITICAL.value,
        severity_score=0.81,
        severity_inputs={
            **SEVERITY_INPUTS,
            "explanation": "reachable from an unauthenticated route × 7 callers × untested",
            "notes": ["churn computed from 7 commits in 90d"],
        },
        llm_severity_hint="high",
        status=models.FindingStatus.PUBLISHED.value,
    )

    listed = await client.get("/v1/findings")
    detail = await client.get(f"/v1/findings/{finding.id}")

    assert listed.status_code == 200
    assert detail.status_code == 200
    for body in (listed.json()["items"][0], detail.json()):
        assert body["id"] == finding.id
        assert body["review_id"] == run.id
        severity = body["severity"]
        assert severity["band"] == "critical"
        assert severity["score"] == 0.81
        assert severity["inputs"] == SEVERITY_INPUTS
        assert severity["weights"] == DEFAULT_SEVERITY_WEIGHTS
        assert severity["explanation"].startswith("reachable from an unauthenticated route")
        assert severity["notes"] == ["churn computed from 7 commits in 90d"]
        assert severity["llm_severity_hint"] == "high", "stored, never used for ranking (§4.4)"
        assert body["location"] == {
            "file_path": "app/billing.py",
            "start_line": 41,
            "end_line": 44,
            "side": "RIGHT",
            "language": "python",
            "symbol_path": None,
        }


async def test_detail_carries_proof_history_and_suppression(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    fingerprint = await rows.fingerprint(
        default_tenant, repository, occurrence_count=2, addressed_count=1, dismissed_count=3
    )
    suppression = await rows.suppression(
        default_tenant, fingerprint_id=fingerprint.id, reason="Intentional in the CLI entrypoint."
    )
    finding = await rows.finding(
        default_tenant,
        run,
        fingerprint_id=fingerprint.id,
        suppression_id=suppression.id,
        status=models.FindingStatus.SUPPRESSED.value,
        proof_status=models.ProofStatus.PROVEN.value,
        delivery_mode=models.DeliveryMode.INLINE_NEAREST.value,
        delivered_line=42,
        github_comment_id=1839201,
    )
    await rows.proof_artifact(
        default_tenant,
        finding,
        run,
        test_file_path=".prguard_proof/test_apply_discount_none.py",
        test_code="def test_none_rate():\n    ...\n",
        command="pytest .prguard_proof/test_apply_discount_none.py -q",
        base_stdout="1 passed in 0.31s",
        head_stderr="E TypeError: unsupported operand type(s)\n1 failed in 0.29s",
    )

    body = (await client.get(f"/v1/findings/{finding.id}")).json()

    assert body["fingerprint"] == fingerprint.fingerprint
    assert body["location"]["symbol_path"] == fingerprint.symbol_path
    assert body["proof"] == {
        "status": "proven",
        "runner": "subprocess",
        "isolation": "degraded",
        "baseline_mode": "compared",
        "test_file_path": ".prguard_proof/test_apply_discount_none.py",
        "test_code": "def test_none_rate():\n    ...\n",
        "command": "pytest .prguard_proof/test_apply_discount_none.py -q",
        "base": {"exit_code": 0, "excerpt": "1 passed in 0.31s"},
        "head": {
            "exit_code": 1,
            "excerpt": "E TypeError: unsupported operand type(s)\n1 failed in 0.29s",
        },
        "duration_ms": 8412,
        "deps_install_ok": True,
    }
    assert body["history"] == {
        "occurrence_count": 2,
        "first_seen_run_id": None,
        "previously_addressed": 1,
        "previously_dismissed": 3,
    }
    assert body["suppression"]["suppression_id"] == suppression.id
    assert body["suppression"]["reason"] == "Intentional in the CLI entrypoint."
    assert body["delivery"] == {
        "mode": "inline_nearest",
        "delivered_line": 42,
        "github_comment_id": 1839201,
    }


async def test_unscored_finding_reports_null_severity(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)

    body = (await client.get(f"/v1/findings/{finding.id}")).json()

    assert body["severity"] is None, "S5 has not run yet; do not invent a band"
    assert body["proof"] == {
        "status": "not_attempted",
        "runner": None,
        "isolation": None,
        "baseline_mode": None,
        "test_file_path": None,
        "test_code": None,
        "command": None,
        "base": None,
        "head": None,
        "duration_ms": None,
        "deps_install_ok": None,
    }


async def test_list_applies_every_documented_filter(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    other_repo = await rows.repository(default_tenant, owner="octocat", name="other")
    other_pr = await rows.pull_request(default_tenant, other_repo, number=7)
    run = await rows.review_run(default_tenant, pull_request)
    other_run = await rows.review_run(default_tenant, other_pr)
    fingerprint = await rows.fingerprint(default_tenant, repository)

    critical = await rows.finding(
        default_tenant,
        run,
        fingerprint_id=fingerprint.id,
        severity_band=models.Band.CRITICAL.value,
        severity_score=0.81,
        severity_inputs=SEVERITY_INPUTS,
        status=models.FindingStatus.PUBLISHED.value,
        proof_status=models.ProofStatus.PROVEN.value,
        blocking=True,
    )
    low = await rows.finding(
        default_tenant,
        run,
        severity_band=models.Band.LOW.value,
        severity_score=0.2,
        severity_inputs=SEVERITY_INPUTS,
        status=models.FindingStatus.PROPOSED.value,
    )
    elsewhere = await rows.finding(default_tenant, other_run)

    async def ids(**params: str) -> list[str]:
        response = await client.get("/v1/findings", params=params)
        assert response.status_code == 200
        return [item["id"] for item in response.json()["items"]]

    assert sorted(await ids(review_id=run.id)) == sorted([critical.id, low.id])
    assert await ids(repository="octocat/other") == [elsewhere.id]
    assert await ids(pr_number="7") == [elsewhere.id]
    assert await ids(fingerprint=fingerprint.fingerprint) == [critical.id]
    assert await ids(status="published") == [critical.id]
    assert await ids(severity_min="high") == [critical.id]
    assert sorted(await ids(severity_min="low")) == sorted([critical.id, low.id])
    assert await ids(blocking="true") == [critical.id]
    assert await ids(proof_status="proven") == [critical.id]


async def test_list_paginates_with_an_opaque_cursor(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    created = [
        await rows.finding(
            default_tenant,
            run,
            title=f"finding {index}",
            created_at=datetime(2026, 9, 14, 23, 40, index, tzinfo=UTC),
        )
        for index in range(5)
    ]

    first = await client.get("/v1/findings", params={"limit": 2})
    body = first.json()

    assert body["page"]["limit"] == 2
    assert body["page"]["has_more"] is True
    assert body["totals"] == {"matched": 5}
    assert [item["title"] for item in body["items"]] == ["finding 4", "finding 3"]

    second = await client.get(
        "/v1/findings", params={"limit": 2, "cursor": body["page"]["next_cursor"]}
    )
    assert [item["title"] for item in second.json()["items"]] == ["finding 2", "finding 1"]

    third = await client.get(
        "/v1/findings", params={"limit": 2, "cursor": second.json()["page"]["next_cursor"]}
    )
    assert [item["id"] for item in third.json()["items"]] == [created[0].id]
    assert third.json()["page"]["has_more"] is False
    assert third.json()["page"]["next_cursor"] is None


async def test_list_limit_is_capped_at_200(client: AsyncClient) -> None:
    response = await client.get("/v1/findings", params={"limit": 201})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_garbage_cursor_is_a_validation_error(client: AsyncClient) -> None:
    response = await client.get("/v1/findings", params={"cursor": "not-a-cursor"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_unknown_finding_is_not_found(client: AsyncClient) -> None:
    response = await client.get("/v1/findings/f-does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FINDING_NOT_FOUND"


async def test_findings_are_scoped_to_the_requesting_tenant(
    client: AsyncClient,
    rows: RowFactory,
    default_tenant: models.Tenant,
    tenant_b: models.Tenant,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, run)

    listed = await client.get("/v1/findings", headers={"X-Tenant-Id": tenant_b.slug})
    detail = await client.get(
        f"/v1/findings/{finding.id}", headers={"X-Tenant-Id": tenant_b.slug}
    )

    assert listed.json()["items"] == []
    assert listed.json()["totals"] == {"matched": 0}
    assert detail.status_code == 404
