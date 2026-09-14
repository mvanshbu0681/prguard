"""The merge gate — spec §4.7.

**Ownership seam.** T2 owns :func:`conclude`, the pure decision. T6 owns the *delivery ladder*
(check run → commit status → dry_run) and appends it to this module in wave 2. The two halves
are deliberately separate: what the gate concludes is a governance rule, how it is published is
an integration detail that degrades.
"""

from __future__ import annotations

from collections.abc import Sequence

from prguard.core.types import GateConclusion


def conclude(
    *,
    blocking_finding_ids: Sequence[str],
    degraded: bool,
    all_proofs_skipped_for_env: bool,
) -> GateConclusion:
    """The gate conclusion for a run — spec §4.7, AC-15.

    Precedence is strict: ``failure`` beats ``neutral`` beats ``success``.

    * ``failure`` iff at least one finding blocks (``severity.is_blocking`` decided that, and
      nothing else may). A red gate always wins over a degradation — a proven bug does not stop
      mattering because the sandbox was unhappy.
    * ``neutral`` when the run degraded, or when no proof could run for environment reasons
      (E14: no Docker and ``PROOF_ALLOW_SUBPROCESS=false``). Neutral is the honest answer to
      "we could not check", and it is not a merge block.
    * ``success`` otherwise — including a run with critical-but-unproven findings.
    """
    if len(blocking_finding_ids) > 0:
        return "failure"
    if degraded or all_proofs_skipped_for_env:
        return "neutral"
    return "success"
