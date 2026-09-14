"""Background-work seam — spec §4.2.

The DB is the source of truth and the queue is a hint, so the queue surface is three
methods wide. `AsyncioJobQueue` is a typed stub here; T9 fills in the worker pool, the
startup re-enqueue and the stale-run reaper behind this exact protocol.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol, runtime_checkable

#: What a queue hands to the pipeline: a `review_runs.id`, never a payload.
JobHandler = Callable[[str], Awaitable[None]]


@runtime_checkable
class JobQueue(Protocol):
    """Swap in Celery or Cloudflare Queues without touching the pipeline (spec §4.2)."""

    async def enqueue(self, review_run_id: str) -> None: ...

    async def start(self) -> None: ...

    async def stop(self) -> None: ...


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


class AsyncioJobQueue:
    """In-process `asyncio.Queue` + `REVIEW_WORKERS` workers + reaper — **stub**.

    T9 implements this in wave 3 (plan §9.2); the constructor already takes everything
    §4.2 calls for so callers do not change when it lands.
    """

    def __init__(
        self,
        handler: JobHandler,
        *,
        workers: int = 2,
        max_concurrency: int = 2,
        stale_after_seconds: int = 600,
    ) -> None:
        self._handler = handler
        self.workers = workers
        self.max_concurrency = max_concurrency
        self.stale_after_seconds = stale_after_seconds

    async def enqueue(self, review_run_id: str) -> None:
        raise NotImplementedError("AsyncioJobQueue is implemented in T9 (spec §4.2)")

    async def start(self) -> None:
        raise NotImplementedError("AsyncioJobQueue is implemented in T9 (spec §4.2)")

    async def stop(self) -> None:
        raise NotImplementedError("AsyncioJobQueue is implemented in T9 (spec §4.2)")

    @property
    def depth(self) -> int:
        raise NotImplementedError("AsyncioJobQueue is implemented in T9 (spec §4.2)")
