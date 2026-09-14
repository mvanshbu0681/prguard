"""Async engine, sessionmaker and the Alembic entry points.

`DATABASE_URL` is the only switch between dev/test SQLite (`sqlite+aiosqlite`) and Supabase
Postgres (`asyncpg`) — spec §11.2 assumption 1. Nothing else in the codebase branches on
the dialect.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from prguard.config import Settings, get_settings

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_PATH = PACKAGE_ROOT / "migrations"
ALEMBIC_INI = PACKAGE_ROOT.parent.parent / "alembic.ini"


def _engine_kwargs(url: str) -> dict[str, Any]:
    """In-memory SQLite needs one shared connection or every session sees a fresh database."""
    parsed = make_url(url)
    if parsed.get_backend_name() != "sqlite":
        return {"pool_pre_ping": True}
    kwargs: dict[str, Any] = {"connect_args": {"check_same_thread": False}}
    if parsed.database in (None, "", ":memory:"):
        kwargs["poolclass"] = StaticPool
    return kwargs


def create_engine(settings: Settings | None = None) -> AsyncEngine:
    resolved = settings or get_settings()
    url = resolved.DATABASE_URL
    return create_async_engine(url, future=True, **_engine_kwargs(url))


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


def alembic_config(database_url: str) -> Config:
    """An Alembic `Config` pointed at this package's migrations, for any `DATABASE_URL`."""
    config = Config(str(ALEMBIC_INI)) if ALEMBIC_INI.exists() else Config()
    config.set_main_option("script_location", str(MIGRATIONS_PATH))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _upgrade_with_connection(connection: Connection, database_url: str, revision: str) -> None:
    config = alembic_config(database_url)
    config.attributes["connection"] = connection
    command.upgrade(config, revision)


async def run_migrations(engine: AsyncEngine, revision: str = "head") -> None:
    """Upgrade an already-open async engine — the recipe tests and startup both use.

    Reusing the caller's connection is what makes in-memory SQLite work: the schema and the
    queries then live on the same connection.
    """
    url = engine.url.render_as_string(hide_password=False)
    async with engine.begin() as connection:
        await connection.run_sync(_upgrade_with_connection, url, revision)


# --------------------------------------------------------------------------------------
# Application wiring
# --------------------------------------------------------------------------------------
_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine(settings: Settings | None = None) -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        _engine = create_engine(settings)
        _sessionmaker = create_sessionmaker(_engine)
    return _engine


def get_sessionmaker(settings: Settings | None = None) -> async_sessionmaker[AsyncSession]:
    get_engine(settings)
    assert _sessionmaker is not None
    return _sessionmaker


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, rolled back on an escaping exception."""
    async with get_sessionmaker()() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
