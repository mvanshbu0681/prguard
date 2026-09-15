"""Alembic environment.

Three entry points have to work, because all three are exercised by AC-27:

* offline (`--sql`) for an arbitrary dialect — the Postgres DDL cleanliness check;
* online with a connection handed in via `config.attributes["connection"]` — how the test
  suite and application startup migrate an already-open async engine;
* online standalone, driving its own async engine — the plain `alembic upgrade head` CLI.
"""

from __future__ import annotations

import asyncio
from typing import Any

from alembic import context
from sqlalchemy import Connection, pool
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_engine_from_config

from prguard.config import get_settings
from prguard.db import models as _models  # noqa: F401  - registers every table
from prguard.db.base import Base

config = context.config
target_metadata = Base.metadata


def _ini_default_url() -> str | None:
    """The URL `alembic.ini` ships with, read fresh so a caller's override is detectable."""
    ini = config.config_file_name
    if not ini:
        return None
    from alembic.config import Config as _Config

    return _Config(ini).get_main_option("sqlalchemy.url")


def _resolve_url() -> str:
    """The database this migration runs against.

    Precedence: `-x url=...` > a URL a caller set explicitly > `DATABASE_URL` > `alembic.ini`.

    Two callers matter and they want opposite things. `prguard.db.session.alembic_config`
    sets `sqlalchemy.url` on purpose (the test suite migrates a temp SQLite file, and renders
    offline DDL for a dialect it names), so an explicit value must win. The bare
    `alembic upgrade head` CLI sets nothing, and there `alembic.ini`'s SQLite default must NOT
    win over a configured `DATABASE_URL` -- it silently migrated the local SQLite file while
    reporting success, leaving the real Postgres database empty.

    The two are told apart by comparing against the value `alembic.ini` itself ships.
    """
    override = context.get_x_argument(as_dictionary=True).get("url")
    if override:
        return override
    current = config.get_main_option("sqlalchemy.url")
    if current and current != _ini_default_url():
        return current
    configured = get_settings().DATABASE_URL
    if configured:
        return configured
    assert current is not None, "no database URL: set DATABASE_URL or sqlalchemy.url"
    return current


def _configure(connection: Connection | None = None, **extra: Any) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=True,
        include_schemas=False,
        **extra,
    )


def run_migrations_offline() -> None:
    url = _resolve_url()
    # The async driver name is irrelevant offline; strip it so the dialect resolves.
    dialect_name = make_url(url).get_backend_name()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_name=dialect_name,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    _configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    section = dict(config.get_section(config.config_ini_section, {}))
    section["sqlalchemy.url"] = _resolve_url()
    connectable = async_engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    existing = config.attributes.get("connection")
    if existing is not None:
        do_run_migrations(existing)
        return
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
