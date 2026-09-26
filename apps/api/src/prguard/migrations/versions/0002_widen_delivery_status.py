"""widen review_runs.delivery_status for E19's `skipped_pr_closed`

Spec §5.1 lists `delivery_status` as `posted | degraded | dry_run` on a `String(16)` column,
and §7 E19 requires a fourth value — `skipped_pr_closed`, seventeen characters — for a pull
request that closed or merged while the run was in flight. The two cannot both be true: the
domain type already carries the value, and persisting it violates the CHECK constraint and
overruns the column. E19 wins, because it is the behaviour a user sees.

SQLite cannot ALTER a column type or a CHECK constraint, so the change runs through Alembic's
batch mode with an explicit ``copy_from`` — the table exactly as revision 0001 left it. Passing
the definition rather than reflecting it is not belt-and-braces: SQLAlchemy does not reflect
SQLite CHECK constraints, so a reflected rebuild would silently drop the other five.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Same portable types as 0001 (spec §5).
ID = sa.String(36)
TS = sa.DateTime(timezone=True)
JSON_ = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")

#: Alembic-stable names, copied from `db/base.NAMING_CONVENTION` so `copy_from` renders the
#: constraint names this database actually has.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

OLD_WIDTH = 16
NEW_WIDTH = 24
OLD_DELIVERY_STATUSES = ("posted", "degraded", "dry_run")
NEW_DELIVERY_STATUSES = ("posted", "degraded", "dry_run", "skipped_pr_closed")


def _check(column: str, values: tuple[str, ...]) -> sa.CheckConstraint:
    rendered = ", ".join(f"'{value}'" for value in values)
    return sa.CheckConstraint(f"{column} IN ({rendered})", name=column)


def _review_runs(delivery_status_width: int) -> sa.Table:
    """`review_runs` as revision 0001 created it, for batch mode's ``copy_from``."""
    return sa.Table(
        "review_runs",
        sa.MetaData(naming_convention=NAMING_CONVENTION),
        sa.Column("id", ID, nullable=False),
        sa.Column("tenant_id", ID, nullable=False),
        sa.Column("pull_request_id", ID, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("trigger", sa.String(16), nullable=False),
        sa.Column("head_sha", sa.String(64), nullable=True),
        sa.Column("base_sha", sa.String(64), nullable=True),
        sa.Column("risk_tier", sa.String(16), nullable=True),
        sa.Column("stage", sa.String(64), nullable=True),
        sa.Column("stage_started_at", TS, nullable=True),
        sa.Column("heartbeat_at", TS, nullable=True),
        sa.Column("started_at", TS, nullable=True),
        sa.Column("finished_at", TS, nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("degradations", JSON_, nullable=False),
        sa.Column("context_truncated", sa.Boolean(), nullable=False),
        sa.Column("model_config_snapshot", JSON_, nullable=True),
        sa.Column("token_usage", JSON_, nullable=True),
        sa.Column("cost_usd_estimate", sa.Float(), nullable=True),
        sa.Column("findings_total", sa.Integer(), nullable=False),
        sa.Column("findings_published", sa.Integer(), nullable=False),
        sa.Column("findings_suppressed", sa.Integer(), nullable=False),
        sa.Column("findings_blocking", sa.Integer(), nullable=False),
        sa.Column("gate_conclusion", sa.String(16), nullable=True),
        sa.Column("gate_delivery", sa.String(16), nullable=True),
        sa.Column("delivery_status", sa.String(delivery_status_width), nullable=True),
        sa.Column("github_review_id", sa.BigInteger(), nullable=True),
        sa.Column("review_payload", JSON_, nullable=True),
        sa.Column("created_at", TS, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_review_runs"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["pull_request_id"], ["pull_requests.id"]),
        _check("delivery_status", OLD_DELIVERY_STATUSES),
        _check("gate_conclusion", ("success", "failure", "neutral")),
        _check("gate_delivery", ("check_run", "commit_status", "dry_run")),
        _check("risk_tier", ("trivial", "standard", "full")),
        _check("status", ("queued", "running", "succeeded", "failed", "cancelled")),
        _check("trigger", ("api", "webhook", "rerun")),
        # Carried through the rebuild: SQLite drops every index with the old table, and the
        # reaper scan and the force-push lookup are exactly the queries that need them.
        sa.Index("ix_review_runs_head_sha", "head_sha"),
        sa.Index("ix_review_runs_status_heartbeat_at", "status", "heartbeat_at"),
        sa.Index("ix_review_runs_tenant_id_status", "tenant_id", "status"),
        sa.Index(
            "ix_review_runs_pull_request_id_created_at",
            "pull_request_id",
            sa.text("created_at DESC"),
        ),
    )


def _rendered(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def upgrade() -> None:
    with op.batch_alter_table(
        "review_runs", copy_from=_review_runs(OLD_WIDTH)
    ) as batch:
        batch.alter_column(
            "delivery_status",
            existing_type=sa.String(OLD_WIDTH),
            type_=sa.String(NEW_WIDTH),
            existing_nullable=True,
        )
        # Unprefixed: the naming convention expands it to `ck_review_runs_delivery_status`.
        batch.drop_constraint("delivery_status", type_="check")
        batch.create_check_constraint(
            "delivery_status", f"delivery_status IN ({_rendered(NEW_DELIVERY_STATUSES)})"
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "review_runs", copy_from=_review_runs(NEW_WIDTH)
    ) as batch:
        # Unprefixed: the naming convention expands it to `ck_review_runs_delivery_status`.
        batch.drop_constraint("delivery_status", type_="check")
        batch.alter_column(
            "delivery_status",
            existing_type=sa.String(NEW_WIDTH),
            type_=sa.String(OLD_WIDTH),
            existing_nullable=True,
        )
        batch.create_check_constraint(
            "delivery_status", f"delivery_status IN ({_rendered(OLD_DELIVERY_STATUSES)})"
        )
