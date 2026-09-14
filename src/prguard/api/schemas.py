"""The public contract — spec §6.1–6.11, transcribed field for field.

Nothing here has behaviour beyond the two validations the spec states in prose: a
suppression `reason` must be non-empty, and `match_path` is required for `scope=pattern`
(§6.6). Every response model reads from ORM attributes so routes can build them directly.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

Band = Literal["critical", "high", "medium", "low", "info"]
Category = Literal["correctness", "security", "test_integrity", "performance", "maintainability"]
DeliveryModeName = Literal[
    "inline_exact", "inline_nearest", "file_level", "summary_only", "not_delivered"
]
FindingStatusName = Literal["proposed", "suppressed", "published", "dropped", "disproven"]
GateConclusionName = Literal["success", "failure", "neutral"]
GateDeliveryName = Literal["check_run", "commit_status", "dry_run"]
DeliveryStatusName = Literal["posted", "degraded", "dry_run"]
ProofStatusName = Literal[
    "not_attempted", "not_applicable", "proven", "disproven", "inconclusive", "skipped_no_env"
]
RiskTierName = Literal["trivial", "standard", "full"]
RunStatusName = Literal["queued", "running", "succeeded", "failed", "cancelled"]
RunTriggerName = Literal["api", "webhook", "rerun"]
SuppressionScopeName = Literal["line", "file", "pattern", "repo", "tenant"]
RequestedDeliveryMode = Literal["auto", "post", "dry_run"]

#: Spec §4.1 — nine pipeline stages, reported by `GET /v1/reviews/{id}`.
STAGE_TOTAL = 9


def _iso_z(value: datetime) -> str:
    """The spec renders timestamps as `2026-09-14T23:41:07Z`, not `+00:00`.

    Naive input is read as UTC rather than as local time: SQLite stores no timezone, so a
    timestamp written as aware UTC comes back naive (see `db.base.as_utc`), and
    `astimezone` on a naive value would silently shift it by the host's offset.
    """
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value
    return aware.astimezone(UTC).isoformat().replace("+00:00", "Z")


UtcDatetime = Annotated[datetime, PlainSerializer(_iso_z, return_type=str, when_used="json")]


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------------------
# §6.1 POST /v1/reviews
# --------------------------------------------------------------------------------------
class ReviewOptions(Schema):
    """Optional; every key falls back to config."""

    require_baseline_proof: bool | None = None
    max_proofs: int | None = Field(default=None, ge=0)
    delivery_mode: RequestedDeliveryMode | None = None
    force: bool = False


class CreateReviewRequest(Schema):
    #: A full PR URL, or `owner/repo#42`.
    pr_url: str = Field(min_length=1)
    options: ReviewOptions | None = None


class RepositoryRef(Schema):
    owner: str
    name: str


class PullRequestRef(Schema):
    number: int
    #: `null` at 202: the head SHA is resolved inside the worker (§4.2).
    head_sha: str | None = None


class ReviewAccepted(Schema):
    review_id: str
    status: RunStatusName
    trigger: RunTriggerName
    repository: RepositoryRef
    pull_request: PullRequestRef
    poll_url: str
    result_url: str
    created_at: UtcDatetime
    #: E21 — a second trigger for the same head SHA returns the existing run.
    deduplicated: bool = False


# --------------------------------------------------------------------------------------
# §6.2 GET /v1/reviews/{id}
# --------------------------------------------------------------------------------------
class RunError(Schema):
    code: str
    message: str


class RunCounts(Schema):
    proposed: int = 0
    published: int = 0
    suppressed: int = 0
    blocking: int = 0


class ReviewStatus(Schema):
    review_id: str
    status: RunStatusName
    stage: str | None = None
    stage_index: int | None = None
    stage_total: int = STAGE_TOTAL
    stage_label: str | None = None
    seconds_since_heartbeat: int | None = None
    risk_tier: RiskTierName | None = None
    head_sha: str | None = None
    degradations: list[str] = Field(default_factory=list)
    counts: RunCounts = Field(default_factory=RunCounts)
    started_at: UtcDatetime | None = None
    finished_at: UtcDatetime | None = None
    #: A failed *run* is HTTP 200 with the error in the body — the *request* did not fail.
    error: RunError | None = None


# --------------------------------------------------------------------------------------
# §6.4 Finding object
# --------------------------------------------------------------------------------------
class FindingLocation(Schema):
    file_path: str
    start_line: int | None = None
    end_line: int | None = None
    side: Literal["LEFT", "RIGHT"] | None = None
    language: str | None = None
    symbol_path: str | None = None


class SeverityInputs(Schema):
    reachability: float
    blast_radius: float
    path_sensitivity: float
    coverage_gap: float
    churn: float
    proof_confidence: float


class FindingSeverity(Schema):
    band: Band
    score: float
    #: Inputs *and* weights ship together so a dashboard re-derives nothing (§4.4).
    inputs: SeverityInputs
    weights: dict[str, float]
    explanation: str = ""
    #: Stored, never used for ranking.
    llm_severity_hint: str | None = None
    notes: list[str] = Field(default_factory=list)


class ProofExecution(Schema):
    exit_code: int | None = None
    excerpt: str | None = None


class FindingProof(Schema):
    status: ProofStatusName
    runner: Literal["docker", "subprocess"] | None = None
    isolation: Literal["isolated", "degraded"] | None = None
    baseline_mode: Literal["compared", "not_applicable", "skipped"] | None = None
    test_file_path: str | None = None
    test_code: str | None = None
    command: str | None = None
    base: ProofExecution | None = None
    head: ProofExecution | None = None
    duration_ms: int | None = None
    deps_install_ok: bool | None = None


class FindingDelivery(Schema):
    mode: DeliveryModeName
    delivered_line: int | None = None
    github_comment_id: int | None = None


class FindingHistory(Schema):
    occurrence_count: int = 1
    first_seen_run_id: str | None = None
    previously_addressed: int = 0
    previously_dismissed: int = 0


class FindingSuppression(Schema):
    suppression_id: str
    scope: SuppressionScopeName
    reason: str
    created_by: str | None = None
    expires_at: UtcDatetime | None = None


class Finding(Schema):
    id: str
    review_id: str
    fingerprint: str | None = None
    specialist: str | None = None
    category: Category
    rule_key: str
    title: str
    body_markdown: str
    location: FindingLocation
    severity: FindingSeverity | None = None
    proof: FindingProof | None = None
    status: FindingStatusName
    blocking: bool = False
    delivery: FindingDelivery | None = None
    history: FindingHistory | None = None
    suppression: FindingSuppression | None = None
    created_at: UtcDatetime


# --------------------------------------------------------------------------------------
# §6.3 GET /v1/reviews/{id}/result
# --------------------------------------------------------------------------------------
class RepositoryInfo(Schema):
    owner: str
    name: str
    default_branch: str | None = None


class PullRequestInfo(Schema):
    number: int
    title: str | None = None
    author: str | None = None
    head_sha: str | None = None
    base_sha: str | None = None
    url: str | None = None


class ContextInfo(Schema):
    files_changed: int = 0
    files_reviewed: int = 0
    files_excluded: int = 0
    excluded_reasons: dict[str, str] = Field(default_factory=dict)
    truncated: bool = False


class GateInfo(Schema):
    conclusion: GateConclusionName
    reason: str = ""
    delivery: GateDeliveryName | None = None
    context_name: str = "prguard/merge-gate"
    blocking_finding_ids: list[str] = Field(default_factory=list)


class LadderBreakdown(Schema):
    inline_exact: int = 0
    inline_nearest: int = 0
    file_level: int = 0
    summary_only: int = 0


class DeliveryInfo(Schema):
    status: DeliveryStatusName
    github_review_id: int | None = None
    #: The AI never approves (§4.7, AC-14).
    event: Literal["COMMENT"] = "COMMENT"
    comments_posted: int = 0
    ladder_breakdown: LadderBreakdown = Field(default_factory=LadderBreakdown)


class ResultCounts(Schema):
    proposed: int = 0
    published: int = 0
    suppressed: int = 0
    dropped: int = 0
    disproven: int = 0
    blocking: int = 0


class CostInfo(Schema):
    usd_estimate: float | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0


class TimingInfo(Schema):
    queued_at: UtcDatetime | None = None
    started_at: UtcDatetime | None = None
    finished_at: UtcDatetime | None = None
    duration_seconds: float | None = None


class ReviewResult(Schema):
    review_id: str
    status: RunStatusName
    repository: RepositoryInfo
    pull_request: PullRequestInfo
    risk_tier: RiskTierName | None = None
    context: ContextInfo = Field(default_factory=ContextInfo)
    gate: GateInfo | None = None
    delivery: DeliveryInfo | None = None
    counts: ResultCounts = Field(default_factory=ResultCounts)
    cost: CostInfo = Field(default_factory=CostInfo)
    timing: TimingInfo = Field(default_factory=TimingInfo)
    degradations: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    #: Exactly what we posted, or would have posted (§6.3, E17).
    review_payload: dict[str, Any] | None = None
    audit_url: str


# --------------------------------------------------------------------------------------
# §6.5 GET /v1/findings
# --------------------------------------------------------------------------------------
class PageInfo(Schema):
    limit: int
    next_cursor: str | None = None
    has_more: bool = False


class FindingTotals(Schema):
    matched: int = 0


class FindingList(Schema):
    items: list[Finding] = Field(default_factory=list)
    page: PageInfo
    totals: FindingTotals = Field(default_factory=FindingTotals)


# --------------------------------------------------------------------------------------
# §6.6 POST /v1/findings/{id}/suppress
# --------------------------------------------------------------------------------------
class SuppressRequest(Schema):
    scope: SuppressionScopeName
    #: Required and non-empty — a ledger without reasons is not evidence.
    reason: str
    expires_at: datetime | None = None
    #: Required for `pattern`, ignored otherwise.
    match_path: str | None = None

    @model_validator(mode="after")
    def _spec_6_6_rules(self) -> SuppressRequest:
        if not self.reason.strip():
            raise ValueError("reason is required and must be non-empty")
        if self.scope == "pattern" and not (self.match_path or "").strip():
            raise ValueError("match_path is required when scope is 'pattern'")
        return self


class AffectedFindings(Schema):
    this_run: int = 0
    historical: int = 0


class SuppressionCreated(Schema):
    suppression_id: str
    fingerprint: str | None = None
    scope: SuppressionScopeName
    match_path: str | None = None
    reason: str
    created_by: str | None = None
    source: Literal["human_api", "auto_convention"] = "human_api"
    expires_at: UtcDatetime | None = None
    revoked_at: UtcDatetime | None = None
    affected_findings: AffectedFindings = Field(default_factory=AffectedFindings)
    created_at: UtcDatetime


# --------------------------------------------------------------------------------------
# §6.7 GET /v1/suppressions · DELETE /v1/suppressions/{id}
# --------------------------------------------------------------------------------------
class SuppressionItem(Schema):
    suppression_id: str
    scope: SuppressionScopeName
    match_path: str | None = None
    rule_key: str | None = None
    category: Category | None = None
    reason: str
    created_by: str | None = None
    source: Literal["human_api", "auto_convention"] = "human_api"
    active: bool = True
    expires_at: UtcDatetime | None = None
    revoked_at: UtcDatetime | None = None
    suppressed_count: int = 0
    last_matched_at: UtcDatetime | None = None
    created_at: UtcDatetime


class SuppressionTotals(Schema):
    active: int = 0
    expired: int = 0
    revoked: int = 0


class SuppressionList(Schema):
    items: list[SuppressionItem] = Field(default_factory=list)
    page: PageInfo
    totals: SuppressionTotals = Field(default_factory=SuppressionTotals)


# --------------------------------------------------------------------------------------
# §6.8 GET /v1/audit
# --------------------------------------------------------------------------------------
class AuditItem(Schema):
    seq: int
    event_type: str
    actor_type: Literal["ai", "human", "system"]
    actor_id: str | None = None
    review_id: str | None = None
    finding_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    event_hash: str
    prev_hash: str | None = None
    created_at: UtcDatetime


class AuditChain(Schema):
    #: Recomputed on read. A broken chain is served, not hidden.
    verified: bool
    checked: int = 0
    first_seq: int | None = None
    last_seq: int | None = None
    broken_at_seq: int | None = None


class AuditList(Schema):
    items: list[AuditItem] = Field(default_factory=list)
    chain: AuditChain
    page: PageInfo


# --------------------------------------------------------------------------------------
# §6.9 GET /v1/accuracy
# --------------------------------------------------------------------------------------
class AccuracyWindow(Schema):
    since: UtcDatetime | None = None
    until: UtcDatetime | None = None
    repository: str | None = None


class AccuracyRuns(Schema):
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    cancelled: int = 0
    median_duration_seconds: float | None = None


class AccuracyFindings(Schema):
    proposed: int = 0
    published: int = 0
    suppressed: int = 0
    dropped_by_coordinator: int = 0
    per_review_published_mean: float = 0.0


class AccuracyProof(Schema):
    attempted: int = 0
    proven: int = 0
    disproven: int = 0
    inconclusive: int = 0
    skipped_no_env: int = 0
    proven_rate: float | None = None
    disproven_rate: float | None = None


class AccuracyMetric(Schema):
    """Every number ships with its `n` and its definition (§6.9)."""

    value: float | None = None
    n: int = 0
    definition: str


class AccuracyPrecisionProxies(Schema):
    execution_verified_precision: AccuracyMetric
    self_caught_false_positive_rate: AccuracyMetric
    human_dismissal_rate: AccuracyMetric
    addressed_rate: AccuracyMetric


class AccuracyGate(Schema):
    runs_red: int = 0
    runs_green: int = 0
    runs_neutral: int = 0
    break_glass_overrides: int = 0


class AccuracyReport(Schema):
    window: AccuracyWindow
    runs: AccuracyRuns
    findings: AccuracyFindings
    proof: AccuracyProof
    precision_proxies: AccuracyPrecisionProxies
    gate: AccuracyGate
    #: Required and non-empty — an honest self-report is the differentiator.
    caveats: list[str] = Field(min_length=1)


# --------------------------------------------------------------------------------------
# §6.10 POST /webhooks/github
# --------------------------------------------------------------------------------------
class WebhookAccepted(Schema):
    status: Literal["accepted"] = "accepted"
    review_id: str
    delivery_id: str
    event: str
    action: str | None = None


class WebhookDuplicate(Schema):
    status: Literal["duplicate"] = "duplicate"
    review_id: str | None = None


class WebhookIgnored(Schema):
    status: Literal["ignored"] = "ignored"
    reason: str


# --------------------------------------------------------------------------------------
# §6.11 GET /healthz · GET /readyz
# --------------------------------------------------------------------------------------
class HealthResponse(Schema):
    status: Literal["ok"] = "ok"
    version: str


class WorkersStatus(Schema):
    running: int = 0
    queue_depth: int = 0


class ReadyResponse(Schema):
    status: Literal["ready", "degraded"] = "ready"
    database: str
    anthropic: str
    github: str
    docker: str
    proof_runner: str
    workers: WorkersStatus = Field(default_factory=WorkersStatus)
