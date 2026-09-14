"""T4 review probe 2 — does a `tenant`-scoped suppression actually span the tenant?"""

from __future__ import annotations

from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.core import suppression
from prguard.core.types import CanonicalFinding, SuppressionRule
from prguard.db import models
from tests.conftest import RowFactory

REASON = "reviewer probe: tenant-wide convention, accepted everywhere."


async def test_probe_tenant_scope_spans_the_tenant(
    client: AsyncClient,
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    run = await rows.review_run(default_tenant, pull_request)
    fp = await rows.fingerprint(default_tenant, repository)
    finding = await rows.finding(
        default_tenant, run, fingerprint_id=fp.id, status=models.FindingStatus.PUBLISHED.value
    )

    created = await client.post(
        f"/v1/findings/{finding.id}/suppress",
        json={"scope": "tenant", "reason": REASON},
    )
    assert created.status_code == 201, created.text
    row = await session.get(models.Suppression, created.json()["suppression_id"])
    assert row is not None
    await session.refresh(row)
    print(f"\ntenant-scope ledger row: repository_id={row.repository_id!r}")

    # Exactly how core/pipeline.py::_suppression_rules builds the domain object.
    rule = SuppressionRule(
        id=row.id,
        tenant_id=row.tenant_id,
        scope="tenant",
        reason=row.reason,
        created_by=row.created_by or "",
        repository_id=row.repository_id,
        fingerprint=fp.fingerprint,
        match_path=row.match_path,
        match_rule_key=row.match_rule_key,
    )
    same_repo = CanonicalFinding(
        id="f-same", tenant_id=default_tenant.id, repository_id=repository.id,
        specialist="bugs", category="correctness", rule_key=row.match_rule_key or "k",
        title="t", body_markdown="b", file_path="app/a.py", start_line=1, end_line=1,
        side="RIGHT", language="python", symbol_path="app/a.py::f", fingerprint=fp.fingerprint,
    )
    other_repo = CanonicalFinding(
        id="f-other", tenant_id=default_tenant.id, repository_id="repo-B-same-tenant",
        specialist="bugs", category="correctness", rule_key=row.match_rule_key or "k",
        title="t", body_markdown="b", file_path="app/a.py", start_line=1, end_line=1,
        side="RIGHT", language="python", symbol_path="app/a.py::f", fingerprint=fp.fingerprint,
    )
    now = datetime.now(UTC)
    print("same repo  ->", suppression.matches(finding=same_repo, rule=rule, now=now))
    print("other repo ->", suppression.matches(finding=other_repo, rule=rule, now=now))
    assert suppression.matches(finding=other_repo, rule=rule, now=now), (
        "a tenant-scoped suppression did not reach a second repository in the same tenant"
    )
