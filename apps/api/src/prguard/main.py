"""App factory — exception handlers, request-id middleware, router registration, lifespan.

Spec §4.3. The router registration below is frozen (plan §9.3 rule 3); T9 added only the
lifespan, which is where §4.2's background mechanism is switched on: the worker pool, the
startup re-enqueue of every `queued` run, and the reaper.

`create_app(job_queue=…)` is the seam that keeps that out of the tests' way. A caller that
supplies a queue owns it, and the lifespan leaves it alone — which is why the API suite can
assert that `POST /v1/reviews` returns before a run starts (AC-1) while production runs the
real pool behind the same factory.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import APIRouter, FastAPI, Request, Response

from prguard import __version__
from prguard.api import (
    routes_accuracy,
    routes_audit,
    routes_findings,
    routes_health,
    routes_reviews,
    routes_suppressions,
    routes_webhooks,
)
from prguard.api.errors import REQUEST_ID_HEADER, register_exception_handlers
from prguard.config import Settings, get_settings
from prguard.core.pipeline import Pipeline, PipelineDeps, build_deps
from prguard.core.queue import AsyncioJobQueue, JobQueue, NullJobQueue
from prguard.db.session import dispose_engine, get_engine, get_sessionmaker, run_migrations

logger = logging.getLogger(__name__)

#: Registered in this order; every module owns its own prefix so route paths live with
#: their handlers.
ROUTERS: tuple[APIRouter, ...] = (
    routes_health.router,
    routes_reviews.router,
    routes_findings.router,
    routes_suppressions.router,
    routes_audit.router,
    routes_accuracy.router,
    routes_webhooks.router,
)


def new_request_id() -> str:
    """Per request, logged, and echoed in every audit event raised during it (§6.0)."""
    return uuid4().hex


def build_job_queue(settings: Settings, deps: PipelineDeps | None = None) -> AsyncioJobQueue:
    """The §4.2 pool: `REVIEW_WORKERS` workers, the concurrency bound, and the reaper."""
    session_factory = get_sessionmaker(settings)
    pipeline = Pipeline(
        settings=settings,
        session_factory=session_factory,
        deps=deps if deps is not None else build_deps(settings),
    )
    return AsyncioJobQueue(
        pipeline.run,
        workers=settings.REVIEW_WORKERS,
        max_concurrency=settings.REVIEW_MAX_CONCURRENCY,
        stale_after_seconds=settings.RUN_STALE_SECONDS,
        session_factory=session_factory,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Bring the background mechanism up, and take it down cleanly (spec §4.2).

    The schema is upgraded first because everything after it — the re-enqueue sweep, the
    reaper, the first request — reads tables that migration owns. `alembic upgrade head` is
    idempotent, so this costs a millisecond on an already-current database.

    A queue passed to :func:`create_app` is the caller's: it is started and stopped, never
    replaced. Only the default `NullJobQueue` is swapped for the real pool, so importing this
    module never spawns a worker by accident.
    """
    settings: Settings = app.state.settings
    engine = get_engine(settings)
    await run_migrations(engine)

    deps: PipelineDeps | None = None
    if not app.state.queue_injected:
        deps = build_deps(settings)
        app.state.job_queue = build_job_queue(settings, deps)
    queue: JobQueue = app.state.job_queue

    await queue.start()
    logger.info("prguard %s ready; workers=%d", __version__, settings.REVIEW_WORKERS)
    try:
        yield
    finally:
        await queue.stop()
        if deps is not None:
            await deps.aclose()
        await dispose_engine()


def create_app(
    settings: Settings | None = None,
    *,
    job_queue: JobQueue | None = None,
) -> FastAPI:
    resolved = settings or get_settings()
    app = FastAPI(
        title="prguard",
        version=__version__,
        description="Evidence-based merge gate — an AI PR reviewer that proves its claims.",
        lifespan=lifespan,
    )
    app.state.settings = resolved
    app.state.job_queue = job_queue if job_queue is not None else NullJobQueue()
    #: A queue the caller supplied is the caller's; the lifespan starts it and stops it but
    #: never replaces it (§4.2, and the reason the API suite never spawns a worker).
    app.state.queue_injected = job_queue is not None

    @app.middleware("http")
    async def _attach_request_id(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or new_request_id()
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    register_exception_handlers(app)

    for router in ROUTERS:
        app.include_router(router)

    return app


app = create_app()
