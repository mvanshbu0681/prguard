"""App factory — exception handlers, request-id middleware, router registration.

Spec §4.3. The lifespan that starts the worker pool and the reaper (§4.2) is added by T9;
the router registration below is frozen after this track (plan §9.3 rule 3), so T7 fills
in the route bodies without touching this file.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
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
from prguard.core.queue import JobQueue, NullJobQueue

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
    )
    app.state.settings = resolved
    app.state.job_queue = job_queue if job_queue is not None else NullJobQueue()

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
