"""Reviewer scratch: the two-force-pushes supersede race, on a file-backed database.

The shared root `engine` fixture is one in-memory SQLite connection, so two "concurrent"
sessions there are the same transaction and cannot show an isolation bug at all. This module
builds its own file-backed engine so the two runs really do get two connections.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
import respx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.db import models
from prguard.db.base import new_uuid
from prguard.db.session import create_engine, create_sessionmaker, run_migrations
from tests.integration.conftest import (
    OWNER,
    PR_NUMBER,
    REPO,
    make_pipeline,
    make_settings,
    mock_delivery,
    mock_pull_request,
    recorded,
)


@pytest.fixture
async def file_engine(settings: Settings, tmp_path: Path) -> AsyncIterator[AsyncEngine]:
    url = f"sqlite+aiosqlite:///{tmp_path / 'race.db'}"
    eng = create_engine(make_settings(settings, DATABASE_URL=url))
    await run_migrations(eng)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest.fixture
def file_sessions(file_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return create_sessionmaker(file_engine)


async def _seed(session: AsyncSession) -> tuple[str, str]:
    """A repository, a pull request, and two queued runs that nobody has resolved yet."""
    tenant = (
        await session.execute(sa.select(models.Tenant).where(models.Tenant.slug == "default"))
    ).scalars().one()
    repo = models.Repository(
        id=new_uuid(),
        tenant_id=tenant.id,
        provider="github",
        owner=OWNER,
        name=REPO,
        default_branch="main",
        is_private=False,
    )
    session.add(repo)
    await session.flush()
    pull = models.PullRequest(
        id=new_uuid(),
        tenant_id=tenant.id,
        repository_id=repo.id,
        number=PR_NUMBER,
        title="fix billing",
        author_login="octocat",
        state="open",
        is_draft=False,
    )
    session.add(pull)
    await session.flush()
    ids: list[str] = []
    for _ in range(2):
        run = models.ReviewRun(
            id=new_uuid(),
            tenant_id=tenant.id,
            pull_request_id=pull.id,
            trigger="webhook",
            status=models.RunStatus.QUEUED.value,
            degradations=[],
            context_truncated=False,
            findings_total=0,
            findings_published=0,
            findings_suppressed=0,
            findings_blocking=0,
        )
        session.add(run)
        ids.append(run.id)
    await session.commit()
    return ids[0], ids[1]


async def test_two_queued_runs_do_not_both_get_cancelled(
    settings: Settings,
    file_sessions: async_sessionmaker[AsyncSession],
    github_mock: respx.Router,
) -> None:
    """§4.2: after two rapid triggers, one run must survive and review the head SHA."""
    mock_pull_request(github_mock)
    routes = mock_delivery(github_mock)
    # Both runs finish S1's reads at the same moment: the interleaving two workers of a
    # default deployment produce, made deterministic.
    barrier = asyncio.Barrier(2)

    async def in_lockstep(request: httpx.Request) -> httpx.Response:
        await barrier.wait()
        return recorded("pr_42_files")

    github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/files").mock(
        side_effect=in_lockstep
    )
    async with file_sessions() as setup:
        first, second = await _seed(setup)

    pipeline_a = make_pipeline(settings=settings, session_factory=file_sessions)
    pipeline_b = make_pipeline(settings=settings, session_factory=file_sessions)

    await asyncio.gather(pipeline_a.run(first), pipeline_b.run(second))

    async with file_sessions() as check:
        rows = (
            (
                await check.execute(
                    sa.select(models.ReviewRun).order_by(models.ReviewRun.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
    states = [(row.status, row.error_code, row.head_sha) for row in rows]
    assert any(row.status == "succeeded" for row in rows), (
        f"both runs ended without reviewing the pull request: {states}; "
        f"reviews posted: {routes['review'].call_count}"
    )
