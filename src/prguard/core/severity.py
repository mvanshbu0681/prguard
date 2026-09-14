"""Severity — S5 of the pipeline. Pure functions, no I/O (spec §4.3 layering rule, §4.4).

**Ownership seam.** T2 owns the two *predicates* in this module — :func:`band_of` and
:func:`is_blocking`. T4 owns the *computation* half and appends ``compute()`` plus the input
derivation below, in wave 2. Do not move or rewrite the predicates: five tracks import them.

:func:`is_blocking` is the **sole writer of ``blocking``** in the codebase (spec §4.4). Nothing
else may set that flag — the whole product claim ("the gate is red only on proof") rests on
there being exactly one place where a merge can be blocked.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from prguard.core.types import (
    BAND_ORDER,
    BAND_RANK,
    BLOCKING_LANGUAGE,
    DEFAULT_BAND_THRESHOLDS,
    DEFAULT_SEVERITY_WEIGHTS,
    SEVERITY_INPUT_FIELDS,
    Band,
    FindingStatus,
    ProofStatus,
    SeverityInputs,
    SeverityResult,
)

#: The proof verdict that a blocking finding must carry (spec §4.4).
BLOCKING_PROOF_STATUS: ProofStatus = "proven"

#: The lifecycle status a blocking finding must be in (spec §4.4). A suppressed finding is a
#: human decision and never blocks, even when proven (E29).
BLOCKING_FINDING_STATUS: FindingStatus = "published"

#: How far apart the weights may be from 1.0 before :func:`compute` refuses to score (§4.4).
WEIGHT_SUM_TOLERANCE = 1e-9

#: Decimal places the score is rounded to before banding. Every input is quantised far coarser
#: than this (0/0.5/1, ``n/10``, ``n/20``), so rounding cannot hide a real difference — but it
#: does stop a binary-addition artefact such as ``0.15 + 0.075 == 0.22499999999999998`` from
#: moving a finding across a band boundary. Determinism is the M2 claim; this protects it.
SCORE_PRECISION = 6

#: The note §6.4 prescribes for a finding its own repro refuted (E12).
DISPROVEN_NOTE = "clamped to info: repro passed at head"

#: §4.4: the commits API being unavailable scores churn 0.0 and is recorded, not guessed.
CHURN_UNAVAILABLE_NOTE = "churn unavailable: commits API not reachable, scored 0.0"

#: E28: an unparsable head file cannot answer reachability or blast radius.
SYMBOLS_UNAVAILABLE_NOTE = (
    "symbol extraction unavailable: reachability defaulted to 0.5, blast_radius to 0.0"
)

#: §4.4 denominators for the two count-derived inputs.
BLAST_RADIUS_SATURATION = 10
CHURN_SATURATION_DAYS_90 = 20


def band_of(score: float, *, thresholds: Mapping[Band, float] | None = None) -> Band:
    """Map a severity score onto its band.

    Thresholds are inclusive lower bounds, so a score of exactly ``0.75`` is ``critical``
    (spec §4.4: ``>= 0.75`` critical, ``>= 0.55`` high, ``>= 0.35`` medium, ``>= 0.15`` low,
    else info). ``thresholds`` defaults to :data:`DEFAULT_BAND_THRESHOLDS` and is passed from
    config by callers that allow retuning — the numbers are never written at a call site.

    Scores outside ``[0, 1]`` are not an error: they clamp to the end bands.
    """
    table = DEFAULT_BAND_THRESHOLDS if thresholds is None else thresholds
    for band in reversed(BAND_ORDER):
        lower_bound = table.get(band)
        if lower_bound is not None and score >= lower_bound:
            return band
    return "info"


def is_blocking(
    *,
    proof_status: ProofStatus,
    band: Band,
    language: str,
    status: FindingStatus,
    block_min_severity: Band,
) -> bool:
    """Whether a finding may turn the merge gate red — spec §4.4, single source of truth.

    ``blocking == (proof_status == "proven") AND (band >= block_min_severity)
    AND (language == "python") AND (status == "published")``

    ``block_min_severity`` comes from config (``BLOCK_MIN_SEVERITY``, default ``high``), so
    moving the gate is a one-line config change and never a code change. The language check is
    tolerant of casing and stray whitespace; the conjunction itself is not tolerant of anything.
    """
    return (
        proof_status == BLOCKING_PROOF_STATUS
        and status == BLOCKING_FINDING_STATUS
        and language.strip().lower() == BLOCKING_LANGUAGE
        and BAND_RANK[band] >= BAND_RANK[block_min_severity]
    )


# ===========================================================================
# M2 — the computation half (T4, wave 2). Spec §4.4, AC-5.
# ===========================================================================


def compute(
    inputs: SeverityInputs,
    *,
    weights: Mapping[str, float] | None = None,
    thresholds: Mapping[Band, float] | None = None,
    proof_status: ProofStatus | None = None,
    notes: Sequence[str] = (),
) -> SeverityResult:
    """Score a finding: ``severity_score = Σ(weight_i × input_i)`` (spec §4.4).

    This is the whole of M2. There is no model in the call graph, no string from a model in the
    signature, and no branch on anything a model said — ``llm_severity_hint`` is stored by the
    coordinator and is structurally unable to arrive here. Two findings with the same measured
    inputs get the same band, today and in six months, which is the property that makes a
    severity worth arguing with.

    ``weights`` defaults to §4.4's table and must cover the six inputs and sum to 1.0;
    ``thresholds`` defaults to §4.4's bands. Both come from config in production so retuning is
    never a code change. Inputs are clamped to ``[0, 1]`` — a caller that hands over a
    ``blast_radius`` of 5.0 has a bug, and it must not be able to manufacture a ``critical``.

    ``proof_status="disproven"`` clamps the band to ``info`` (§4.4, E12). The *score* is kept as
    computed: the artifact of having been wrong stays legible instead of being rewritten.
    """
    table = DEFAULT_SEVERITY_WEIGHTS if weights is None else weights
    _validate(table)

    measured = _measured(inputs)
    score = round(
        sum(table[name] * measured[name] for name in SEVERITY_INPUT_FIELDS), SCORE_PRECISION
    )
    band = band_of(score, thresholds=thresholds)

    collected = list(notes)
    if not inputs.churn_available and CHURN_UNAVAILABLE_NOTE not in collected:
        collected.append(CHURN_UNAVAILABLE_NOTE)
    if proof_status == "disproven":
        band = "info"
        collected.append(DISPROVEN_NOTE)

    return SeverityResult(
        score=score,
        band=band,
        inputs=inputs,
        weights=dict(table),
        explanation=explain(inputs),
        notes=collected,
    )


def explain(inputs: SeverityInputs) -> str:
    """A one-line "critical because…" for the dashboard (spec §4.4, §6.4).

    Phrases are ordered by how much each input actually contributed, so the first clause is the
    reason the finding scored where it did. Inputs contributing nothing are left out rather than
    padded with "no churn" noise.
    """
    measured = _measured(inputs)
    contributing = [
        (DEFAULT_SEVERITY_WEIGHTS[name] * measured[name], index, name)
        for index, name in enumerate(SEVERITY_INPUT_FIELDS)
        if measured[name] > 0.0
    ]
    phrases = [
        _phrase(name, measured[name])
        for _, _, name in sorted(contributing, key=lambda item: (-item[0], item[1]))
    ]
    if not phrases:
        return "no severity signal above zero"
    return " × ".join(phrases)


# ---------------------------------------------------------------------------
# Input derivation — §4.4's "How it is derived" column, as pure arithmetic
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DerivedSeverity:
    """:class:`SeverityInputs` plus the degradations hit while deriving them."""

    inputs: SeverityInputs
    notes: tuple[str, ...] = ()


def proof_confidence_for(proof_status: ProofStatus) -> float:
    """§4.4: 1.0 proven · 0.0 disproven · 0.5 for every "we do not know" state."""
    if proof_status == "proven":
        return 1.0
    if proof_status == "disproven":
        return 0.0
    return 0.5


def blast_radius_for(caller_count: int) -> float:
    """§4.4: ``min(1.0, caller_count / 10)``."""
    return min(1.0, max(0, caller_count) / BLAST_RADIUS_SATURATION)


def churn_for(commits_last_90d: int) -> float:
    """§4.4: ``min(1.0, commits_touching_file_last_90d / 20)``."""
    return min(1.0, max(0, commits_last_90d) / CHURN_SATURATION_DAYS_90)


def reachability_for(*, public_entrypoint: bool, internal_callers: int) -> float:
    """§4.4: 1.0 from a public entrypoint · 0.5 from internal callers only · 0.0 unreferenced."""
    if public_entrypoint:
        return 1.0
    return 0.5 if internal_callers > 0 else 0.0


def coverage_gap_for(*, symbol_is_tested: bool, file_is_tested: bool) -> float:
    """§4.4: 1.0 no test references the file · 0.5 file but not symbol · 0.0 directly tested.

    E7 falls straight out of this: a repo with no tests scores 1.0 everywhere, which is the
    correct answer rather than a special case.
    """
    if symbol_is_tested:
        return 0.0
    return 0.5 if file_is_tested else 1.0


def derive_inputs(
    *,
    public_entrypoint: bool,
    internal_callers: int,
    path_sensitivity: float,
    symbol_is_tested: bool,
    file_is_tested: bool,
    commits_last_90d: int | None,
    proof_status: ProofStatus,
    symbols_available: bool = True,
) -> DerivedSeverity:
    """Turn the facts the pipeline gathered into the six inputs of §4.4.

    Every argument is something already measured and stored — a caller count, a commit count, a
    proof verdict — never a judgement. ``commits_last_90d=None`` is the commits API being
    unavailable (§4.4, E27): churn scores 0.0 and ``churn_available`` records why.
    ``symbols_available=False`` is E28, an unparsable head file, where reachability and blast
    radius are not knowable and default to 0.5 / 0.0 with the degradation noted.
    """
    notes: list[str] = []

    if symbols_available:
        reachability = reachability_for(
            public_entrypoint=public_entrypoint, internal_callers=internal_callers
        )
        blast_radius = blast_radius_for(internal_callers)
    else:
        reachability, blast_radius = 0.5, 0.0
        notes.append(SYMBOLS_UNAVAILABLE_NOTE)

    churn_available = commits_last_90d is not None
    if not churn_available:
        notes.append(CHURN_UNAVAILABLE_NOTE)

    return DerivedSeverity(
        inputs=SeverityInputs(
            reachability=reachability,
            blast_radius=blast_radius,
            path_sensitivity=_clamp(path_sensitivity),
            coverage_gap=coverage_gap_for(
                symbol_is_tested=symbol_is_tested, file_is_tested=file_is_tested
            ),
            churn=churn_for(commits_last_90d or 0),
            proof_confidence=proof_confidence_for(proof_status),
            churn_available=churn_available,
        ),
        notes=tuple(notes),
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _validate(weights: Mapping[str, float]) -> None:
    missing = [name for name in SEVERITY_INPUT_FIELDS if name not in weights]
    if missing:
        raise ValueError(f"severity weights are missing inputs: {', '.join(missing)}")
    total = sum(weights[name] for name in SEVERITY_INPUT_FIELDS)
    if abs(total - 1.0) > WEIGHT_SUM_TOLERANCE:
        raise ValueError(f"severity weights must sum to 1.0, got {total!r}")


def _measured(inputs: SeverityInputs) -> Mapping[str, float]:
    """The six inputs, clamped, with an unavailable churn forced to 0.0 (§4.4)."""
    values = {name: _clamp(value) for name, value in inputs.as_mapping().items()}
    if not inputs.churn_available:
        values["churn"] = 0.0
    return values


def _clamp(value: float) -> float:
    return min(1.0, max(0.0, float(value)))


def _phrase(name: str, value: float) -> str:
    """The human half of :func:`explain`, one input at a time."""
    if name == "reachability":
        return "reachable from a public entrypoint" if value >= 1.0 else "reachable internally"
    if name == "blast_radius":
        return f"blast radius {value:.2f}"
    if name == "path_sensitivity":
        return "sensitive path" if value >= 1.0 else "infrastructure path"
    if name == "coverage_gap":
        return "untested" if value >= 1.0 else "file tested, symbol not"
    if name == "churn":
        return f"churn {value:.2f}"
    return "proven" if value >= 1.0 else "unproven"
