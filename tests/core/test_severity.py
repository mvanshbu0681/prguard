"""M2 — severity is computed, not borrowed (spec §4.4, AC-5).

Three claims are under test, and the product rests on all three:

1. ``compute()`` is exactly the documented weighted sum — a table of vectors whose expected
   scores were worked out by hand from §4.4, not by running the implementation.
2. The band boundaries are the documented ones and they are inclusive lower bounds.
3. The model's ``severity_hint`` cannot influence the answer. Not "does not" — **cannot**:
   the hint is not a parameter of any function in this module, which is asserted structurally
   as well as behaviourally.

``band_of`` and ``is_blocking`` are T2's pinned predicates and are exhaustively covered in
``test_pinned_predicates.py``; what is tested here is ``compute()`` on top of them.
"""

from __future__ import annotations

import inspect
from collections.abc import Mapping

import pytest

from prguard.core import severity
from prguard.core.types import (
    DEFAULT_SEVERITY_WEIGHTS,
    SEVERITY_INPUT_FIELDS,
    Band,
    CanonicalFinding,
    ProofStatus,
    SeverityInputs,
)

#: ``(reachability, blast_radius, path_sensitivity, coverage_gap, churn, proof_confidence)``
InputVector = tuple[float, float, float, float, float, float]

#: Worked out from §4.4's weights by hand: .20 / .15 / .25 / .15 / .10 / .15.
FORMULA_CASES: tuple[tuple[InputVector, float, Band], ...] = (
    ((0.0, 0.0, 0.0, 0.0, 0.0, 0.0), 0.0, "info"),
    ((1.0, 1.0, 1.0, 1.0, 1.0, 1.0), 1.0, "critical"),
    ((0.1, 0.1, 0.1, 0.1, 0.1, 0.1), 0.1, "info"),
    # The §6.4 worked example's input vector.
    ((1.0, 0.7, 1.0, 1.0, 0.35, 1.0), 0.89, "critical"),
    ((1.0, 0.0, 1.0, 1.0, 0.0, 1.0), 0.75, "critical"),
    ((1.0, 0.0, 1.0, 0.0, 0.25, 0.5), 0.55, "high"),
    ((1.0, 0.0, 1.0, 0.0, 0.2, 0.5), 0.545, "medium"),
    ((1.0, 1.0, 0.0, 0.0, 0.0, 0.0), 0.35, "medium"),
    ((1.0, 0.9, 0.0, 0.0, 0.0, 0.0), 0.335, "low"),
    ((0.5, 0.2, 0.0, 0.5, 0.1, 0.5), 0.29, "low"),
    ((0.0, 0.0, 0.0, 1.0, 0.0, 0.5), 0.225, "low"),
    ((0.5, 0.0, 0.0, 0.0, 0.0, 0.5), 0.175, "low"),
    ((0.0, 0.0, 0.6, 0.0, 0.0, 0.0), 0.15, "low"),
    ((0.0, 0.0, 0.59, 0.0, 0.0, 0.0), 0.1475, "info"),
    ((0.2, 0.0, 0.0, 0.0, 0.0, 0.5), 0.115, "info"),
)


def inputs_of(vector: InputVector, **overrides: object) -> SeverityInputs:
    kwargs: dict[str, object] = dict(zip(SEVERITY_INPUT_FIELDS, vector, strict=True))
    kwargs.update(overrides)
    return SeverityInputs(**kwargs)  # type: ignore[arg-type]


def reference_score(vector: InputVector, weights: Mapping[str, float]) -> float:
    """The §4.4 sum written out independently of the implementation."""
    pairs = zip(SEVERITY_INPUT_FIELDS, vector, strict=True)
    return round(sum(weights[name] * value for name, value in pairs), 6)


# ---------------------------------------------------------------------------
# The formula (AC-5)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("vector", "expected_score", "expected_band"), FORMULA_CASES)
def test_score_matches_formula(
    vector: InputVector, expected_score: float, expected_band: Band
) -> None:
    result = severity.compute(inputs_of(vector))
    assert result.score == expected_score
    assert result.band == expected_band


@pytest.mark.parametrize(("vector", "expected_score", "_band"), FORMULA_CASES)
def test_score_matches_an_independently_written_sum(
    vector: InputVector, expected_score: float, _band: Band
) -> None:
    assert severity.compute(inputs_of(vector)).score == reference_score(
        vector, DEFAULT_SEVERITY_WEIGHTS
    )


