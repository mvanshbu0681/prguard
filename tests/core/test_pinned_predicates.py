"""The four pinned decision functions wave 2 builds on, plus the LineMap query contract.

These are exhaustive on purpose. Every wave-2 track imports these predicates and trusts them
without re-deriving the rules, so the table here *is* the specification's cross-check:

* ``severity.band_of``    — spec §4.4 bands 0.75 / 0.55 / 0.35 / 0.15, ``>=`` semantics
* ``severity.is_blocking``— spec §4.4, the sole writer of ``blocking`` in the codebase
* ``gate.conclude``       — spec §4.7, failure > neutral > success
* ``suppression.matches`` — spec §5.1 / §6.6 / AC-9, expiry and revocation guards
* ``LineMap.contains`` / ``.nearest`` — spec §4.7 rungs 1 and 2, consumed by the ladder
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from prguard.core import severity, suppression
from prguard.core.delivery import gate
from prguard.core.types import (
    BAND_ORDER,
    DEFAULT_BAND_THRESHOLDS,
    Band,
    CanonicalFinding,
    FindingStatus,
    LineMap,
    ProofStatus,
    SuppressionRule,
    SuppressionScope,
)

ALL_BANDS: tuple[Band, ...] = ("critical", "high", "medium", "low", "info")
ALL_PROOF_STATUSES: tuple[ProofStatus, ...] = (
    "not_attempted",
    "not_applicable",
    "proven",
    "disproven",
    "inconclusive",
    "skipped_no_env",
)
ALL_FINDING_STATUSES: tuple[FindingStatus, ...] = (
    "proposed",
    "suppressed",
    "published",
    "dropped",
    "disproven",
)
NOW = datetime(2026, 9, 14, 23, 0, 0, tzinfo=UTC)


def make_finding(**overrides: object) -> CanonicalFinding:
    """A minimally-populated canonical finding; override only what a test cares about."""
    kwargs: dict[str, object] = {
        "id": "f-1",
        "tenant_id": "t-1",
        "repository_id": "r-1",
        "specialist": "bugs",
        "category": "correctness",
        "rule_key": "unguarded_none_arithmetic",
        "title": "apply_discount raises TypeError when rate is None",
        "body_markdown": "evidence, not opinion",
        "file_path": "app/billing.py",
        "start_line": 41,
        "end_line": 44,
        "side": "RIGHT",
        "language": "python",
        "symbol_path": "app/billing.py::apply_discount",
        "fingerprint": "8f14e45f" * 8,
    }
    kwargs.update(overrides)
    return CanonicalFinding(**kwargs)  # type: ignore[arg-type]


def make_rule(**overrides: object) -> SuppressionRule:
    """A live, tenant-wide suppression rule; override only what a test cares about."""
    kwargs: dict[str, object] = {
        "id": "s-1",
        "tenant_id": "t-1",
        "scope": "tenant",
        "reason": "Intentional; discussed 2026-08-11.",
        "created_by": "vansh.m@shavastudios.ai",
        "created_at": NOW - timedelta(days=30),
    }
    kwargs.update(overrides)
    return SuppressionRule(**kwargs)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# severity.band_of — spec §4.4
# ---------------------------------------------------------------------------

BAND_BOUNDARY_CASES: tuple[tuple[float, Band], ...] = (
    (1.0, "critical"),
    (0.99, "critical"),
    (0.75, "critical"),
    (0.7499999, "high"),
    (0.74, "high"),
    (0.56, "high"),
    (0.55, "high"),
    (0.5499999, "medium"),
    (0.36, "medium"),
    (0.35, "medium"),
    (0.3499999, "low"),
    (0.16, "low"),
    (0.15, "low"),
    (0.1499999, "info"),
    (0.01, "info"),
    (0.0, "info"),
)


@pytest.mark.parametrize(("score", "expected"), BAND_BOUNDARY_CASES)
def test_band_of_boundaries(score: float, expected: Band) -> None:
    assert severity.band_of(score) == expected


def test_band_of_thresholds_are_inclusive_lower_bounds() -> None:
    """Every documented threshold lands *in* its band; a hair under falls to the next one down."""
    for band, threshold in DEFAULT_BAND_THRESHOLDS.items():
        assert severity.band_of(threshold) == band
        below = severity.band_of(threshold - 1e-9)
        assert BAND_ORDER.index(below) == BAND_ORDER.index(band) - 1


def test_band_of_is_monotonically_non_decreasing() -> None:
    ranks = [BAND_ORDER.index(severity.band_of(step / 1000)) for step in range(0, 1001)]
    assert ranks == sorted(ranks)


def test_band_of_clamps_scores_outside_the_unit_interval() -> None:
    assert severity.band_of(1.7) == "critical"
    assert severity.band_of(-0.3) == "info"


def test_band_of_honours_configured_thresholds() -> None:
    """Bands are config, not constants — a deployment may retune them without a code change."""
    strict = {"critical": 0.9, "high": 0.8, "medium": 0.7, "low": 0.6}
    assert severity.band_of(0.75, thresholds=strict) == "medium"
    assert severity.band_of(0.75) == "critical"


# ---------------------------------------------------------------------------
# severity.is_blocking — spec §4.4, the sole source of truth
# ---------------------------------------------------------------------------


def _expected_blocking(
    *,
    proof_status: ProofStatus,
    band: Band,
    language: str,
    status: FindingStatus,
    block_min_severity: Band,
) -> bool:
    """The §4.4 conjunction, written out independently of the implementation."""
    band_is_high_enough = ALL_BANDS.index(band) <= ALL_BANDS.index(block_min_severity)
    return (
        proof_status == "proven"
        and band_is_high_enough
        and language == "python"
        and status == "published"
    )


@pytest.mark.parametrize("proof_status", ALL_PROOF_STATUSES)
@pytest.mark.parametrize("band", ALL_BANDS)
@pytest.mark.parametrize("language", ["python", "typescript"])
@pytest.mark.parametrize("status", ALL_FINDING_STATUSES)
def test_is_blocking_truth_table(
    proof_status: ProofStatus, band: Band, language: str, status: FindingStatus
) -> None:
    assert severity.is_blocking(
        proof_status=proof_status,
        band=band,
        language=language,
        status=status,
        block_min_severity="high",
    ) is _expected_blocking(
        proof_status=proof_status,
        band=band,
        language=language,
        status=status,
        block_min_severity="high",
    )


def test_is_blocking_the_one_true_case() -> None:
    assert severity.is_blocking(
        proof_status="proven",
        band="critical",
        language="python",
        status="published",
        block_min_severity="high",
    )


@pytest.mark.parametrize("band", ALL_BANDS)
@pytest.mark.parametrize("proof_status", ALL_PROOF_STATUSES)
def test_non_python_never_blocks(band: Band, proof_status: ProofStatus) -> None:
    """AC-16 / E25 — reported and scored normally, but never a merge gate."""
    assert not severity.is_blocking(
        proof_status=proof_status,
        band=band,
        language="typescript",
        status="published",
        block_min_severity="high",
    )


def test_unproven_critical_does_not_block() -> None:
    """The product claim: the gate is red only on proof."""
    for proof_status in ALL_PROOF_STATUSES:
        if proof_status == "proven":
            continue
        assert not severity.is_blocking(
            proof_status=proof_status,
            band="critical",
            language="python",
            status="published",
            block_min_severity="high",
        )


def test_proven_medium_does_not_block_at_the_default_threshold() -> None:
    assert not severity.is_blocking(
        proof_status="proven",
        band="medium",
        language="python",
        status="published",
        block_min_severity="high",
    )


@pytest.mark.parametrize(
    ("block_min_severity", "band", "expected"),
    [
        ("medium", "medium", True),
        ("medium", "low", False),
        ("critical", "high", False),
        ("critical", "critical", True),
        ("info", "info", True),
        ("low", "info", False),
    ],
)
def test_is_blocking_respects_the_configured_threshold(
    block_min_severity: Band, band: Band, expected: bool
) -> None:
    """BLOCK_MIN_SEVERITY is config (§4.8) — moving the gate is a one-line change."""
    assert (
        severity.is_blocking(
            proof_status="proven",
            band=band,
            language="python",
            status="published",
            block_min_severity=block_min_severity,
        )
        is expected
    )


@pytest.mark.parametrize("status", ALL_FINDING_STATUSES)
def test_only_published_findings_block(status: FindingStatus) -> None:
    """A suppressed finding is a human decision and must not gate the merge (E29)."""
    result = severity.is_blocking(
        proof_status="proven",
        band="critical",
        language="python",
        status=status,
        block_min_severity="high",
    )
    assert result is (status == "published")


@pytest.mark.parametrize("language", ["Python", "PYTHON", " python "])
def test_language_match_is_case_and_whitespace_insensitive(language: str) -> None:
    assert severity.is_blocking(
        proof_status="proven",
        band="high",
        language=language,
        status="published",
        block_min_severity="high",
    )


# ---------------------------------------------------------------------------
# gate.conclude — spec §4.7
# ---------------------------------------------------------------------------


def test_gate_conclude_precedence() -> None:
    """failure beats neutral beats success, and a blocking finding always wins."""
    assert (
        gate.conclude(
            blocking_finding_ids=["f-1"], degraded=True, all_proofs_skipped_for_env=True
        )
        == "failure"
    )
    assert (
        gate.conclude(
            blocking_finding_ids=[], degraded=True, all_proofs_skipped_for_env=False
        )
        == "neutral"
    )
    assert (
        gate.conclude(
            blocking_finding_ids=[], degraded=False, all_proofs_skipped_for_env=True
        )
        == "neutral"
    )
    assert (
        gate.conclude(
            blocking_finding_ids=[], degraded=False, all_proofs_skipped_for_env=False
        )
        == "success"
    )


@pytest.mark.parametrize("degraded", [True, False])
@pytest.mark.parametrize("all_skipped", [True, False])
def test_gate_conclude_is_failure_whenever_anything_blocks(
    degraded: bool, all_skipped: bool
) -> None:
    assert (
        gate.conclude(
            blocking_finding_ids=("f-1", "f-2"),
            degraded=degraded,
            all_proofs_skipped_for_env=all_skipped,
        )
        == "failure"
    )


def test_gate_conclude_accepts_any_sequence() -> None:
    assert (
        gate.conclude(
            blocking_finding_ids=tuple(), degraded=False, all_proofs_skipped_for_env=False
        )
        == "success"
    )


# ---------------------------------------------------------------------------
# suppression.matches — spec §5.1 / §6.6, guards only (T4 completes the scope matrix)
# ---------------------------------------------------------------------------


def test_matches_a_live_tenant_rule() -> None:
    assert suppression.matches(finding=make_finding(), rule=make_rule(), now=NOW)


def test_expired_rule_does_not_suppress() -> None:
    rule = make_rule(expires_at=NOW - timedelta(seconds=1))
    assert not suppression.matches(finding=make_finding(), rule=rule, now=NOW)


def test_rule_expiring_in_the_future_still_suppresses() -> None:
    rule = make_rule(expires_at=NOW + timedelta(days=1))
    assert suppression.matches(finding=make_finding(), rule=rule, now=NOW)


def test_expiry_is_exclusive_at_the_instant_it_expires() -> None:
    rule = make_rule(expires_at=NOW)
    assert not suppression.matches(finding=make_finding(), rule=rule, now=NOW)


def test_revoked_rule_does_not_suppress() -> None:
    """DELETE is a soft delete — the row survives as audit evidence but stops matching."""
    rule = make_rule(revoked_at=NOW - timedelta(days=1))
    assert not suppression.matches(finding=make_finding(), rule=rule, now=NOW)


def test_revoked_rule_does_not_suppress_even_before_its_expiry() -> None:
    rule = make_rule(revoked_at=NOW - timedelta(days=1), expires_at=NOW + timedelta(days=365))
    assert not suppression.matches(finding=make_finding(), rule=rule, now=NOW)


def test_naive_timestamps_are_treated_as_utc() -> None:
    """A SQLite round-trip drops tzinfo; that must not crash the ledger check."""
    rule = make_rule(expires_at=(NOW - timedelta(seconds=1)).replace(tzinfo=None))
    assert not suppression.matches(finding=make_finding(), rule=rule, now=NOW)
    assert not suppression.matches(
        finding=make_finding(), rule=rule, now=NOW.replace(tzinfo=None)
    )


def test_other_tenants_rule_never_suppresses() -> None:
    rule = make_rule(tenant_id="t-other")
    assert not suppression.matches(finding=make_finding(), rule=rule, now=NOW)


def test_repo_scope_is_bounded_to_its_repository() -> None:
    rule = make_rule(scope="repo", repository_id="r-1")
    assert suppression.matches(finding=make_finding(), rule=rule, now=NOW)
    assert not suppression.matches(
        finding=make_finding(repository_id="r-2"), rule=rule, now=NOW
    )


def test_tenant_scope_spans_repositories() -> None:
    rule = make_rule(scope="tenant")
    assert suppression.matches(finding=make_finding(repository_id="r-99"), rule=rule, now=NOW)


def test_tenant_scope_spans_repositories_even_when_a_repository_is_recorded() -> None:
    """§5.1/§6.6: ``tenant`` is the widest scope and is the one that must widen back out.

    `POST /v1/findings/{id}/suppress` records `repository_id` on **every** row, so this is
    not an exotic shape — it is the only shape the API can produce. Reading that column as an
    unconditional narrowing made `scope="tenant"` unreachable past its first repository.
    """
    rule = make_rule(scope="tenant", repository_id="r-1")
    assert suppression.matches(finding=make_finding(repository_id="r-2"), rule=rule, now=NOW)


@pytest.mark.parametrize("scope", ["line", "file", "pattern", "repo"])
def test_repository_scoped_rule_never_leaks_across_repositories(
    scope: SuppressionScope,
) -> None:
    """Every scope narrower than ``tenant``; ``tenant`` is covered by the test above it."""
    rule = make_rule(
        scope=scope, repository_id="r-1", match_path="app/billing.py", fingerprint="8f14e45f" * 8
    )
    assert not suppression.matches(
        finding=make_finding(repository_id="r-2"), rule=rule, now=NOW
    )


def test_fingerprint_rule_only_matches_its_own_fingerprint() -> None:
    rule = make_rule(scope="line", match_path="app/billing.py", fingerprint="8f14e45f" * 8)
    assert suppression.matches(finding=make_finding(), rule=rule, now=NOW)
    assert not suppression.matches(
        finding=make_finding(fingerprint="deadbeef" * 8), rule=rule, now=NOW
    )


def test_rule_key_narrowing_is_honoured() -> None:
    rule = make_rule(match_rule_key="unguarded_none_arithmetic")
    assert suppression.matches(finding=make_finding(), rule=rule, now=NOW)
    assert not suppression.matches(
        finding=make_finding(rule_key="bare_except"), rule=rule, now=NOW
    )


def test_file_scope_matches_the_exact_path_only() -> None:
    rule = make_rule(scope="file", match_path="app/billing.py")
    assert suppression.matches(finding=make_finding(), rule=rule, now=NOW)
    assert not suppression.matches(
        finding=make_finding(file_path="app/checkout.py"), rule=rule, now=NOW
    )


def test_pattern_scope_globs() -> None:
    rule = make_rule(scope="pattern", match_path="cli/**")
    assert suppression.matches(finding=make_finding(file_path="cli/main.py"), rule=rule, now=NOW)
    assert suppression.matches(
        finding=make_finding(file_path="cli/cmd/run.py"), rule=rule, now=NOW
    )
    assert not suppression.matches(
        finding=make_finding(file_path="app/billing.py"), rule=rule, now=NOW
    )


def test_pattern_scope_without_a_path_matches_nothing() -> None:
    """A malformed ledger row must fail closed, not suppress the whole repo."""
    rule = make_rule(scope="pattern", match_path=None)
    assert not suppression.matches(finding=make_finding(), rule=rule, now=NOW)


# ---------------------------------------------------------------------------
# LineMap — spec §4.7 rungs 1 and 2, the contract T6's ladder consumes
# ---------------------------------------------------------------------------


@pytest.fixture
def line_map() -> LineMap:
    return LineMap(file_path="app/billing.py", commentable_lines=frozenset({10, 11, 12, 30}))


def test_line_map_contains_only_commentable_lines(line_map: LineMap) -> None:
    assert line_map.contains(10)
    assert line_map.contains(30)
    assert not line_map.contains(9)
    assert not line_map.contains(13)


def test_line_map_nearest_within_distance(line_map: LineMap) -> None:
    assert line_map.nearest(13, 10) == 12
    assert line_map.nearest(13, 1) == 12
    assert line_map.nearest(8, 2) == 10
    assert line_map.nearest(8, 1) is None


def test_line_map_nearest_prefers_the_lower_line_on_a_tie(line_map: LineMap) -> None:
    """Deterministic tie-breaking, so re-review does not move a comment for no reason."""
    assert line_map.nearest(21, 10) == 12


def test_line_map_nearest_of_an_in_hunk_line_is_itself(line_map: LineMap) -> None:
    assert line_map.nearest(11, 10) == 11


def test_empty_line_map_answers_nothing() -> None:
    empty = LineMap(file_path="README.md")
    assert not empty.contains(1)
    assert empty.nearest(1, 100) is None
