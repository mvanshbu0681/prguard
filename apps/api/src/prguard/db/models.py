"""ORM — the twelve tables of spec §5.1, transcribed.

Every column, index and justification comes from the spec; nothing is invented here.
Enumerations are `String` + a Python `StrEnum` + a `CheckConstraint` (spec §5), and every
table carries `tenant_id` because "there is no untenanted row".
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from prguard.db.base import (
    Base,
    IdType,
    JSONType,
    TimestampType,
    created_at_column,
    enum_check,
    fk_column,
    id_column,
    new_uuid,
    utcnow,
)


# --------------------------------------------------------------------------------------
# Enumerations (spec §5.1 / §4.4 / §4.6 / §4.7)
# --------------------------------------------------------------------------------------
class Provider(StrEnum):
    GITHUB = "github"


class TokenSource(StrEnum):
    PAT = "pat"
    APP = "app"
    GH_CLI = "gh_cli"
    ANONYMOUS = "anonymous"


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunTrigger(StrEnum):
    API = "api"
    WEBHOOK = "webhook"
    RERUN = "rerun"


class RiskTier(StrEnum):
    TRIVIAL = "trivial"
    STANDARD = "standard"
    FULL = "full"


class GateConclusion(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"
    NEUTRAL = "neutral"


class GateDelivery(StrEnum):
    CHECK_RUN = "check_run"
    COMMIT_STATUS = "commit_status"
    DRY_RUN = "dry_run"


class DeliveryStatus(StrEnum):
    POSTED = "posted"
    DEGRADED = "degraded"
    DRY_RUN = "dry_run"
    #: §7 E19 — the pull request closed or merged mid-run, so nothing was posted. Seventeen
    #: characters, which is why `delivery_status` is `String(24)` and not §5.1's 16
    #: (migration 0002).
    SKIPPED_PR_CLOSED = "skipped_pr_closed"


class Category(StrEnum):
    CORRECTNESS = "correctness"
    SECURITY = "security"
    TEST_INTEGRITY = "test_integrity"
    PERFORMANCE = "performance"
    MAINTAINABILITY = "maintainability"


class Band(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingStatus(StrEnum):
    PROPOSED = "proposed"
    SUPPRESSED = "suppressed"
    PUBLISHED = "published"
    DROPPED = "dropped"
    DISPROVEN = "disproven"


class ProofStatus(StrEnum):
    NOT_ATTEMPTED = "not_attempted"
    NOT_APPLICABLE = "not_applicable"
    PROVEN = "proven"
    DISPROVEN = "disproven"
    INCONCLUSIVE = "inconclusive"
    SKIPPED_NO_ENV = "skipped_no_env"


class DeliveryMode(StrEnum):
    INLINE_EXACT = "inline_exact"
    INLINE_NEAREST = "inline_nearest"
    FILE_LEVEL = "file_level"
    SUMMARY_ONLY = "summary_only"
    NOT_DELIVERED = "not_delivered"


class Side(StrEnum):
    LEFT = "LEFT"
    RIGHT = "RIGHT"


class SuppressionScope(StrEnum):
    LINE = "line"
    FILE = "file"
    PATTERN = "pattern"
    REPO = "repo"
    TENANT = "tenant"


class SuppressionSource(StrEnum):
    HUMAN_API = "human_api"
    AUTO_CONVENTION = "auto_convention"


class ProofRunner(StrEnum):
    DOCKER = "docker"
    SUBPROCESS = "subprocess"


class ProofIsolation(StrEnum):
    ISOLATED = "isolated"
    DEGRADED = "degraded"


class ProofOutcome(StrEnum):
    FAILING_AS_EXPECTED = "failing_as_expected"
    PASSED_UNEXPECTEDLY = "passed_unexpectedly"
    PRE_EXISTING_FAILURE = "pre_existing_failure"
    TIMEOUT = "timeout"
    ERROR = "error"
    SKIPPED_NO_ENV = "skipped_no_env"


class BaselineMode(StrEnum):
    COMPARED = "compared"
    NOT_APPLICABLE = "not_applicable"
    SKIPPED = "skipped"


class ActorType(StrEnum):
    AI = "ai"
    HUMAN = "human"
    SYSTEM = "system"


class AuditEventType(StrEnum):
    REVIEW_REQUESTED = "review.requested"
    REVIEW_STARTED = "review.started"
    REVIEW_STAGE_COMPLETED = "review.stage_completed"
    REVIEW_DEGRADED = "review.degraded"
    REVIEW_FAILED = "review.failed"
    REVIEW_COMPLETED = "review.completed"
    FINDING_PROPOSED = "finding.proposed"
    FINDING_SUPPRESSED = "finding.suppressed"
    FINDING_PUBLISHED = "finding.published"
    FINDING_DISPROVEN = "finding.disproven"
    PROOF_GENERATED = "proof.generated"
    PROOF_EXECUTED = "proof.executed"
    GATE_EVALUATED = "gate.evaluated"
    GATE_DELIVERED = "gate.delivered"
    SUPPRESSION_CREATED = "suppression.created"
    SUPPRESSION_REVOKED = "suppression.revoked"
    OVERRIDE_BREAK_GLASS = "override.break_glass"


class OutcomeKind(StrEnum):
    ADDRESSED = "addressed"
    DISMISSED = "dismissed"
    UNKNOWN = "unknown"


class WebhookStatus(StrEnum):
    ACCEPTED = "accepted"
    IGNORED = "ignored"
    DUPLICATE = "duplicate"
    INVALID = "invalid"


def _values(enum_cls: type[StrEnum]) -> tuple[str, ...]:
    return tuple(member.value for member in enum_cls)


# --------------------------------------------------------------------------------------
# Tables
# --------------------------------------------------------------------------------------
class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = id_column()
    slug: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (sa.UniqueConstraint("slug", name="uq_tenants_slug"),)


class Installation(Base):
    __tablename__ = "installations"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    provider: Mapped[str] = mapped_column(
        sa.String(32), nullable=False, default=Provider.GITHUB.value
    )
    external_installation_id: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    account_login: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    token_source: Mapped[str] = mapped_column(
        sa.String(16), nullable=False, default=TokenSource.ANONYMOUS.value
    )
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # Idempotent webhook install handling.
        sa.UniqueConstraint(
            "tenant_id",
            "provider",
            "external_installation_id",
            name="uq_installations_tenant_id_provider_external_installation_id",
        ),
        enum_check("provider", _values(Provider), name="provider"),
        enum_check("token_source", _values(TokenSource), name="token_source"),
    )


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    installation_id: Mapped[str | None] = fk_column("installations.id", nullable=True)
    provider: Mapped[str] = mapped_column(
        sa.String(32), nullable=False, default=Provider.GITHUB.value
    )
    external_repo_id: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    owner: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    default_branch: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    is_private: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # The upsert key on every trigger.
        sa.UniqueConstraint(
            "tenant_id",
            "provider",
            "owner",
            "name",
            name="uq_repositories_tenant_id_provider_owner_name",
        ),
        # Dashboard listing.
        sa.Index("ix_repositories_tenant_id", "tenant_id"),
        enum_check("provider", _values(Provider), name="provider"),
    )


class PullRequest(Base):
    __tablename__ = "pull_requests"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    repository_id: Mapped[str] = fk_column("repositories.id")
    number: Mapped[int] = mapped_column(sa.Integer(), nullable=False)
    title: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    author_login: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    head_sha: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    head_ref: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    base_sha: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    base_ref: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(sa.String(32), nullable=True)
    url: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    is_draft: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = mapped_column(
        TimestampType, default=utcnow, onupdate=utcnow, nullable=False
    )

    __table_args__ = (
        # PRs are identified by number, not by our id.
        sa.UniqueConstraint(
            "repository_id", "number", name="uq_pull_requests_repository_id_number"
        ),
        # "Recent PRs".
        sa.Index("ix_pull_requests_tenant_id_updated_at", "tenant_id", sa.text("updated_at DESC")),
    )


class ReviewRun(Base):
    __tablename__ = "review_runs"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    pull_request_id: Mapped[str] = fk_column("pull_requests.id")
    status: Mapped[str] = mapped_column(
        sa.String(16), nullable=False, default=RunStatus.QUEUED.value
    )
    trigger: Mapped[str] = mapped_column(
        sa.String(16), nullable=False, default=RunTrigger.API.value
    )
    head_sha: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    base_sha: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    risk_tier: Mapped[str | None] = mapped_column(sa.String(16), nullable=True)
    stage: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    stage_started_at: Mapped[datetime | None] = mapped_column(TimestampType, nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(TimestampType, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(TimestampType, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(TimestampType, nullable=True)
    error_code: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    degradations: Mapped[list[Any]] = mapped_column(JSONType, nullable=False, default=list)
    context_truncated: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, default=False)
    # Exact model ids/temps/weights used, so an old run stays explainable after config changes.
    model_config_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    token_usage: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    cost_usd_estimate: Mapped[float | None] = mapped_column(sa.Float(), nullable=True)
    findings_total: Mapped[int] = mapped_column(sa.Integer(), nullable=False, default=0)
    findings_published: Mapped[int] = mapped_column(sa.Integer(), nullable=False, default=0)
    findings_suppressed: Mapped[int] = mapped_column(sa.Integer(), nullable=False, default=0)
    findings_blocking: Mapped[int] = mapped_column(sa.Integer(), nullable=False, default=0)
    gate_conclusion: Mapped[str | None] = mapped_column(sa.String(16), nullable=True)
    gate_delivery: Mapped[str | None] = mapped_column(sa.String(16), nullable=True)
    delivery_status: Mapped[str | None] = mapped_column(sa.String(24), nullable=True)
    github_review_id: Mapped[int | None] = mapped_column(sa.BigInteger(), nullable=True)
    # The exact payload we posted, or would have posted.
    review_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # "Latest run for this PR" is the hottest query.
        sa.Index(
            "ix_review_runs_pull_request_id_created_at",
            "pull_request_id",
            sa.text("created_at DESC"),
        ),
        # Worker recovery + dashboard.
        sa.Index("ix_review_runs_tenant_id_status", "tenant_id", "status"),
        # The reaper scan.
        sa.Index("ix_review_runs_status_heartbeat_at", "status", "heartbeat_at"),
        # Force-push supersede lookup.
        sa.Index("ix_review_runs_head_sha", "head_sha"),
        enum_check("status", _values(RunStatus), name="status"),
        enum_check("trigger", _values(RunTrigger), name="trigger"),
        enum_check("risk_tier", _values(RiskTier), name="risk_tier"),
        enum_check("gate_conclusion", _values(GateConclusion), name="gate_conclusion"),
        enum_check("gate_delivery", _values(GateDelivery), name="gate_delivery"),
        enum_check("delivery_status", _values(DeliveryStatus), name="delivery_status"),
    )


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    review_run_id: Mapped[str] = fk_column("review_runs.id")
    fingerprint_id: Mapped[str | None] = fk_column("finding_fingerprints.id", nullable=True)
    specialist: Mapped[str | None] = mapped_column(sa.String(32), nullable=True)
    category: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    rule_key: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    title: Mapped[str] = mapped_column(sa.Text(), nullable=False)
    body_markdown: Mapped[str] = mapped_column(sa.Text(), nullable=False)
    file_path: Mapped[str] = mapped_column(sa.Text(), nullable=False)
    start_line: Mapped[int | None] = mapped_column(sa.Integer(), nullable=True)
    end_line: Mapped[int | None] = mapped_column(sa.Integer(), nullable=True)
    side: Mapped[str | None] = mapped_column(sa.String(8), nullable=True)
    language: Mapped[str | None] = mapped_column(sa.String(32), nullable=True)
    # Stored, never used for ranking (spec §4.4).
    llm_severity_hint: Mapped[str | None] = mapped_column(sa.String(16), nullable=True)
    severity_band: Mapped[str | None] = mapped_column(sa.String(16), nullable=True)
    severity_score: Mapped[float | None] = mapped_column(sa.Float(), nullable=True)
    severity_inputs: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    confidence: Mapped[float | None] = mapped_column(sa.Float(), nullable=True)
    status: Mapped[str] = mapped_column(
        sa.String(16), nullable=False, default=FindingStatus.PROPOSED.value
    )
    proof_status: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, default=ProofStatus.NOT_ATTEMPTED.value
    )
    # Written only by `severity.is_blocking` (spec §4.4).
    blocking: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, default=False)
    delivery_mode: Mapped[str] = mapped_column(
        sa.String(16), nullable=False, default=DeliveryMode.NOT_DELIVERED.value
    )
    delivered_line: Mapped[int | None] = mapped_column(sa.Integer(), nullable=True)
    github_comment_id: Mapped[int | None] = mapped_column(sa.BigInteger(), nullable=True)
    suppression_id: Mapped[str | None] = fk_column("suppressions.id", nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # Result assembly.
        sa.Index("ix_findings_review_run_id", "review_run_id"),
        # Cross-PR history and re-review matching.
        sa.Index("ix_findings_fingerprint_id_created_at", "fingerprint_id", "created_at"),
        sa.Index("ix_findings_tenant_id_status", "tenant_id", "status"),
        # The gate decision query — filtered, because only blocking rows matter.
        sa.Index(
            "ix_findings_review_run_id_blocking",
            "review_run_id",
            postgresql_where=sa.text("blocking"),
            sqlite_where=sa.text("blocking"),
        ),
        enum_check("category", _values(Category), name="category"),
        enum_check("severity_band", _values(Band), name="severity_band"),
        enum_check("status", _values(FindingStatus), name="status"),
        enum_check("proof_status", _values(ProofStatus), name="proof_status"),
        enum_check("delivery_mode", _values(DeliveryMode), name="delivery_mode"),
        enum_check("side", _values(Side), name="side"),
    )


class FindingFingerprint(Base):
    __tablename__ = "finding_fingerprints"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    repository_id: Mapped[str] = fk_column("repositories.id")
    fingerprint: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    category: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    rule_key: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    symbol_path: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    shape_hash: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    first_seen_run_id: Mapped[str | None] = fk_column("review_runs.id", nullable=True)
    last_seen_run_id: Mapped[str | None] = mapped_column(IdType, nullable=True)
    occurrence_count: Mapped[int] = mapped_column(sa.Integer(), nullable=False, default=1)
    addressed_count: Mapped[int] = mapped_column(sa.Integer(), nullable=False, default=0)
    dismissed_count: Mapped[int] = mapped_column(sa.Integer(), nullable=False, default=0)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = mapped_column(
        TimestampType, default=utcnow, onupdate=utcnow, nullable=False
    )

    __table_args__ = (
        # The dedupe lookup — must be unique or M3 silently breaks.
        sa.UniqueConstraint(
            "tenant_id",
            "repository_id",
            "fingerprint",
            name="uq_finding_fingerprints_tenant_id_repository_id_fingerprint",
        ),
        # Cross-repo pattern analytics.
        sa.Index("ix_finding_fingerprints_fingerprint", "fingerprint"),
        enum_check("category", _values(Category), name="category"),
    )


class Suppression(Base):
    __tablename__ = "suppressions"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    # NULL ⇒ tenant-wide.
    repository_id: Mapped[str | None] = fk_column("repositories.id", nullable=True)
    # NULL ⇒ pattern/path rule.
    fingerprint_id: Mapped[str | None] = fk_column("finding_fingerprints.id", nullable=True)
    scope: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    match_path: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    match_rule_key: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    # Required and non-empty — a ledger without reasons is not evidence (spec §6.6).
    reason: Mapped[str] = mapped_column(sa.Text(), nullable=False)
    created_by: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    source: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, default=SuppressionSource.HUMAN_API.value
    )
    expires_at: Mapped[datetime | None] = mapped_column(TimestampType, nullable=True)
    # Set by DELETE — rows are never removed (spec §5.1).
    revoked_at: Mapped[datetime | None] = mapped_column(TimestampType, nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # The per-finding check.
        sa.Index("ix_suppressions_tenant_id_fingerprint_id", "tenant_id", "fingerprint_id"),
        # The per-path check.
        sa.Index(
            "ix_suppressions_tenant_id_repository_id_scope", "tenant_id", "repository_id", "scope"
        ),
        # Expiry sweeps.
        sa.Index("ix_suppressions_expires_at", "expires_at"),
        enum_check("scope", _values(SuppressionScope), name="scope"),
        enum_check("source", _values(SuppressionSource), name="source"),
        sa.CheckConstraint("length(trim(reason)) > 0", name="ck_suppressions_reason_non_empty"),
    )


class ProofArtifact(Base):
    __tablename__ = "proof_artifacts"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    finding_id: Mapped[str] = fk_column("findings.id")
    review_run_id: Mapped[str] = fk_column("review_runs.id")
    runner: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    isolation: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    image: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    test_file_path: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    test_code: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    expected_failure_signal: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    command: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    base_exit_code: Mapped[int | None] = mapped_column(sa.Integer(), nullable=True)
    base_stdout: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    base_stderr: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    head_exit_code: Mapped[int | None] = mapped_column(sa.Integer(), nullable=True)
    head_stdout: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    head_stderr: Mapped[str | None] = mapped_column(sa.Text(), nullable=True)
    outcome: Mapped[str] = mapped_column(sa.String(24), nullable=False)
    baseline_mode: Mapped[str] = mapped_column(
        sa.String(16), nullable=False, default=BaselineMode.COMPARED.value
    )
    deps_install_ok: Mapped[bool | None] = mapped_column(sa.Boolean(), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(sa.Integer(), nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # One-to-one in practice, one-to-many across retries.
        sa.Index("ix_proof_artifacts_finding_id", "finding_id"),
        sa.Index("ix_proof_artifacts_review_run_id", "review_run_id"),
        enum_check("runner", _values(ProofRunner), name="runner"),
        enum_check("isolation", _values(ProofIsolation), name="isolation"),
        enum_check("outcome", _values(ProofOutcome), name="outcome"),
        enum_check("baseline_mode", _values(BaselineMode), name="baseline_mode"),
    )


class AuditEvent(Base):
    """Append-only. No UPDATE or DELETE path exists in the codebase (spec §5.1)."""

    __tablename__ = "audit_events"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    # Monotonic per tenant.
    seq: Mapped[int] = mapped_column(sa.Integer(), nullable=False)
    review_run_id: Mapped[str | None] = fk_column("review_runs.id", nullable=True)
    finding_id: Mapped[str | None] = fk_column("findings.id", nullable=True)
    actor_type: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(sa.String(48), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    prev_hash: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    event_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # Chain integrity.
        sa.UniqueConstraint("tenant_id", "seq", name="uq_audit_events_tenant_id_seq"),
        sa.Index("ix_audit_events_review_run_id_seq", "review_run_id", "seq"),
        sa.Index("ix_audit_events_finding_id", "finding_id"),
        # The audit feed.
        sa.Index("ix_audit_events_tenant_id_created_at", "tenant_id", sa.text("created_at DESC")),
        enum_check("actor_type", _values(ActorType), name="actor_type"),
        enum_check("event_type", _values(AuditEventType), name="event_type"),
    )


class FindingOutcome(Base):
    __tablename__ = "finding_outcomes"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    finding_id: Mapped[str] = fk_column("findings.id")
    fingerprint_id: Mapped[str | None] = fk_column("finding_fingerprints.id", nullable=True)
    outcome: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(TimestampType, default=utcnow, nullable=False)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)

    __table_args__ = (
        sa.Index("ix_finding_outcomes_fingerprint_id", "fingerprint_id"),
        sa.Index("ix_finding_outcomes_tenant_id_outcome", "tenant_id", "outcome"),
        enum_check("outcome", _values(OutcomeKind), name="outcome"),
    )


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = id_column()
    tenant_id: Mapped[str] = fk_column("tenants.id")
    # GitHub `X-GitHub-Delivery`.
    delivery_id: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    event: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    action: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    received_at: Mapped[datetime] = mapped_column(TimestampType, default=utcnow, nullable=False)
    status: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    review_run_id: Mapped[str | None] = fk_column("review_runs.id", nullable=True)

    __table_args__ = (
        # GitHub retries deliveries; without this the demo double-reviews.
        sa.UniqueConstraint("delivery_id", name="uq_webhook_deliveries_delivery_id"),
        enum_check("status", _values(WebhookStatus), name="status"),
    )


#: Every mapped table, in dependency order — used by the tenancy and migration tests.
ALL_MODELS: tuple[type[Base], ...] = (
    Tenant,
    Installation,
    Repository,
    PullRequest,
    ReviewRun,
    FindingFingerprint,
    Suppression,
    Finding,
    ProofArtifact,
    AuditEvent,
    FindingOutcome,
    WebhookDelivery,
)

__all__ = [
    "ALL_MODELS",
    "ActorType",
    "AuditEvent",
    "AuditEventType",
    "BaselineMode",
    "Band",
    "Base",
    "Category",
    "DeliveryMode",
    "DeliveryStatus",
    "Finding",
    "FindingFingerprint",
    "FindingOutcome",
    "FindingStatus",
    "GateConclusion",
    "GateDelivery",
    "Installation",
    "OutcomeKind",
    "ProofArtifact",
    "ProofIsolation",
    "ProofOutcome",
    "ProofRunner",
    "ProofStatus",
    "Provider",
    "PullRequest",
    "Repository",
    "ReviewRun",
    "RiskTier",
    "RunStatus",
    "RunTrigger",
    "Side",
    "Suppression",
    "SuppressionScope",
    "SuppressionSource",
    "Tenant",
    "TokenSource",
    "WebhookDelivery",
    "WebhookStatus",
    "new_uuid",
    "utcnow",
]
