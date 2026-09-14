"""Background-work seam — spec §4.2.

The DB is the source of truth and the queue is a hint, so the queue surface is three
methods wide. `AsyncioJobQueue` is the in-process backend: `REVIEW_WORKERS` tasks over an
`asyncio.Queue`, bounded by `REVIEW_MAX_CONCURRENCY`, plus the reaper.

Three recovery mechanisms live here rather than in the pipeline, because each one is about a
run **nobody is currently executing**:

* :func:`requeue_pending` — on startup every `status=queued` run goes back on the queue. A
  process restart loses the in-memory queue and loses nothing else (E22).
* :func:`reap_stale_runs` — a `running` run whose heartbeat is older than
  `RUN_STALE_SECONDS` is `failed` with `error_code=STALE_RUN`. No run is left running
  forever, and the failure is written into the audit chain like any other ending (E22).
* :func:`supersede_older_runs` — the §4.2 supersede rule. The API door cannot apply it at
  enqueue time because the head SHA is resolved inside the worker (§4.2), so the pipeline
  calls this the moment S1 knows the SHA, and every stage boundary re-checks whether *this*
  run was the one superseded (E3).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Final, Protocol, runtime_checkable

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.core import audit
from prguard.db import models
from prguard.db.base import utcnow

logger = logging.getLogger(__name__)

#: What a queue hands to the pipeline: a `review_runs.id`, never a payload.
JobHandler = Callable[[str], Awaitable[None]]

#: `review_runs.error_code` for a run the reaper recovered (§4.2, E22).
ERROR_STALE_RUN: Final[str] = "STALE_RUN"

#: `review_runs.error_code` for a run a newer head SHA replaced (§4.2, E3).
ERROR_SUPERSEDED: Final[str] = "SUPERSEDED"

#: The statuses a run can still be superseded or reaped out of.
IN_FLIGHT: Final[tuple[str, ...]] = (
    models.RunStatus.QUEUED.value,
    models.RunStatus.RUNNING.value,
)

#: How often the reaper sweeps. Well under `RUN_STALE_SECONDS` so a stale run is noticed in
#: the same order of magnitude as it went quiet, `[ASSUMED]` — the spec fixes the threshold,
#: not the sweep.
DEFAULT_REAPER_INTERVAL_SECONDS: Final[float] = 30.0

#: How long `stop()` lets work in flight finish before it cancels. Tearing a transaction in
#: half at shutdown is how a run ends up half-written, `[ASSUMED]`.
DEFAULT_SHUTDOWN_GRACE_SECONDS: Final[float] = 5.0


@runtime_checkable
class JobQueue(Protocol):
    """Swap in Celery or Cloudflare Queues without touching the pipeline (spec §4.2)."""

    async def enqueue(self, review_run_id: str) -> None: ...

    async def start(self) -> None: ...

    async def stop(self) -> None: ...


class Enqueuer(Protocol):
    """The half of :class:`JobQueue` that :func:`requeue_pending` needs."""

    async def enqueue(self, review_run_id: str) -> None: ...


class NullJobQueue:
    """Records enqueues and never executes — the queue the API tests use.

    `POST /v1/reviews` must return before the run completes (AC-1); with this queue that
    is true by construction.
    """

    def __init__(self) -> None:
        self.enqueued: list[str] = []
        self.started = False

    async def enqueue(self, review_run_id: str) -> None:
        self.enqueued.append(review_run_id)

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.started = False

    @property
    def depth(self) -> int:
        return len(self.enqueued)


class SyncJobQueue:
    """Runs the injected handler inline, so integration tests stay deterministic."""

    def __init__(self, handler: JobHandler) -> None:
        self._handler = handler
        self.enqueued: list[str] = []
        self.started = False

    async def enqueue(self, review_run_id: str) -> None:
        self.enqueued.append(review_run_id)
        await self._handler(review_run_id)

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.started = False

    @property
    def depth(self) -> int:
        return 0


# ---------------------------------------------------------------------------------------
# Recovery — the three things that happen to a run nobody is executing
# ---------------------------------------------------------------------------------------
async def requeue_pending(session: AsyncSession, queue: Enqueuer) -> tuple[str, ...]:
    """Push every `status=queued` run back onto ``queue``, oldest first (spec §4.2, E22)."""
    statement = (
        sa.select(models.ReviewRun.id)
        .where(models.ReviewRun.status == models.RunStatus.QUEUED.value)
        .order_by(models.ReviewRun.created_at.asc(), models.ReviewRun.id.asc())
    )
    pending = tuple((await session.execute(statement)).scalars().all())
    for review_run_id in pending:
        await queue.enqueue(review_run_id)
    if pending:
        logger.info("re-enqueued %d queued review run(s) on startup", len(pending))
    return pending


async def reap_stale_runs(
    session: AsyncSession,
    *,
    stale_after_seconds: int,
    now: datetime | None = None,
) -> tuple[str, ...]:
    """Fail every `running` run that stopped beating — spec §4.2, §7 E22.

    "Stopped beating" falls back through `heartbeat_at → started_at → created_at`: a worker
    that died between claiming a run and its first heartbeat leaves no heartbeat at all, and
    that is exactly the crash this exists to recover from.

    The failure is appended to the audit chain, because a run that ended silently is
    indistinguishable from a run that is still thinking.
    """
    moment = now or utcnow()
    cutoff = moment - timedelta(seconds=stale_after_seconds)
    last_sign_of_life = sa.func.coalesce(
        models.ReviewRun.heartbeat_at,
        models.ReviewRun.started_at,
        models.ReviewRun.created_at,
    )
    statement = (
        sa.select(models.ReviewRun)
        .where(
            models.ReviewRun.status == models.RunStatus.RUNNING.value,
            last_sign_of_life < cutoff,
        )
        .order_by(models.ReviewRun.created_at.asc(), models.ReviewRun.id.asc())
    )
    stale = list((await session.execute(statement)).scalars().all())

    reaped: list[str] = []
    for run in stale:
        run.status = models.RunStatus.FAILED.value
        run.error_code = ERROR_STALE_RUN
        run.error_message = (
            f"No heartbeat for more than {stale_after_seconds}s; the worker executing this "
            "run did not survive."
        )
        run.finished_at = moment
        # Commits the row and the event together — see `audit.append`.
        await audit.append(
            session,
            tenant_id=run.tenant_id,
            event_type=models.AuditEventType.REVIEW_FAILED,
            actor_type=models.ActorType.SYSTEM,
            actor_id="reaper",
            review_run_id=run.id,
            payload={
                "error_code": ERROR_STALE_RUN,
                "stage": run.stage,
                "stale_after_seconds": stale_after_seconds,
            },
        )
        reaped.append(run.id)

    if reaped:
        logger.warning("reaped %d stale review run(s): %s", len(reaped), ", ".join(reaped))
    return tuple(reaped)


async def supersede_older_runs(
    session: AsyncSession,
    *,
    pull_request_id: str,
    head_sha: str,
    keep_run_id: str,
    now: datetime | None = None,
) -> tuple[str, ...]:
    """Cancel every **older** in-flight run for this PR that is not on ``head_sha`` (§4.2, E3).

    A run whose `head_sha` is still `null` is superseded too: it was triggered through the API
    door, which does not resolve the SHA on the request path, so "unresolved" means "has not
    got as far as we have".

    Two things make this safe when `REVIEW_WORKERS` genuinely runs two of them at once, which
    E21 (`force:true` during an in-flight run), a webhook racing a forced API call, and the
    startup re-enqueue of two `queued` rows all reach:

    * **It is one conditional UPDATE**, not a read followed by a write. The read-then-write
      version let both workers see the other as unresolved before either commit landed.
    * **It is antisymmetric.** "Not on our SHA" is symmetric — two unresolved runs each read
      the other as older and both ended `cancelled/SUPERSEDED`, so nothing was ever posted to
      the PR. Ordering on `(created_at, id)` — a strict total order over the rows — means only
      the *newer* run can cancel the older one, so §4.2's "sets **the older** run to cancelled"
      is taken literally and exactly one survivor is guaranteed under any interleaving.

    Commits, like every other decision about a run's lifecycle: the cancelled run may be read
    by another worker a millisecond later, and it has to read as cancelled. The commit also
    publishes *our* `head_sha`, so the next worker to arrive compares against a resolved SHA
    instead of a `null`.
    """
    moment = now or utcnow()
    keep_created_at = (
        sa.select(models.ReviewRun.created_at)
        .where(models.ReviewRun.id == keep_run_id)
        .scalar_subquery()
    )
    statement = (
        sa.update(models.ReviewRun)
        .where(
            models.ReviewRun.pull_request_id == pull_request_id,
            models.ReviewRun.id != keep_run_id,
            models.ReviewRun.status.in_(IN_FLIGHT),
            sa.or_(
                models.ReviewRun.head_sha.is_(None),
                models.ReviewRun.head_sha != head_sha,
            ),
            # Strictly older than us, `id` breaking a same-microsecond tie.
            sa.or_(
                models.ReviewRun.created_at < keep_created_at,
                sa.and_(
                    models.ReviewRun.created_at == keep_created_at,
                    models.ReviewRun.id < keep_run_id,
                ),
            ),
        )
        .values(
            status=models.RunStatus.CANCELLED.value,
            error_code=ERROR_SUPERSEDED,
            error_message=f"Superseded by a newer head SHA ({head_sha}).",
            finished_at=moment,
        )
        .returning(models.ReviewRun.id)
        .execution_options(synchronize_session="fetch")
    )
    superseded = tuple((await session.execute(statement)).scalars().all())
    await session.commit()
    return superseded


async def is_cancelled(session: AsyncSession, review_run_id: str) -> bool:
    """Whether this run has been cancelled underneath us — the stage-boundary check (§4.2).

    Read straight from the database rather than from the in-memory row: the cancellation was
    written by a different session, in a different task, and the whole point is to notice it.
    """
    status = await session.scalar(
        sa.select(models.ReviewRun.status).where(models.ReviewRun.id == review_run_id)
    )
    return status == models.RunStatus.CANCELLED.value


# ---------------------------------------------------------------------------------------
# The in-process backend (spec §4.2)
# ---------------------------------------------------------------------------------------
class AsyncioJobQueue:
    """In-process `asyncio.Queue` + `REVIEW_WORKERS` workers + the reaper (spec §4.2).

    ``session_factory`` is optional so a unit test can exercise the pool without a database;
    without it there is no startup re-enqueue and no reaper, and the queue is then genuinely
    just a queue.
    """

    def __init__(
        self,
        handler: JobHandler,
        *,
        workers: int = 2,
        max_concurrency: int = 2,
        stale_after_seconds: int = 600,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        reaper_interval_seconds: float = DEFAULT_REAPER_INTERVAL_SECONDS,
        shutdown_grace_seconds: float = DEFAULT_SHUTDOWN_GRACE_SECONDS,
    ) -> None:
        self._handler = handler
        self.workers = max(1, workers)
        self.max_concurrency = max(1, max_concurrency)
        self.stale_after_seconds = stale_after_seconds
        self.session_factory = session_factory
        self.reaper_interval_seconds = reaper_interval_seconds
        self.shutdown_grace_seconds = shutdown_grace_seconds
        #: `None` is the shutdown sentinel: it wakes a worker parked on `get()` so a clean
        #: stop does not have to cancel one mid-run.
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._semaphore = asyncio.Semaphore(self.max_concurrency)
        self._stopping = asyncio.Event()
        self._workers: list[asyncio.Task[None]] = []
        self._reaper: asyncio.Task[None] | None = None
        self.started = False

    # -- JobQueue -----------------------------------------------------------------------

    async def enqueue(self, review_run_id: str) -> None:
        """Hand a run id to the pool. Never blocks: the queue is unbounded, the DB is the log."""
        self._queue.put_nowait(review_run_id)

    async def start(self) -> None:
        """Bring the pool up, then recover whatever the last process left behind (E22)."""
        if self.started:
            return
        self.started = True
        self._stopping = asyncio.Event()
        self._semaphore = asyncio.Semaphore(self.max_concurrency)
        self._workers = [
            asyncio.create_task(self._work(index), name=f"prguard-worker-{index}")
            for index in range(self.workers)
        ]
        if self.session_factory is not None:
            self._reaper = asyncio.create_task(self._reap(), name="prguard-reaper")
        await self.recover()

    async def stop(self) -> None:
        """Ask every task to finish, wait out the grace period, then cancel what is left.

        Idempotent — shutdown runs on every path, including the one where start() never did.
        """
        self.started = False
        self._stopping.set()
        for _ in self._workers:
            self._queue.put_nowait(None)
        pending = [task for task in self.tasks if not task.done()]
        if pending:
            await asyncio.wait(pending, timeout=self.shutdown_grace_seconds)
        for task in self.tasks:
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        self._workers = []
        self._reaper = None

    # -- introspection, for the lifespan and for tests ----------------------------------

    @property
    def depth(self) -> int:
        return self._queue.qsize()

    @property
    def tasks(self) -> tuple[asyncio.Task[None], ...]:
        return (*self._workers, *((self._reaper,) if self._reaper is not None else ()))

    @property
    def reaper(self) -> asyncio.Task[None] | None:
        return self._reaper

    async def join(self) -> None:
        """Wait until every enqueued run has been handled. Used by tests, not by the app."""
        await self._queue.join()

    async def recover(self) -> tuple[str, ...]:
        """Re-enqueue every `queued` run. The DB is the source of truth, this is the hint."""
        if self.session_factory is None:
            return ()
        try:
            async with self.session_factory() as session:
                return await requeue_pending(session, self)
        except Exception:
            # §8.1: a database that is down at startup must not stop the app from serving
            # `/readyz` with the truth. The next reaper sweep picks the work back up.
            logger.exception("could not re-enqueue pending runs at startup")
            return ()

    # -- tasks ---------------------------------------------------------------------------

    async def _work(self, index: int) -> None:
        while True:
            review_run_id = await self._queue.get()
            if review_run_id is None:
                self._queue.task_done()
                return
            try:
                async with self._semaphore:
                    await self._handler(review_run_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                # §8.1: "never crashes a worker". The pipeline already owns every failure it
                # can name; anything arriving here is a bug, and it costs one run, not the
                # pool. The reaper recovers the row.
                logger.exception("worker %d: review run %s failed", index, review_run_id)
            finally:
                self._queue.task_done()

    async def _reap(self) -> None:
        assert self.session_factory is not None
        while not self._stopping.is_set():
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(
                    self._stopping.wait(), timeout=self.reaper_interval_seconds
                )
            if self._stopping.is_set():
                return
            try:
                async with self.session_factory() as session:
                    await reap_stale_runs(
                        session, stale_after_seconds=self.stale_after_seconds
                    )
            except asyncio.CancelledError:
                raise
            except Exception:
                # A database blip must not take the reaper with it — it is the only thing
                # standing between a crashed worker and a run that says `running` forever.
                logger.exception("the reaper sweep failed; retrying on the next interval")
