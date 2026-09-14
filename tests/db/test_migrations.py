"""Persistence portability — AC-27, first two clauses.

`alembic upgrade head` must succeed on SQLite, and offline generation for the
`postgresql` dialect must emit DDL with no SQLite-only construct and no native ENUM
(spec §5, risk R8).
"""

from __future__ import annotations

import asyncio
import io
import re
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from prguard.db.base import Base
from prguard.db.session import alembic_config

EXPECTED_TABLES = {
    "tenants",
    "installations",
    "repositories",
    "pull_requests",
    "review_runs",
    "findings",
    "finding_fingerprints",
    "suppressions",
    "proof_artifacts",
    "audit_events",
    "finding_outcomes",
    "webhook_deliveries",
}

#: Constructs SQLite emits that Postgres would choke on, plus the native-enum trap §5 bans.
SQLITE_ONLY_PATTERNS = {
    "AUTOINCREMENT": r"\bAUTOINCREMENT\b",
    "DATETIME column type": r"\bDATETIME\b",
    "WITHOUT ROWID": r"\bWITHOUT\s+ROWID\b",
    "PRAGMA": r"\bPRAGMA\b",
    "sqlite_ prefix": r"\bsqlite_[a-z_]+\b",
    "native ENUM type": r"\bCREATE\s+TYPE\b|\bAS\s+ENUM\b",
}


def _sqlite_config(tmp_path: Path) -> tuple[Config, str]:
    url = f"sqlite+aiosqlite:///{tmp_path / 'upgrade.db'}"
    return alembic_config(url), url


def test_upgrade_head_on_sqlite(tmp_path: Path) -> None:
    config, url = _sqlite_config(tmp_path)
    # `alembic upgrade` drives its own event loop for the async driver, so it runs in a
    # worker thread exactly as the CLI would.
    asyncio.run(asyncio.to_thread(command.upgrade, config, "head"))

    sync_url = url.replace("+aiosqlite", "")
    engine = sa.create_engine(sync_url)
    try:
        inspector = sa.inspect(engine)
        tables = set(inspector.get_table_names())
        assert EXPECTED_TABLES <= tables
        with engine.connect() as conn:
            version = conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()
            slugs = conn.execute(sa.text("SELECT slug FROM tenants")).scalars().all()
        assert version == "0001"
        assert slugs == ["default"], "migration 0001 must seed the default tenant (spec §5)"
    finally:
        engine.dispose()


def test_upgrade_head_matches_the_orm_metadata(tmp_path: Path) -> None:
    """The migration is the schema — no model may drift away from it unmigrated."""
    config, url = _sqlite_config(tmp_path)
    asyncio.run(asyncio.to_thread(command.upgrade, config, "head"))

    engine = sa.create_engine(url.replace("+aiosqlite", ""))
    try:
        inspector = sa.inspect(engine)
        for table in Base.metadata.sorted_tables:
            migrated = {c["name"] for c in inspector.get_columns(table.name)}
            declared = {c.name for c in table.columns}
            assert declared == migrated, f"{table.name} drifted from migration 0001"
    finally:
        engine.dispose()


def test_downgrade_base_is_reversible(tmp_path: Path) -> None:
    config, url = _sqlite_config(tmp_path)
    asyncio.run(asyncio.to_thread(command.upgrade, config, "head"))
    asyncio.run(asyncio.to_thread(command.downgrade, config, "base"))

    engine = sa.create_engine(url.replace("+aiosqlite", ""))
    try:
        remaining = set(sa.inspect(engine).get_table_names()) & EXPECTED_TABLES
        assert remaining == set()
    finally:
        engine.dispose()


def _offline_postgres_ddl() -> str:
    buffer = io.StringIO()
    config = alembic_config("postgresql+asyncpg://prguard:prguard@localhost/prguard")
    config.output_buffer = buffer
    command.upgrade(config, "head", sql=True)
    return buffer.getvalue()


def test_offline_postgres_ddl_is_clean() -> None:
    ddl = _offline_postgres_ddl()
    assert "CREATE TABLE tenants" in ddl
    for label, pattern in SQLITE_ONLY_PATTERNS.items():
        found = re.search(pattern, ddl, flags=re.IGNORECASE)
        assert found is None, f"postgres DDL contains {label}: {found!r}"


def test_offline_postgres_ddl_uses_portable_types() -> None:
    ddl = _offline_postgres_ddl()
    assert "JSONB" in ddl, "JSON columns must map to JSONB on Postgres (spec §5)"
    assert "TIMESTAMP WITH TIME ZONE" in ddl, "timestamps are DateTime(timezone=True)"
    assert "VARCHAR(36)" in ddl, "ids are String(36) UUID4, never a native uuid/SERIAL type"
    assert ddl.count("CREATE TABLE") == len(EXPECTED_TABLES) + 1  # + alembic_version


@pytest.mark.parametrize("table_name", sorted(EXPECTED_TABLES))
def test_every_table_is_tenant_scoped(table_name: str) -> None:
    table = Base.metadata.tables[table_name]
    if table_name == "tenants":
        assert "id" in table.columns
        return
    assert "tenant_id" in table.columns, "spec §5: there is no untenanted row"
