"""Shared domain contracts — the vocabulary every other module speaks.

Ownership: this module is owned by T2 and is **read-only for every later track**. It holds
type aliases, frozen value objects and the canonical defaults from spec §4.4/§4.8; it holds no
business logic. Anything that *decides* something lives in ``severity.py``, ``suppression.py``
or ``delivery/gate.py``.

Spec references: §4.1 (S2 context objects), §4.4 (severity), §4.6 (proof), §5.1 (tables),
§6.12 (specialist structured-output contract).

The wire contracts of §6.12 and §4.6 are ``pydantic.dataclasses`` so that
:func:`prguard.llm.structured.complete_structured` can validate a model response against them
directly; everything else is a stdlib dataclass with no validation cost.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from types import MappingProxyType
from typing import Annotated, Final, Literal

from pydantic import Field, model_validator
from pydantic.dataclasses import dataclass as validated_dataclass

# ---------------------------------------------------------------------------
# Enumerations (spec §4.4, §4.6, §4.7, §5.1, §6.12)
# ---------------------------------------------------------------------------

Band = Literal["critical", "high", "medium", "low", "info"]
Category = Literal["correctness", "security", "test_integrity", "performance", "maintainability"]
ProofStatus = Literal[
    "not_attempted",
    "not_applicable",
    "proven",
    "disproven",
    "inconclusive",
    "skipped_no_env",
]
FindingStatus = Literal["proposed", "suppressed", "published", "dropped", "disproven"]
DeliveryMode = Literal[
    "inline_exact", "inline_nearest", "file_level", "summary_only", "not_delivered"
]
GateConclusion = Literal["success", "failure", "neutral"]
RiskTier = Literal["trivial", "standard", "full"]

Side = Literal["LEFT", "RIGHT"]
DropReason = Literal[
    "duplicate",
    "speculative",
    "nitpick",
    "convention_contradicted",
    "hallucinated_path",
    "out_of_diff",
]
SuppressionScope = Literal["line", "file", "pattern", "repo", "tenant"]
SuppressionSource = Literal["human_api", "auto_convention"]
FileChangeStatus = Literal["added", "modified", "removed", "renamed"]
FileClassification = Literal["source", "test", "binary", "generated", "vendored", "lockfile"]
ProofRunner = Literal["docker", "subprocess"]
ProofIsolation = Literal["isolated", "degraded"]
ProofOutcomeKind = Literal[
    "failing_as_expected",
    "passed_unexpectedly",
    "pre_existing_failure",
    "timeout",
    "error",
    "skipped_no_env",
]
BaselineMode = Literal["compared", "not_applicable", "skipped"]
GateDelivery = Literal["check_run", "commit_status", "dry_run"]

# ---------------------------------------------------------------------------
# Canonical defaults (spec §4.4 / §4.8 — every one of these is overridable by config)
# ---------------------------------------------------------------------------

#: Severity bands in ascending order of seriousness. The single source of band ordering.
BAND_ORDER: Final[tuple[Band, ...]] = ("info", "low", "medium", "high", "critical")

#: Rank of each band, so `>=` comparisons between bands are unambiguous.
BAND_RANK: Final[Mapping[Band, int]] = MappingProxyType(
    {band: index for index, band in enumerate(BAND_ORDER)}
)

#: Lower bound (inclusive) of each band, spec §4.4 `[ASSUMED]`. ``info`` is the else-branch and
#: therefore has no threshold.
DEFAULT_BAND_THRESHOLDS: Final[Mapping[Band, float]] = MappingProxyType(
    {"critical": 0.75, "high": 0.55, "medium": 0.35, "low": 0.15}
)

#: The six severity inputs, in the order spec §4.4 tabulates them.
SEVERITY_INPUT_FIELDS: Final[tuple[str, ...]] = (
    "reachability",
    "blast_radius",
    "path_sensitivity",
    "coverage_gap",
    "churn",
    "proof_confidence",
)

#: Default severity weights, spec §4.4 `[ASSUMED]`. Must sum to 1.0; config validates at startup.
DEFAULT_SEVERITY_WEIGHTS: Final[Mapping[str, float]] = MappingProxyType(
    {
        "reachability": 0.20,
        "blast_radius": 0.15,
        "path_sensitivity": 0.25,
        "coverage_gap": 0.15,
        "churn": 0.10,
        "proof_confidence": 0.15,
    }
)

#: Default gate threshold, spec §4.4 `[ASSUMED]`: a proven `medium` finding does not block.
DEFAULT_BLOCK_MIN_SEVERITY: Final[Band] = "high"

#: The language that may ever block a merge (spec §4.4, Q9 / E25).
BLOCKING_LANGUAGE: Final[str] = "python"


# ---------------------------------------------------------------------------
# Severity (spec §4.4)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SeverityInputs:
    """The six measured inputs to the severity sum. Field names are the API field names."""

    reachability: float
    blast_radius: float
    path_sensitivity: float
    coverage_gap: float
    churn: float
    proof_confidence: float
    churn_available: bool = True

    def as_mapping(self) -> Mapping[str, float]:
        """The six weighted inputs keyed by name, in :data:`SEVERITY_INPUT_FIELDS` order."""
        return {name: float(getattr(self, name)) for name in SEVERITY_INPUT_FIELDS}


@dataclass(frozen=True)
class SeverityResult:
    """The output of ``severity.compute`` — the score plus everything needed to explain it."""

    score: float
    band: Band
    inputs: SeverityInputs
    weights: Mapping[str, float]
    explanation: str = ""
    notes: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Specialist structured output (spec §6.12 — the wire contract, validated on arrival)
# ---------------------------------------------------------------------------


@validated_dataclass(frozen=True)
class Evidence:
    """A quoted line from a file supplied in context, backing a finding."""

    file_path: str
    line: int
    quote: str


@validated_dataclass(frozen=True)
class SkippedFile:
    """A file a specialist chose not to review, with its reason."""

    path: str
    reason: str


@validated_dataclass(frozen=True)
class SpecialistFinding:
    """One finding as emitted by a specialist, before coordination (spec §6.12).

    Constraints enforced here rather than at every call site: ``0 <= confidence <= 1`` and
    ``start_line <= end_line``. ``severity_hint`` is captured and **never** used for ranking
    (§4.4) — the coordinator stores it as ``llm_severity_hint``.
    """

    rule_key: str
    category: Category
    title: str
    body_markdown: str
    file_path: str
    start_line: Annotated[int, Field(ge=1)]
    end_line: Annotated[int, Field(ge=1)]
    symbol_hint: str | None = None
    severity_hint: str | None = None
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 0.5
    provable: bool = False
    repro_hint: str | None = None
    evidence: tuple[Evidence, ...] = ()

    @model_validator(mode="after")
    def _line_range_is_ordered(self) -> SpecialistFinding:
        if self.start_line > self.end_line:
            raise ValueError(
                f"start_line ({self.start_line}) must be <= end_line ({self.end_line})"
            )
        return self


@validated_dataclass(frozen=True)
class SpecialistOutput:
    """A whole specialist response (spec §6.12). An empty ``findings`` list is a good answer."""

    specialist: str
    model: str
    findings: tuple[SpecialistFinding, ...] = ()
    skipped_files: tuple[SkippedFile, ...] = ()
    notes: str | None = None


@dataclass(frozen=True)
class DroppedFinding:
    """A finding the coordinator refused, persisted so ``/result`` can say what was filtered."""

    specialist: str
    rule_key: str
    category: Category
    title: str
    file_path: str
    start_line: int
    end_line: int
    drop_reason: DropReason
    detail: str = ""


# ---------------------------------------------------------------------------
# Canonical finding — the object every stage after S4 passes around
# ---------------------------------------------------------------------------


@dataclass
class CanonicalFinding:
    """A normalised finding. Mutable: later stages fill severity, fingerprint, proof, delivery.

    ``blocking`` is written by :func:`prguard.core.severity.is_blocking` and by nothing else
    (spec §4.4).
    """

    id: str
    tenant_id: str
    repository_id: str
    specialist: str
    category: Category
    rule_key: str
    title: str
    body_markdown: str
    file_path: str
    start_line: int
    end_line: int
    side: Side
    language: str
    symbol_path: str
    llm_severity_hint: str | None = None
    confidence: float = 0.5
    provable: bool = False
    repro_hint: str | None = None
    evidence: list[Evidence] = field(default_factory=list)
    severity: SeverityResult | None = None
    fingerprint: str | None = None
    status: FindingStatus = "proposed"
    proof_status: ProofStatus = "not_attempted"
    blocking: bool = False
    delivery_mode: DeliveryMode = "not_delivered"
    delivered_line: int | None = None
    github_comment_id: int | None = None
    review_run_id: str | None = None
    suppression_id: str | None = None


# ---------------------------------------------------------------------------
# Diff / context objects (spec §4.1 S2)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Hunk:
    """One unified-diff hunk. ``right_lines`` are the RIGHT-side line numbers it covers."""

    old_start: int
    old_count: int
    new_start: int
    new_count: int
    section_header: str = ""
    right_lines: tuple[int, ...] = ()


@dataclass(frozen=True)
class LineMap:
    """Answers the two questions the comment ladder asks of a file (§4.7 rungs 1 and 2).

    Built by ``core/diff.py`` (T4), consumed by ``delivery/comment_ladder.py`` (T6).
    ``commentable_lines`` is the set of RIGHT-side lines GitHub will accept a comment on.
    """

    file_path: str
    hunks: tuple[Hunk, ...] = ()
    commentable_lines: frozenset[int] = frozenset()

    def contains(self, line: int) -> bool:
        """True if ``line`` is a RIGHT-side line inside a hunk (rung 1, ``inline_exact``)."""
        return line in self.commentable_lines

    def nearest(self, line: int, max_distance: int) -> int | None:
        """The closest commentable line within ``max_distance`` (rung 2, ``inline_nearest``).

        Returns ``None`` when nothing is close enough. Ties resolve to the **lower** line
        number so the choice is deterministic across runs.
        """
        if max_distance < 0 or not self.commentable_lines:
            return None
        candidates = [
            candidate
            for candidate in self.commentable_lines
            if abs(candidate - line) <= max_distance
        ]
        if not candidates:
            return None
        return min(candidates, key=lambda candidate: (abs(candidate - line), candidate))


@dataclass(frozen=True)
class FileContext:
    """One changed file as S2 prepared it for the specialists."""

    path: str
    language: str
    change_status: FileChangeStatus
    classification: FileClassification
    line_map: LineMap
    patch: str = ""
    content: str | None = None
    symbols: tuple[str, ...] = ()
    previous_path: str | None = None
    excluded_reason: str | None = None


# ---------------------------------------------------------------------------
# Proof objects (spec §4.6)
# ---------------------------------------------------------------------------


@validated_dataclass(frozen=True)
class ProofGeneration:
    """The repro-generator's structured output (spec §4.6), validated on arrival."""

    test_file_path: str
    test_code: str
    expected_failure_signal: str
    extra_requirements: tuple[str, ...] = ()
    explanation: str = ""


