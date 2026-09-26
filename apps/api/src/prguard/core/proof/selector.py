"""Which findings are worth proving — spec §4.6 "Selection".

Three proofs per run (``PROOF_MAX_PER_RUN``), each costing one LLM call and two sandbox
executions, is the whole budget. Spending it well is what keeps the demo from feeling dead
(R2), so the rule is the spec's, verbatim: Python, a category a test can actually settle, not
suppressed, and a severity score at or above ``PROOF_MIN_SCORE``; then the top N by score.

Everything here is pure and total. A finding that is *not* selected gets a reason rather than
silence, because ``/v1/reviews/{id}/result`` has to be able to say why a finding carries no
proof — "we did not try" and "we tried and could not" are very different claims to make about a
finding, and conflating them is how an advisory looks like an exoneration.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Final, Literal

from prguard.core.types import BLOCKING_LANGUAGE, CanonicalFinding, Category, FindingStatus

#: §4.6: the categories a generated test can settle. A maintainability nit has no repro.
PROVABLE_CATEGORIES: Final[frozenset[Category]] = frozenset(
    {"correctness", "security", "test_integrity"}
)

#: Lifecycle states that are out of the running before proof even starts.
UNPROVABLE_STATUSES: Final[frozenset[FindingStatus]] = frozenset(
    {"suppressed", "dropped", "disproven"}
)

#: Why a finding was or was not handed to the prover. Persisted alongside the finding.
SelectionReason = Literal[
    "selected",
    "not_python",
    "category_not_provable",
    "suppressed",
    "not_scored",
    "below_min_score",
    "budget_exhausted",
]


@dataclass(frozen=True)
class Candidate:
    """One finding's selection decision, with the score the decision was made on."""

    finding: CanonicalFinding
    score: float
    reason: SelectionReason

    @property
    def selected(self) -> bool:
        return self.reason == "selected"


def rejection_reason(finding: CanonicalFinding, *, min_score: float) -> SelectionReason | None:
    """The first rule ``finding`` fails, or ``None`` if it passes them all.

    Order is deliberate and is the order the spec states the rules in, so the reason a reader
    sees is the most fundamental one: a suppressed JavaScript nit reports ``not_python``,
    because that is true whatever anyone later decides about the suppression.
    """
    if finding.language.strip().lower() != BLOCKING_LANGUAGE:
        return "not_python"
    if finding.category not in PROVABLE_CATEGORIES:
        return "category_not_provable"
    if finding.status in UNPROVABLE_STATUSES or finding.suppression_id is not None:
        return "suppressed"
    if finding.severity is None:
        return "not_scored"
    if finding.severity.score < min_score:
        return "below_min_score"
    return None


def is_provable(finding: CanonicalFinding, *, min_score: float) -> bool:
    """Whether ``finding`` clears every §4.6 selection rule, budget aside."""
    return rejection_reason(finding, min_score=min_score) is None


def explain_selection(
    findings: Iterable[CanonicalFinding], *, min_score: float, max_per_run: int
) -> tuple[Candidate, ...]:
    """Decide for every finding, in input order, and say why.

    The budget is applied after the rules so that "fourth-highest" is reported as
    ``budget_exhausted`` rather than as an unprovable finding — it is the one rejection that a
    config change would reverse.
    """
    ordered = list(findings)
    eligible = [finding for finding in ordered if is_provable(finding, min_score=min_score)]
    within_budget = {finding.id for finding in _top_by_score(eligible, max_per_run)}

    candidates: list[Candidate] = []
    for finding in ordered:
        rejected = rejection_reason(finding, min_score=min_score)
        if rejected is not None:
            reason: SelectionReason = rejected
        elif finding.id in within_budget:
            reason = "selected"
        else:
            reason = "budget_exhausted"
        candidates.append(Candidate(finding=finding, score=_score(finding), reason=reason))
    return tuple(candidates)


def select_candidates(
    findings: Iterable[CanonicalFinding], *, min_score: float, max_per_run: int
) -> tuple[CanonicalFinding, ...]:
    """The findings to prove, highest score first — spec §4.6, and nothing else."""
    return tuple(
        candidate.finding
        for candidate in sorted(
            (item for item in explain_selection(
                findings, min_score=min_score, max_per_run=max_per_run
            ) if item.selected),
            key=_ranking,
        )
    )


def _top_by_score(findings: Sequence[CanonicalFinding], max_per_run: int) -> list[CanonicalFinding]:
    if max_per_run <= 0:
        return []
    return sorted(findings, key=lambda finding: (-_score(finding), finding.id))[:max_per_run]


def _ranking(candidate: Candidate) -> tuple[float, str]:
    """Score descending, then id ascending. Ties must not depend on input order (E4)."""
    return (-candidate.score, candidate.finding.id)


def _score(finding: CanonicalFinding) -> float:
    return finding.severity.score if finding.severity is not None else 0.0
