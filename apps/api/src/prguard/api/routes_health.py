"""GET /healthz · GET /readyz (spec §6.11).

`/healthz` answers from memory and checks nothing: a liveness probe that fails because a
*dependency* is down gets a healthy process killed. `/readyz` checks the one dependency the
service cannot work without — the database — and **reports** every optional one without
failing on it, because "no Docker" is a degraded proof runner, not a dead service (AC-13).
"""

from __future__ import annotations

import shutil

import sqlalchemy as sa
from fastapi import APIRouter
from sqlalchemy.exc import SQLAlchemyError

from prguard import __version__
from prguard.api.deps import JobQueueDep, SessionDep, SettingsDep
from prguard.api.errors import ErrorCode, PRGuardError
from prguard.api.schemas import HealthResponse, ReadyResponse, WorkersStatus
from prguard.config import Settings
from prguard.core.queue import JobQueue

router = APIRouter(tags=["health"])


@router.get(
    "/healthz",
    response_model=HealthResponse,
    summary="Liveness — no dependency checks (§6.11)",
)
async def healthz() -> HealthResponse:
    return HealthResponse(version=__version__)


@router.get(
    "/readyz",
    response_model=ReadyResponse,
    summary="Readiness — the database gates, nothing else does (§6.11)",
)
async def readyz(
    session: SessionDep,
    settings: SettingsDep,
    queue: JobQueueDep,
) -> ReadyResponse:
    try:
        await session.execute(sa.select(sa.literal(1)))
    except SQLAlchemyError as exc:
        raise PRGuardError(
            ErrorCode.DATABASE_UNAVAILABLE, details={"probe": "SELECT 1"}
        ) from exc

    docker = _docker_status()
    return ReadyResponse(
        status="ready",
        database="ok",
        anthropic=_anthropic_status(settings),
        github=_github_status(settings),
        docker=docker,
        proof_runner=_proof_runner(settings, docker),
        workers=_workers(settings, queue),
    )


def _anthropic_status(settings: Settings) -> str:
    if settings.LLM_PROVIDER == "fake":
        return "fake"
    return "configured" if settings.ANTHROPIC_API_KEY else "unconfigured"


def _github_status(settings: Settings) -> str:
    if settings.GITHUB_TOKEN:
        return "token_present"
    if settings.GITHUB_APP_ID and settings.GITHUB_APP_PRIVATE_KEY:
        return "app_configured"
    return "anonymous"


def _docker_status() -> str:
    """Whether the CLI exists — never `docker info`.

    A readiness probe that shells out to a daemon blocks for as long as the daemon takes to
    time out. The real availability probe belongs to the proof runner, at run time (§4.6).
    """
    return "cli_present" if shutil.which("docker") else "unavailable"


def _proof_runner(settings: Settings, docker: str) -> str:
    if docker == "cli_present":
        return "docker"
    return "subprocess" if settings.PROOF_ALLOW_SUBPROCESS else "none"


def _workers(settings: Settings, queue: JobQueue) -> WorkersStatus:
    """Read through the protocol: a queue that never started is honestly reported as 0."""
    started = bool(getattr(queue, "started", False))
    running = int(getattr(queue, "workers", settings.REVIEW_WORKERS)) if started else 0
    return WorkersStatus(running=running, queue_depth=int(getattr(queue, "depth", 0)))
