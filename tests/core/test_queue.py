"""The background mechanism — spec §4.2, §7 E22/E3, AC-3b.

Three properties are load-bearing and each has a test below.

1. **The DB is the source of truth, the queue is a hint.** A process restart loses the
   in-memory queue and loses nothing else: every `queued` run is re-enqueued on start, and a
   `running` run whose worker died is reaped into `failed`/`STALE_RUN` rather than sitting
   there forever (E22).
2. **A newer head SHA wins.** Enqueuing for a PR that already has an in-flight run on a
   different SHA cancels the older one with `SUPERSEDED` (E3); the pipeline checks for that at
   every stage boundary.
3. **No exception escapes a worker.** A handler that raises loses its run, not the pool.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.core.queue import (
    ERROR_STALE_RUN,
    ERROR_SUPERSEDED,
    AsyncioJobQueue,
    reap_stale_runs,
    requeue_pending,
    supersede_older_runs,
)
from prguard.db import models
from tests.conftest import RowFactory


def _ago(seconds: int) -> datetime:
    return datetime.now(UTC) - timedelta(seconds=seconds)


async def _drain(queue: AsyncioJobQueue, timeout: float = 5.0) -> None:
    """Wait for every enqueued job to finish, or fail the test rather than hang the suite."""
    await asyncio.wait_for(queue.join(), timeout=timeout)


# ---------------------------------------------------------------------------------------
# The reaper (E22, AC-3b)
# ---------------------------------------------------------------------------------------
async def test_reaper_fails_stale_runs(
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """AC-3b/E22: a run whose heartbeat went quiet is `failed`/`STALE_RUN`, never left running."""
    stale = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        stage="specialists",
        heartbeat_at=_ago(1200),
        started_at=_ago(1300),
    )
    alive = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        stage="proof",
        heartbeat_at=_ago(5),
        started_at=_ago(60),
    )
    queued = await rows.review_run(default_tenant, pull_request)

    reaped = await reap_stale_runs(session, stale_after_seconds=600)

    assert reaped == (stale.id,)
    await session.refresh(stale)
    await session.refresh(alive)
    await session.refresh(queued)
    assert stale.status == "failed"
    assert stale.error_code == ERROR_STALE_RUN
    assert stale.error_message
    assert stale.finished_at is not None
    assert alive.status == "running", "a beating heartbeat is not stale"
    assert queued.status == "queued", "the reaper only touches runs that claim to be running"


async def test_reaper_reaps_a_run_that_never_beat(
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """A worker that died between `running` and its first heartbeat still gets recovered."""
    run = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        heartbeat_at=None,
        started_at=_ago(900),
    )

    assert await reap_stale_runs(session, stale_after_seconds=600) == (run.id,)
    await session.refresh(run)
    assert (run.status, run.error_code) == ("failed", ERROR_STALE_RUN)


async def test_reaping_writes_the_failure_into_the_audit_chain(
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """A run that ends has to say so on the record, even when nobody was there to end it."""
    run = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        stage="proof",
        heartbeat_at=_ago(3600),
    )

    await reap_stale_runs(session, stale_after_seconds=600)

    events = (await session.execute(sa.select(models.AuditEvent))).scalars().all()
    assert [event.event_type for event in events] == ["review.failed"]
    assert events[0].review_run_id == run.id
    assert events[0].actor_type == "system"
    assert events[0].payload["error_code"] == ERROR_STALE_RUN
    assert events[0].payload["stage"] == "proof"


# ---------------------------------------------------------------------------------------
# The supersede rule (§4.2, E3)
# ---------------------------------------------------------------------------------------
async def test_supersede_cancels_older_head_sha(
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """§4.2: a run in flight on the old SHA is cancelled the moment a newer one resolves."""
    old = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        head_sha="a" * 40,
    )
    unresolved = await rows.review_run(default_tenant, pull_request, head_sha=None)
    current = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        head_sha="b" * 40,
    )
    finished = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.SUCCEEDED.value,
        head_sha="a" * 40,
    )

    cancelled = await supersede_older_runs(
        session,
        pull_request_id=pull_request.id,
        head_sha="b" * 40,
        keep_run_id=current.id,
    )

    assert set(cancelled) == {old.id, unresolved.id}
    await session.refresh(old)
    await session.refresh(current)
    await session.refresh(finished)
    assert old.status == "cancelled"
    assert old.error_code == ERROR_SUPERSEDED
    assert old.finished_at is not None
    assert current.status == "running", "the run doing the superseding is never its own victim"
    assert finished.status == "succeeded", "a finished run is history, not a competitor"


async def test_supersede_leaves_a_run_on_the_same_head_sha_alone(
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """E21 deduplicates same-SHA triggers; superseding them too would cancel the survivor."""
    sibling = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        head_sha="b" * 40,
    )
    mine = await rows.review_run(default_tenant, pull_request, head_sha="b" * 40)

    cancelled = await supersede_older_runs(
        session, pull_request_id=pull_request.id, head_sha="b" * 40, keep_run_id=mine.id
    )

    assert cancelled == ()
    await session.refresh(sibling)
    assert sibling.status == "running"


# ---------------------------------------------------------------------------------------
# Startup recovery (E22)
# ---------------------------------------------------------------------------------------
async def test_startup_re_enqueues_every_queued_run(
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """The queue is a hint: a restart rebuilds it from the only record that survived."""
    first = await rows.review_run(default_tenant, pull_request, created_at=_ago(30))
    second = await rows.review_run(default_tenant, pull_request, created_at=_ago(10))
    await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.RUNNING.value
    )
    await rows.review_run(
        default_tenant, pull_request, status=models.RunStatus.SUCCEEDED.value
    )
    seen: list[str] = []

    class _Recorder:
        async def enqueue(self, review_run_id: str) -> None:
            seen.append(review_run_id)

    recovered = await requeue_pending(session, _Recorder())

    assert list(recovered) == [first.id, second.id], "oldest first — a queue, not a stack"
    assert seen == [first.id, second.id]


# ---------------------------------------------------------------------------------------
# The worker pool
# ---------------------------------------------------------------------------------------
async def test_workers_run_every_enqueued_job() -> None:
    handled: list[str] = []

    async def handler(review_run_id: str) -> None:
        handled.append(review_run_id)

    queue = AsyncioJobQueue(handler, workers=2, max_concurrency=2)
    await queue.start()
    try:
        for index in range(5):
            await queue.enqueue(f"run-{index}")
        await _drain(queue)
    finally:
        await queue.stop()

    assert sorted(handled) == [f"run-{index}" for index in range(5)]
    assert queue.depth == 0


async def test_max_concurrency_bounds_simultaneous_runs() -> None:
    """`REVIEW_MAX_CONCURRENCY` is a budget, not a suggestion: four workers, two runs."""
    live = 0
    peak = 0
    release = asyncio.Event()

    async def handler(review_run_id: str) -> None:
        nonlocal live, peak
        live += 1
        peak = max(peak, live)
        await release.wait()
        live -= 1

    queue = AsyncioJobQueue(handler, workers=4, max_concurrency=2)
    await queue.start()
    try:
        for index in range(4):
            await queue.enqueue(f"run-{index}")
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        release.set()
        await _drain(queue)
    finally:
        await queue.stop()

    assert peak <= 2


async def test_a_failing_handler_never_kills_the_pool() -> None:
    """§8.1: "never crashes a worker". One bad run must not stop every later one."""
    handled: list[str] = []

    async def handler(review_run_id: str) -> None:
        if review_run_id == "boom":
            raise RuntimeError("the pipeline exploded")
        handled.append(review_run_id)

    queue = AsyncioJobQueue(handler, workers=1, max_concurrency=1)
    await queue.start()
    try:
        await queue.enqueue("boom")
        await queue.enqueue("run-after")
        await _drain(queue)
    finally:
        await queue.stop()

    assert handled == ["run-after"]


async def test_start_re_enqueues_queued_runs_from_the_database(
    session_factory: async_sessionmaker[AsyncSession],
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """E22 end to end: the pool comes up and immediately picks up what the last one dropped."""
    run = await rows.review_run(default_tenant, pull_request)
    handled: list[str] = []

    async def handler(review_run_id: str) -> None:
        handled.append(review_run_id)

    queue = AsyncioJobQueue(handler, workers=1, session_factory=session_factory)
    await queue.start()
    try:
        await _drain(queue)
    finally:
        await queue.stop()

    assert handled == [run.id]


async def test_stop_is_idempotent_and_leaves_no_task_running() -> None:
    async def handler(review_run_id: str) -> None:  # pragma: no cover - never enqueued
        raise AssertionError("nothing was enqueued")

    queue = AsyncioJobQueue(handler, workers=2)
    await queue.start()
    await queue.stop()
    await queue.stop()

    assert queue.tasks == ()


async def test_enqueue_before_start_is_not_lost() -> None:
    """`POST /v1/reviews` may land before the pool is up; the id must still be picked up."""
    handled: list[str] = []

    async def handler(review_run_id: str) -> None:
        handled.append(review_run_id)

    queue = AsyncioJobQueue(handler, workers=1)
    await queue.enqueue("early")
    await queue.start()
    try:
        await _drain(queue)
    finally:
        await queue.stop()

    assert handled == ["early"]


async def test_the_reaper_task_runs_on_its_interval(
    session_factory: async_sessionmaker[AsyncSession],
    session: AsyncSession,
    rows: RowFactory,
    default_tenant: models.Tenant,
    repository: models.Repository,
    pull_request: models.PullRequest,
) -> None:
    """The reaper is a task in the pool, not a cron job someone forgot to install."""
    stale = await rows.review_run(
        default_tenant,
        pull_request,
        status=models.RunStatus.RUNNING.value,
        heartbeat_at=_ago(3600),
    )

    async def handler(review_run_id: str) -> None:  # pragma: no cover - never enqueued
        raise AssertionError("nothing was enqueued")

    queue = AsyncioJobQueue(
        handler,
        workers=1,
        session_factory=session_factory,
        stale_after_seconds=600,
        reaper_interval_seconds=0.01,
    )
    await queue.start()
    try:
        for _ in range(200):
            await session.refresh(stale)
            if stale.status == "failed":
                break
            await asyncio.sleep(0.01)
    finally:
        await queue.stop()

    assert (stale.status, stale.error_code) == ("failed", ERROR_STALE_RUN)


async def test_the_reaper_survives_a_broken_session(
    rows: RowFactory,
) -> None:
    """A database that is down must not take the pool with it (§8.1, database row)."""

    class _Broken:
        def __call__(self) -> _Broken:
            return self

        async def __aenter__(self) -> None:
            raise RuntimeError("connection refused")

        async def __aexit__(self, *_: object) -> None:  # pragma: no cover - never reached
            return None

    async def handler(review_run_id: str) -> None:  # pragma: no cover - never enqueued
        raise AssertionError("nothing was enqueued")

    queue = AsyncioJobQueue(
        handler,
        workers=1,
        session_factory=_Broken(),  # type: ignore[arg-type]
        reaper_interval_seconds=0.01,
    )
    await queue.start()
    await asyncio.sleep(0.05)
    reaper = queue.reaper
    try:
        assert reaper is not None and not reaper.done(), "the reaper retries, it does not die"
    finally:
        await queue.stop()


@pytest.fixture
async def repository(rows: RowFactory, default_tenant: models.Tenant) -> models.Repository:
    return await rows.repository(default_tenant)


@pytest.fixture
async def pull_request(
    rows: RowFactory, default_tenant: models.Tenant, repository: models.Repository
) -> models.PullRequest:
    return await rows.pull_request(default_tenant, repository)