@dataclass(frozen=True)
class ProofRequest:
    """One repro to execute against base and head."""

    finding_id: str
    test_file_path: str
    test_code: str
    expected_failure_signal: str
    extra_requirements: tuple[str, ...] = ()
    timeout_seconds: int = 90
    require_baseline: bool = True


@dataclass(frozen=True)
class RunResult:
    """The result of one sandbox execution."""

    exit_code: int
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    timed_out: bool = False
    command: str = ""


@dataclass(frozen=True)
class ProofOutcome:
    """The classified result of a proof attempt (spec §4.6 table)."""

    status: ProofStatus
    outcome: ProofOutcomeKind
    runner: ProofRunner
    isolation: ProofIsolation
    baseline_mode: BaselineMode
    base: RunResult | None = None
    head: RunResult | None = None
    deps_install_ok: bool = True
    duration_ms: int = 0
    detail: str = ""


# ---------------------------------------------------------------------------
# Suppression ledger (spec §5.1, §6.6)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SuppressionRule:
    """One row of the append-only suppression ledger.

    ``repository_id is None`` means tenant-wide; ``fingerprint is None`` means the rule is a
    path/pattern rule rather than an identity rule. Rows are never deleted — ``revoked_at`` is
    the soft delete (spec §5.1).
    """

    id: str
    tenant_id: str
    scope: SuppressionScope
    reason: str
    created_by: str
    source: SuppressionSource = "human_api"
    repository_id: str | None = None
    fingerprint: str | None = None
    match_path: str | None = None
    match_rule_key: str | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime | None = None


__all__ = [
    "BAND_ORDER",
    "BAND_RANK",
    "BLOCKING_LANGUAGE",
    "DEFAULT_BAND_THRESHOLDS",
    "DEFAULT_BLOCK_MIN_SEVERITY",
    "DEFAULT_SEVERITY_WEIGHTS",
    "SEVERITY_INPUT_FIELDS",
    "Band",
    "BaselineMode",
    "CanonicalFinding",
    "Category",
    "DeliveryMode",
    "DropReason",
    "DroppedFinding",
    "Evidence",
    "FileChangeStatus",
    "FileClassification",
    "FileContext",
    "FindingStatus",
    "GateConclusion",
    "GateDelivery",
    "Hunk",
    "LineMap",
    "ProofGeneration",
    "ProofIsolation",
    "ProofOutcome",
    "ProofOutcomeKind",
    "ProofRequest",
    "ProofRunner",
    "ProofStatus",
    "RiskTier",
    "RunResult",
    "SeverityInputs",
    "SeverityResult",
    "Side",
    "SkippedFile",
    "SpecialistFinding",
    "SpecialistOutput",
    "SuppressionRule",
    "SuppressionScope",
    "SuppressionSource",
]
