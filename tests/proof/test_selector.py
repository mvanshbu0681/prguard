"""Which findings are worth proving — spec §4.6 "Selection", §11.2 assumption 7.

The budget is three proofs per run and each one costs an LLM call plus two sandbox executions,
so selection is not a nicety: it is what stops the demo from taking four minutes (R2). It is
also a correctness surface, because a suppressed finding must never be handed to the prover —
a suppression is a human decision and E29 says it outranks everything downstream.
"""

from __future__ import annotations

import pytest

from prguard.core.proof.selector import (
    PROVABLE_CATEGORIES,
    explain_selection,
    is_provable,
    rejection_reason,
    select_candidates,
)
from prguard.core.types import Category
from tests.proof.conftest import make_finding, make_severity

ALL_CATEGORIES: tuple[Category, ...] = (
    "correctness",
    "security",
    "test_integrity",
    "performance",
    "maintainability",
)


def test_provable_categories_are_the_three_the_spec_names() -> None:
    """§4.6: `correctness`, `security`, `test_integrity`. A style nit is not provable by a test."""
    assert PROVABLE_CATEGORIES == frozenset({"correctness", "security", "test_integrity"})


@pytest.mark.parametrize("category", ALL_CATEGORIES)
def test_only_provable_categories_are_selected(category: Category) -> None:
    finding = make_finding(id=f"f-{category}", category=category)
    assert is_provable(finding, min_score=0.35) is (category in PROVABLE_CATEGORIES)


@pytest.mark.parametrize("language", ["javascript", "go", "Python ", "python"])
def test_only_python_is_selected(language: str) -> None:
    """Q9: proof execution is Python-only. Other languages are reported, never proven."""
    finding = make_finding(language=language)
    assert is_provable(finding, min_score=0.35) is (language.strip().lower() == "python")


def test_a_suppressed_finding_is_never_proven() -> None:
    """E29: a suppression is a human decision, and we do not spend a sandbox arguing with it."""
    assert not is_provable(make_finding(status="suppressed"), min_score=0.35)
    assert not is_provable(make_finding(suppression_id="s-1"), min_score=0.35)


@pytest.mark.parametrize("status", ["dropped", "disproven"])
def test_findings_already_out_of_the_running_are_not_reproven(status: str) -> None:
    assert not is_provable(make_finding(status=status), min_score=0.35)


@pytest.mark.parametrize(
    ("score", "expected"),
    [(0.34999, False), (0.35, True), (0.36, True), (0.0, False), (1.0, True)],
)
def test_min_score_is_an_inclusive_floor(score: float, expected: bool) -> None:
    """``PROOF_MIN_SCORE`` (default 0.35) is a `>=` threshold, exact at the boundary."""
    finding = make_finding(severity=make_severity(score=score))
    assert is_provable(finding, min_score=0.35) is expected


def test_a_finding_with_no_severity_yet_is_not_selectable() -> None:
    """S5 runs before S7. A finding that reached the prover unscored is a pipeline bug, not a
    candidate, and guessing a score for it would put the budget somewhere arbitrary."""
    assert not is_provable(make_finding(severity=None), min_score=0.35)


def test_top_n_by_score_within_the_budget() -> None:
    """``PROOF_MAX_PER_RUN`` (default 3) — the highest-scoring three, not the first three."""
    findings = [
        make_finding(id="f-low", severity=make_severity(score=0.40)),
        make_finding(id="f-top", severity=make_severity(score=0.95)),
        make_finding(id="f-mid", severity=make_severity(score=0.70)),
        make_finding(id="f-high", severity=make_severity(score=0.80)),
    ]
    selected = select_candidates(findings, min_score=0.35, max_per_run=3)
    assert [finding.id for finding in selected] == ["f-top", "f-high", "f-mid"]


def test_ties_break_on_id_so_two_runs_choose_the_same_three() -> None:
    """A budget that depended on dict ordering would make re-review non-deterministic (E4)."""
    findings = [
        make_finding(id="f-c", severity=make_severity(score=0.60)),
        make_finding(id="f-a", severity=make_severity(score=0.60)),
        make_finding(id="f-b", severity=make_severity(score=0.60)),
    ]
    first = select_candidates(findings, min_score=0.35, max_per_run=2)
    second = select_candidates(list(reversed(findings)), min_score=0.35, max_per_run=2)
    assert [finding.id for finding in first] == ["f-a", "f-b"]
    assert [finding.id for finding in second] == [finding.id for finding in first]


def test_budget_of_zero_selects_nothing() -> None:
    findings = [make_finding(id="f-1"), make_finding(id="f-2")]
    assert select_candidates(findings, min_score=0.35, max_per_run=0) == ()


def test_selection_is_explained_finding_by_finding() -> None:
    """`/result` has to be able to say why a finding carries no proof, not just that it does."""
    findings = [
        make_finding(id="f-ok"),
        make_finding(id="f-js", language="javascript"),
        make_finding(id="f-nit", category="maintainability"),
        make_finding(id="f-supp", status="suppressed"),
        make_finding(id="f-cheap", severity=make_severity(score=0.10)),
        make_finding(id="f-unscored", severity=None),
    ]
    explained = explain_selection(findings, min_score=0.35, max_per_run=3)
    reasons = {candidate.finding.id: candidate.reason for candidate in explained}
    assert reasons == {
        "f-ok": "selected",
        "f-js": "not_python",
        "f-nit": "category_not_provable",
        "f-supp": "suppressed",
        "f-cheap": "below_min_score",
        "f-unscored": "not_scored",
    }


def test_findings_beyond_the_budget_are_explained_as_such() -> None:
    """Being fourth is a different fact from being unprovable, and the API says which."""
    findings = [
        make_finding(id=f"f-{index}", severity=make_severity(score=0.9 - index / 100))
        for index in range(5)
    ]
    explained = explain_selection(findings, min_score=0.35, max_per_run=3)
    reasons = [candidate.reason for candidate in explained]
    assert reasons == ["selected", "selected", "selected", "budget_exhausted", "budget_exhausted"]


def test_explanation_covers_every_finding_exactly_once() -> None:
    """The comment ladder's conservation habit: nothing selected silently, nothing lost."""
    findings = [make_finding(id=f"f-{index}") for index in range(7)]
    explained = explain_selection(findings, min_score=0.35, max_per_run=3)
    assert [candidate.finding.id for candidate in explained] == [f"f-{index}" for index in range(7)]


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({}, None),
        ({"language": "go"}, "not_python"),
        ({"category": "performance"}, "category_not_provable"),
        ({"status": "suppressed"}, "suppressed"),
        ({"severity": None}, "not_scored"),
    ],
)
def test_rejection_reason_names_the_first_failing_rule(
    overrides: dict[str, object], expected: str | None
) -> None:
    assert rejection_reason(make_finding(**overrides), min_score=0.35) == expected
