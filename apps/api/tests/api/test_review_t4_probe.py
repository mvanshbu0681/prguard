"""T4 review probes — reviewer-authored, not part of the shipped suite."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
import respx
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.db import models
from tests.integration.conftest import (
    make_pipeline,
    make_settings,
    mock_delivery,
    mock_pull_request,
    trigger_review,
)

REASON = "reviewer probe: this is an accepted pattern in this file."


@pytest.fixture
def github_mock() -> Iterator[respx.Router]:
    with respx.mock(base_url="https://api.github.com", assert_all_called=False) as router:
        yield router


@pytest.mark.parametrize("suppress_scope", ["file", "line", "tenant", "repo"])
async def test_probe_scope_survives_a_rerun(
    suppress_scope: str,
    client: AsyncClient,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    settings: Settings,
    github_mock: respx.Router,
) -> None:
    posting = make_settings(settings, GITHUB_TOKEN="ghp_test_token")
    mock_pull_request(github_mock)
    mock_delivery(github_mock)

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
    assert first.status == "published"

    created = await client.post(
        f"/v1/findings/{first.id}/suppress",
        json={"scope": suppress_scope, "reason": REASON},
        headers={"X-Actor-Id": "reviewer"},
    )
    assert created.status_code == 201, created.text
    row = await session.get(models.Suppression, created.json()["suppression_id"])
    assert row is not None
    await session.refresh(row)
    print(
        f"\n[{suppress_scope}] ledger row: repository_id={row.repository_id!r} "
        f"fingerprint_id={row.fingerprint_id!r} match_path={row.match_path!r}"
    )

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
    print(f"[{suppress_scope}] after re-run: status={second.status} blocking={second.blocking}")
    assert second.status == "suppressed", (
        f"scope={suppress_scope}: the human's suppression did not survive the re-run"
    )
