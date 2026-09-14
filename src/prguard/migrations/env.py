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

from prguard.db import models as _models  # noqa: F401  - registers every table
from prguard.db.base import Base

config = context.config
target_metadata = Base.metadata


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
    url = config.get_main_option("sqlalchemy.url")
    assert url is not None, "sqlalchemy.url must be set for offline migrations"
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
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
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