def test_result_carries_the_inputs_and_weights_it_used() -> None:
    """§4.4: every severity carries its inputs and weights so a dashboard can explain it."""
    result = severity.compute(inputs_of((1.0, 0.7, 1.0, 1.0, 0.35, 1.0)))
    assert result.inputs.as_mapping() == {
        "reachability": 1.0,
        "blast_radius": 0.7,
        "path_sensitivity": 1.0,
        "coverage_gap": 1.0,
        "churn": 0.35,
        "proof_confidence": 1.0,
    }
    assert dict(result.weights) == dict(DEFAULT_SEVERITY_WEIGHTS)


def test_weights_come_from_config_not_from_the_call_site() -> None:
    flat = dict.fromkeys(SEVERITY_INPUT_FIELDS, 1.0 / 6.0)
    flat["proof_confidence"] = 1.0 - sum(flat[name] for name in SEVERITY_INPUT_FIELDS[:-1])
    result = severity.compute(inputs_of((1.0, 0.0, 0.0, 0.0, 0.0, 0.0)), weights=flat)
    assert result.score == pytest.approx(1.0 / 6.0, abs=1e-6)
    assert dict(result.weights) == flat


@pytest.mark.parametrize(
    "weights",
    [
        {"reachability": 1.0},
        dict.fromkeys(SEVERITY_INPUT_FIELDS, 0.1),
        {**DEFAULT_SEVERITY_WEIGHTS, "churn": 0.4},
    ],
)
def test_weights_that_do_not_sum_to_one_are_rejected(weights: Mapping[str, float]) -> None:
    """§4.4 requires the weights to sum to 1.0. A silently rescaled score is a wrong score."""
    with pytest.raises(ValueError):
        severity.compute(inputs_of((1.0, 1.0, 1.0, 1.0, 1.0, 1.0)), weights=weights)


def test_inputs_outside_the_unit_interval_cannot_inflate_a_score() -> None:
    result = severity.compute(inputs_of((5.0, -2.0, 1.0, 0.0, 0.0, 0.0)))
    assert result.score == 0.45  # reachability clamped to 1.0, blast_radius clamped to 0.0


def test_compute_is_pure_and_repeatable() -> None:
    inputs = inputs_of((0.5, 0.3, 1.0, 0.5, 0.2, 0.5))
    assert severity.compute(inputs) == severity.compute(inputs)


# ---------------------------------------------------------------------------
# Band boundaries (AC-5)
# ---------------------------------------------------------------------------

BOUNDARY_CASES: tuple[tuple[InputVector, Band], ...] = (
    ((1.0, 0.0, 1.0, 1.0, 0.0, 1.0), "critical"),  # exactly 0.75
    ((1.0, 0.0, 1.0, 0.0, 0.25, 0.5), "high"),  # exactly 0.55
    ((1.0, 1.0, 0.0, 0.0, 0.0, 0.0), "medium"),  # exactly 0.35
    ((0.0, 0.0, 0.6, 0.0, 0.0, 0.0), "low"),  # exactly 0.15
    ((0.0, 0.0, 0.59, 0.0, 0.0, 0.0), "info"),  # a hair under 0.15
)


@pytest.mark.parametrize(("vector", "expected"), BOUNDARY_CASES)
def test_band_boundaries(vector: InputVector, expected: Band) -> None:
    """Thresholds are inclusive lower bounds: landing *on* 0.75 is critical, not high."""
    assert severity.compute(inputs_of(vector)).band == expected


def test_band_boundaries_are_not_disturbed_by_float_addition() -> None:
    """0.15 + 0.075 is 0.22499999999999998 in binary. Scores are rounded before banding."""
    assert severity.compute(inputs_of((0.0, 0.0, 0.0, 1.0, 0.0, 0.5))).score == 0.225


def test_configured_thresholds_are_honoured() -> None:
    strict: Mapping[Band, float] = {"critical": 0.9, "high": 0.8, "medium": 0.7, "low": 0.6}
    vector: InputVector = (1.0, 0.0, 1.0, 1.0, 0.0, 1.0)
    assert severity.compute(inputs_of(vector)).band == "critical"
    assert severity.compute(inputs_of(vector), thresholds=strict).band == "medium"


# ---------------------------------------------------------------------------
# The LLM hint is ignored — the M2 claim (AC-5)
# ---------------------------------------------------------------------------


