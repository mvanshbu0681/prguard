"""Severity — S5 of the pipeline. Pure functions, no I/O (spec §4.3 layering rule, §4.4).

**Ownership seam.** T2 owns the two *predicates* in this module — :func:`band_of` and
:func:`is_blocking`. T4 owns the *computation* half and appends ``compute()`` plus the input
derivation below, in wave 2. Do not move or rewrite the predicates: five tracks import them.

:func:`is_blocking` is the **sole writer of ``blocking``** in the codebase (spec §4.4). Nothing
else may set that flag — the whole product claim ("the gate is red only on proof") rests on
there being exactly one place where a merge can be blocked.
"""

from __future__ import annotations

from collections.abc import Mapping

from prguard.core.types import (
    BAND_ORDER,
    BAND_RANK,
    BLOCKING_LANGUAGE,
    DEFAULT_BAND_THRESHOLDS,
    Band,
    FindingStatus,
    ProofStatus,
)

#: The proof verdict that a blocking finding must carry (spec §4.4).
BLOCKING_PROOF_STATUS: ProofStatus = "proven"

#: The lifecycle status a blocking finding must be in (spec §4.4). A suppressed finding is a
#: human decision and never blocks, even when proven (E29).
BLOCKING_FINDING_STATUS: FindingStatus = "published"


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
