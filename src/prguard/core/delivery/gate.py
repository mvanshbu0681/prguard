"""The merge gate — spec §4.7.

**Ownership seam.** T2 owns :func:`conclude`, the pure decision. T6 owns the *delivery ladder*
(check run → commit status → dry_run) and appends it to this module in wave 2. The two halves
are deliberately separate: what the gate concludes is a governance rule, how it is published is
an integration detail that degrades.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any, Final

from prguard.core.delivery.github_client import GitHubClient, GitHubError
from prguard.core.severity import is_blocking
from prguard.core.types import (
    DEFAULT_BLOCK_MIN_SEVERITY,
    Band,
    CanonicalFinding,
    GateConclusion,
    GateDelivery,
)

#: Spec §4.8 ``GATE_CONTEXT_NAME`` / §11.2.2. The name a human sees on the PR's checks list.
GATE_CONTEXT: Final[str] = "prguard/merge-gate"

#: Spec §4.7 gate ladder, in order. Rung 1 needs a GitHub App token (E18); rung 2 is what a PAT
#: can actually set; rung 3 makes no HTTP call at all and lives only in ``/result``.
GATE_LADDER: Final[tuple[GateDelivery, ...]] = ("check_run", "commit_status", "dry_run")

#: GitHub commit statuses have no ``neutral``. Mapping it to ``pending`` would block a merge on
#: a check we explicitly could not run, which contradicts §4.7 ("neutral … is not a merge
#: block"), so it maps to ``success`` and the *description* carries the honesty.
_COMMIT_STATE: Final[dict[GateConclusion, str]] = {
    "failure": "failure",
    "success": "success",
    "neutral": "success",
}

_REASON_NO_FINDINGS: Final[str] = (
    "No finding met the bar to block: proven, at or above the configured severity, "
    "Python, and published."
)
_REASON_DEGRADED: Final[str] = (
    "The run degraded before every check completed, so no merge verdict is claimed."
)
_REASON_NO_SANDBOX: Final[str] = (
    "No sandbox was available to run a repro, so nothing could be proven and "
    "no merge verdict is claimed."
)


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


# ---------------------------------------------------------------------------
# T6 — the decision object and the delivery ladder (spec §4.7, §7 E4/E18, AC-15, AC-24)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GateDecision:
    """The gate as ``/result.gate`` reports it (§6.3) — the verdict *and* how it was published.

    Two fields are deliberately separate. ``conclusion`` is a governance statement and is
    computed from the findings alone. ``delivery`` is an integration detail that degrades: which
    rung of the ladder actually reached GitHub, or ``dry_run`` when none did. A verdict nobody
    could publish is still the verdict (E17/X4 — the demo can be driven from ``/result``).
    """

    conclusion: GateConclusion
    reason: str
    blocking_finding_ids: tuple[str, ...] = ()
    context_name: str = GATE_CONTEXT
    delivery: GateDelivery = "dry_run"
    delivered: bool = False
    degraded: bool = False
    detail: str = ""

    @property
    def is_red(self) -> bool:
        return self.conclusion == "failure"


def blocking_finding_ids(
    findings: Sequence[CanonicalFinding],
    *,
    block_min_severity: Band = DEFAULT_BLOCK_MIN_SEVERITY,
) -> tuple[str, ...]:
    """The findings that may turn the gate red — spec §4.4, AC-15.

    Re-derived here through :func:`prguard.core.severity.is_blocking` rather than read off
    ``finding.blocking``. That is not distrust of the pipeline: it means the gate's redness is a
    function of four recorded facts (proof status, band, language, lifecycle status) and of
    nothing a later stage could set by accident. A finding with no severity has no band and
    therefore cannot clear the threshold.
    """
    return tuple(
        finding.id
        for finding in findings
        if finding.severity is not None
        and is_blocking(
            proof_status=finding.proof_status,
            band=finding.severity.band,
            language=finding.language,
            status=finding.status,
            block_min_severity=block_min_severity,
        )
    )


def decide(
    findings: Sequence[CanonicalFinding],
    *,
    degraded: bool = False,
    all_proofs_skipped_for_env: bool = False,
    block_min_severity: Band = DEFAULT_BLOCK_MIN_SEVERITY,
    context_name: str = GATE_CONTEXT,
) -> GateDecision:
    """The whole gate verdict for a run, with the sentence a human will read on the PR.

    Wraps T2's :func:`conclude` — the precedence rule lives there and is not re-implemented.
    """
    blocking = blocking_finding_ids(findings, block_min_severity=block_min_severity)
    conclusion = conclude(
        blocking_finding_ids=blocking,
        degraded=degraded,
        all_proofs_skipped_for_env=all_proofs_skipped_for_env,
    )
    return GateDecision(
        conclusion=conclusion,
        reason=_reason(conclusion, blocking, degraded=degraded),
        blocking_finding_ids=blocking,
        context_name=context_name,
        degraded=degraded,
    )


async def deliver_gate(
    *,
    client: GitHubClient | None,
    owner: str,
    repo: str,
    head_sha: str,
    decision: GateDecision,
    result_url: str | None = None,
    allow_check_run: bool = True,
    dry_run: bool = False,
) -> GateDecision:
    """Publish the verdict down the §4.7 ladder: check run → commit status → dry_run.

    Falling off rung 1 is **expected** tonight and is not a degradation: the Check Runs API only
    accepts a GitHub App installation token, and tonight's credential is a PAT (E18). Falling
    off rung 2 as well is survivable too — the decision is persisted and served from
    ``/result`` — so this function never raises and never changes the verdict it was given.

    E4: there is deliberately no "nothing changed, skip it" branch. A gate that is not re-set on
    every run goes stale, and a stale red gate is worse than no gate.
    """
    if client is None or dry_run:
        return replace(
            decision,
            delivery="dry_run",
            delivered=False,
            detail="delivery mode is dry_run" if client else "no GitHub client configured",
        )

    failures: list[str] = []

    if allow_check_run:
        try:
            await client.create_check_run(
                owner, repo, _check_run_payload(decision, head_sha, result_url)
            )
        except GitHubError as error:
            failures.append(f"check_run: {error.github_message}")
        else:
            return replace(decision, delivery="check_run", delivered=True)

    try:
        await client.create_commit_status(
            owner, repo, head_sha, _commit_status_payload(decision, result_url)
        )
    except GitHubError as error:
        failures.append(f"commit_status: {error.github_message}")
    else:
        return replace(decision, delivery="commit_status", delivered=True)

    # Rung 3. Nothing was published, but the verdict is intact and `/result` still serves it.
    return replace(decision, delivery="dry_run", delivered=False, detail="; ".join(failures))


def _check_run_payload(
    decision: GateDecision, head_sha: str, result_url: str | None
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": decision.context_name,
        "head_sha": head_sha,
        "status": "completed",
        "conclusion": decision.conclusion,
        "output": {"title": _title(decision), "summary": decision.reason},
    }
    if result_url:
        payload["details_url"] = result_url
    return payload


def _commit_status_payload(decision: GateDecision, result_url: str | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "state": _COMMIT_STATE[decision.conclusion],
        "context": decision.context_name,
        "description": _truncate(decision.reason),
    }
    if result_url:
        payload["target_url"] = result_url
    return payload


def _reason(conclusion: GateConclusion, blocking: Sequence[str], *, degraded: bool) -> str:
    if conclusion == "failure":
        count = len(blocking)
        verb = "carries" if count == 1 else "carry"
        noun = "finding" if count == 1 else "findings"
        return f"{count} {noun} {verb} a repro that passes at base and fails at head."
    if conclusion == "neutral":
        return _REASON_DEGRADED if degraded else _REASON_NO_SANDBOX
    return _REASON_NO_FINDINGS


def _title(decision: GateDecision) -> str:
    if decision.conclusion == "failure":
        return "Blocked: a proven failure is in this diff"
    if decision.conclusion == "neutral":
        return "Not checked"
    return "No proven failures"


def _truncate(text: str, limit: int = 140) -> str:
    """GitHub truncates a commit-status description at 140 characters; do it ourselves."""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


__all__ = [
    "GATE_CONTEXT",
    "GATE_LADDER",
    "GateDecision",
    "blocking_finding_ids",
    "conclude",
    "decide",
    "deliver_gate",
]