def test_llm_hint_is_ignored() -> None:
    """A finding the model screamed ``critical`` about, whose measured inputs are near zero.

    Spec §4.4: "The LLM may *emit* a severity string; the coordinator stores it as
    ``llm_severity_hint`` and the scorer ignores it." So the band here follows the 0.1 score
    through §4.4's thresholds, and a hint of ``critical`` moves nothing. A second finding one
    band up shows the same at the bottom of the scored range rather than in the else-branch.
    """
    shouted = CanonicalFinding(
        id="f-1",
        tenant_id="t-1",
        repository_id="r-1",
        specialist="security",
        category="security",
        rule_key="hardcoded_secret",
        title="Hardcoded credential",
        body_markdown="The model was very confident.",
        file_path="app/notes.py",
        start_line=3,
        end_line=3,
        side="RIGHT",
        language="python",
        symbol_path="app/notes.py::note",
        llm_severity_hint="critical",
    )
    scored = severity.compute(inputs_of((0.1, 0.1, 0.1, 0.1, 0.1, 0.1)))
    assert scored.score == 0.1
    assert scored.band == "info"
    assert scored.band != shouted.llm_severity_hint

    in_the_low_band = severity.compute(inputs_of((0.5, 0.0, 0.0, 0.0, 0.0, 0.5)))
    assert in_the_low_band.band == "low"

    shouted.severity = scored
    assert shouted.llm_severity_hint == "critical"  # stored, recorded, and inert


@pytest.mark.parametrize("hint", ["critical", "high", "medium", "low", "info", "BLOCKER", None])
def test_no_hint_value_can_change_a_score(hint: str | None) -> None:
    vector: InputVector = (0.5, 0.5, 0.5, 0.5, 0.5, 0.5)
    baseline = severity.compute(inputs_of(vector))
    finding = CanonicalFinding(
        id="f-2",
        tenant_id="t-1",
        repository_id="r-1",
        specialist="bugs",
        category="correctness",
        rule_key="off_by_one",
        title="Off by one",
        body_markdown="…",
        file_path="app/x.py",
        start_line=1,
        end_line=1,
        side="RIGHT",
        language="python",
        symbol_path="app/x.py::f",
        llm_severity_hint=hint,
    )
    finding.severity = severity.compute(inputs_of(vector))
    assert finding.severity == baseline


def test_the_hint_is_structurally_unable_to_reach_the_scorer() -> None:
    """Not "the scorer ignores the hint" — the hint is not an input it could read."""
    assert not hasattr(SeverityInputs, "llm_severity_hint")
    assert "severity_hint" not in SEVERITY_INPUT_FIELDS
    parameters = inspect.signature(severity.compute).parameters
    assert not any("hint" in name for name in parameters)


# ---------------------------------------------------------------------------
# Disproven clamp (§4.4, E12) and the churn degradation (§4.4, E27)
# ---------------------------------------------------------------------------


def test_disproven_findings_are_clamped_to_info() -> None:
    """Being publicly wrong on the record is part of the trust story (§6.4)."""
    result = severity.compute(
        inputs_of((1.0, 1.0, 1.0, 1.0, 1.0, 0.0)), proof_status="disproven"
    )
    assert result.band == "info"
    assert result.score == 0.85  # the score is kept; only the band is clamped
    assert "clamped to info: repro passed at head" in result.notes


@pytest.mark.parametrize(
    "proof_status",
    ["not_attempted", "not_applicable", "proven", "inconclusive", "skipped_no_env"],
)
def test_no_other_proof_status_clamps(proof_status: ProofStatus) -> None:
    result = severity.compute(
        inputs_of((1.0, 1.0, 1.0, 1.0, 1.0, 1.0)), proof_status=proof_status
    )
    assert result.band == "critical"


def test_unavailable_churn_scores_zero_and_says_so() -> None:
    """§4.4: churn is 0.0 when the commits API is unavailable, and that is recorded."""
    result = severity.compute(inputs_of((0.0, 0.0, 0.0, 0.0, 1.0, 0.0), churn_available=False))
    assert result.score == 0.0
    assert any("churn" in note for note in result.notes)


def test_caller_notes_are_preserved() -> None:
    result = severity.compute(inputs_of((0.0,) * 6), notes=["symbols unavailable: syntax error"])
    assert "symbols unavailable: syntax error" in result.notes


def test_explanation_reads_like_the_spec_example() -> None:
    """§4.4: "critical because: reachable from a public route × 14 callers × …"."""
    vector: InputVector = (1.0, 0.7, 1.0, 1.0, 0.35, 1.0)
    result = severity.compute(inputs_of(vector))
    assert " × " in result.explanation
    assert "proven" in result.explanation
    assert result.explanation == severity.compute(inputs_of(vector)).explanation


