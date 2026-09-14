"""Declarative base and the portable column types spec §5 mandates.

Postgres-first, run on SQLite: no native enums, no server defaults, ids are `String(36)`
UUID4 and JSON maps to `JSONB` through a variant. The `naming_convention` is what keeps
Alembic autogenerate stable across both dialects.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, mapped_column
from sqlalchemy.orm.base import Mapped

NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

#: `sqlalchemy.JSON` everywhere, `JSONB` on Postgres (spec §5).
JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

#: UUID4 as a 36-char string — portable across both engines, no native uuid/SERIAL.
IdType = sa.String(36)

#: Always UTC, defaulted in Python and never in SQL (spec §5).
TimestampType = sa.DateTime(timezone=True)


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    metadata = sa.MetaData(naming_convention=NAMING_CONVENTION)

    type_annotation_map = {  # noqa: RUF012 - SQLAlchemy reads this as a plain dict
        datetime: TimestampType,
        dict[str, Any]: JSONType,
        list[Any]: JSONType,
    }


def id_column() -> Mapped[str]:
    return mapped_column(IdType, primary_key=True, default=new_uuid)


def fk_column(target: str, *, nullable: bool = False, index: bool = False) -> Mapped[str]:
    return mapped_column(IdType, sa.ForeignKey(target), nullable=nullable, index=index)


def created_at_column() -> Mapped[datetime]:
    return mapped_column(TimestampType, default=utcnow, nullable=False)


def enum_check(column: str, values: tuple[str, ...], *, name: str) -> sa.CheckConstraint:
    """`String` + `StrEnum` + `CheckConstraint` — never a native DB enum (spec §5)."""
    rendered = ", ".join(f"'{value}'" for value in values)
    return sa.CheckConstraint(f"{column} IN ({rendered})", name=name)
