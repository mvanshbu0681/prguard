"""The app's lifespan — spec §4.2's background mechanism, switched on.

`POST /v1/reviews` returning 202 is worth nothing if no worker ever picks the id up, and a
worker pool is worth nothing if a restart loses the queue. Both halves are asserted here
against the real `create_app`, driven through the real lifespan context manager.

Nothing in this module reaches the network: the only run it puts on the queue is handed to a
recording handler, and the branch that builds the real pipeline is exercised with an empty
database so no stage ever executes.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.core.queue import AsyncioJobQueue, NullJobQueue
from prguard.db import models
from prguard.db.session import (
    create_engine,
    create_sessionmaker,
    dispose_engine,
    run_migrations,
)
from prguard.main import create_app, lifespan
from tests.conftest import RowFactory


@pytest.fixture
async def file_settings(settings: Settings, tmp_path: Path) -> AsyncIterator[Settings]:
    """A real file-backed database, because the lifespan owns its own engine.

    The module-level engine in `db/session.py` is process-global; it is disposed either side
    of this test so a lifespan can never inherit or leak one.
    """
    await dispose_engine()
    resolved = Settings(
        **{**settings.model_dump(), "DATABASE_URL": f"sqlite+aiosqlite:///{tmp_path / 'app.db'}"}
    )
    yield resolved
    await dispose_engine()


async def _seed_queued_run(settings: Settings) -> tuple[str, async_sessionmaker[AsyncSession]]:
    """Put one `queued` run in the database the lifespan will open."""
    engine = create_engine(settings)
    await run_migrations(engine)
    factory = create_sessionmaker(engine)
    async with factory() as session:
        rows = RowFactory(session)
        tenant = await rows.tenant()
        repository = await rows.repository(tenant)
        pull_request = await rows.pull_request(tenant, repository)
        run = await rows.review_run(tenant, pull_request)
        run_id = run.id
    await engine.dispose()
    return run_id, factory


async def test_lifespan_starts_the_pool_and_re_enqueues_queued_runs(
    file_settings: Settings,
) -> None:
    """E22: the queue is a hint. What survives a restart is the row, and it is enough."""
    run_id, _ = await _seed_queued_run(file_settings)
    handled: list[str] = []

    async def handler(review_run_id: str) -> None:
        handled.append(review_run_id)

    engine = create_engine(file_settings)
    queue = AsyncioJobQueue(
        handler, workers=1, session_factory=create_sessionmaker(engine)
    )
    app = create_app(settings=file_settings, job_queue=queue)

    async with lifespan(app):
        assert app.state.job_queue is queue, "a queue the caller supplied is never replaced"
        assert queue.started is True
        await asyncio.wait_for(queue.join(), timeout=5.0)

    assert handled == [run_id]
    assert queue.tasks == (), "stop() leaves no task behind"
    await engine.dispose()


async def test_lifespan_builds_the_real_pool_when_none_was_supplied(
    file_settings: Settings,
) -> None:
    """The production path: `uvicorn prguard.main:app` starts workers and the reaper."""
    app = create_app(settings=file_settings)
    assert isinstance(app.state.job_queue, NullJobQueue), "nothing runs at import time"

    async with lifespan(app):
        queue = app.state.job_queue
        assert isinstance(queue, AsyncioJobQueue)
        assert queue.workers == file_settings.REVIEW_WORKERS
        assert queue.max_concurrency == file_settings.REVIEW_MAX_CONCURRENCY
        assert queue.stale_after_seconds == file_settings.RUN_STALE_SECONDS
        assert len(queue.tasks) == file_settings.REVIEW_WORKERS + 1, "workers plus the reaper"
        assert queue.reaper is not None

    assert queue.tasks == ()


async def test_lifespan_upgrades_the_schema_before_anything_reads_it(
    file_settings: Settings,
) -> None:
    """`alembic upgrade head` on startup — the demo is one command, not two."""
    app = create_app(settings=file_settings)

    async with lifespan(app):
        engine = create_engine(file_settings)
        factory = create_sessionmaker(engine)
        async with factory() as session:
            tenants = (await session.execute(sa.select(models.Tenant))).scalars().all()
        await engine.dispose()

    assert [tenant.slug for tenant in tenants] == ["default"]


async def test_the_asgi_lifespan_protocol_starts_and_stops_the_app(
    file_settings: Settings,
) -> None:
    """`uvicorn prguard.main:app` is the demo's first command; drive it the way uvicorn does.

    Everything else here calls the context manager directly, which would not notice a
    lifespan FastAPI refuses to run. This one speaks the ASGI protocol.
    """
    app = create_app(settings=file_settings)
    inbox: asyncio.Queue[dict[str, str]] = asyncio.Queue()
    sent: list[dict[str, str]] = []

    async def receive() -> dict[str, str]:
        return await inbox.get()

    async def send(message: dict[str, str]) -> None:
        sent.append(message)

    served = asyncio.create_task(
        app({"type": "lifespan", "asgi": {"version": "3.0"}}, receive, send)
    )
    await inbox.put({"type": "lifespan.startup"})
    for _ in range(200):
        if sent:
            break
        await asyncio.sleep(0.01)
    assert sent and sent[0]["type"] == "lifespan.startup.complete", sent
    assert isinstance(app.state.job_queue, AsyncioJobQueue)

    await inbox.put({"type": "lifespan.shutdown"})
    await asyncio.wait_for(served, timeout=10.0)

    assert [message["type"] for message in sent] == [
        "lifespan.startup.complete",
        "lifespan.shutdown.complete",
    ]
    assert app.state.job_queue.tasks == ()