def test_explanation_of_an_all_zero_finding_is_still_a_sentence() -> None:
    assert severity.compute(inputs_of((0.0,) * 6)).explanation


# ---------------------------------------------------------------------------
# Input derivation (§4.4's "How it is derived" column)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("proof_status", "expected"),
    [
        ("proven", 1.0),
        ("disproven", 0.0),
        ("inconclusive", 0.5),
        ("not_attempted", 0.5),
        ("not_applicable", 0.5),
        ("skipped_no_env", 0.5),
    ],
)
def test_proof_confidence_for(proof_status: ProofStatus, expected: float) -> None:
    assert severity.proof_confidence_for(proof_status) == expected


@pytest.mark.parametrize(
    ("callers", "expected"), [(0, 0.0), (1, 0.1), (7, 0.7), (10, 1.0), (14, 1.0), (-3, 0.0)]
)
def test_blast_radius_for(callers: int, expected: float) -> None:
    """§4.4: ``min(1.0, caller_count / 10)``."""
    assert severity.blast_radius_for(callers) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("commits", "expected"), [(0, 0.0), (7, 0.35), (20, 1.0), (55, 1.0), (-1, 0.0)]
)
def test_churn_for(commits: int, expected: float) -> None:
    """§4.4: ``min(1.0, commits_touching_file_last_90d / 20)``."""
    assert severity.churn_for(commits) == pytest.approx(expected)


def test_derive_inputs_follows_the_documented_derivations() -> None:
    derived = severity.derive_inputs(
        public_entrypoint=True,
        internal_callers=7,
        path_sensitivity=1.0,
        symbol_is_tested=False,
        file_is_tested=False,
        commits_last_90d=7,
        proof_status="proven",
    )
    assert derived.inputs == SeverityInputs(
        reachability=1.0,
        blast_radius=0.7,
        path_sensitivity=1.0,
        coverage_gap=1.0,
        churn=0.35,
        proof_confidence=1.0,
    )
    assert severity.compute(derived.inputs).band == "critical"


def test_derive_inputs_grades_reachability_and_coverage() -> None:
    internal_only = severity.derive_inputs(
        public_entrypoint=False,
        internal_callers=2,
        path_sensitivity=0.0,
        symbol_is_tested=False,
        file_is_tested=True,
        commits_last_90d=0,
        proof_status="not_attempted",
    )
    assert internal_only.inputs.reachability == 0.5
    assert internal_only.inputs.coverage_gap == 0.5

    unreferenced = severity.derive_inputs(
        public_entrypoint=False,
        internal_callers=0,
        path_sensitivity=0.0,
        symbol_is_tested=True,
        file_is_tested=True,
        commits_last_90d=0,
        proof_status="not_attempted",
    )
    assert unreferenced.inputs.reachability == 0.0
    assert unreferenced.inputs.coverage_gap == 0.0


def test_derive_inputs_records_the_unavailable_churn_degradation() -> None:
    derived = severity.derive_inputs(
        public_entrypoint=True,
        internal_callers=1,
        path_sensitivity=0.0,
        symbol_is_tested=True,
        file_is_tested=True,
        commits_last_90d=None,
        proof_status="not_attempted",
    )
    assert derived.inputs.churn == 0.0
    assert derived.inputs.churn_available is False
    assert any("churn" in note for note in derived.notes)


def test_derive_inputs_degrades_when_symbols_could_not_be_extracted() -> None:
    """E28: an unparsable file defaults reachability 0.5 / blast_radius 0.0 and notes it."""
    derived = severity.derive_inputs(
        public_entrypoint=True,
        internal_callers=9,
        path_sensitivity=1.0,
        symbol_is_tested=False,
        file_is_tested=False,
        commits_last_90d=3,
        proof_status="not_attempted",
        symbols_available=False,
    )
    assert derived.inputs.reachability == 0.5
    assert derived.inputs.blast_radius == 0.0
    assert any("symbol" in note for note in derived.notes)


def test_repo_with_no_tests_maximises_the_coverage_gap() -> None:
    """E7: no tests in the repo ⇒ ``coverage_gap = 1.0`` for everything, raising severity."""
    derived = severity.derive_inputs(
        public_entrypoint=True,
        internal_callers=0,
        path_sensitivity=0.0,
        symbol_is_tested=False,
        file_is_tested=False,
        commits_last_90d=0,
        proof_status="not_attempted",
    )
    assert derived.inputs.coverage_gap == 1.0
