"""The self-report — spec §6.9, AC-22.

"Reporting on the AI's own accuracy" is the differentiator, so the rules here are strict:

* **Every ratio carries its `n` and the definition it was computed from.** A bare number is
  a marketing claim; a number with its denominator is evidence.
* **Nothing is inferred that the database cannot show.** No external benchmark, no
  calibration claim (spec R4), no silently-dropped denominator.
* **A zero denominator yields `None`, never 0.0.** "We have not measured this yet" and "we
  measured it and it is zero" are different statements.

Everything is scoped to one tenant and one window of `review_runs`; findings, outcomes and
audit events are all read through the runs in that window, so the numbers describe one
coherent slice rather than four unrelated queries.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.db.base import as_utc
from prguard.db.models import (
    AuditEvent,
    AuditEventType,
    Finding,
    FindingOutcome,
    FindingStatus,
    GateConclusion,
    OutcomeKind,
    ProofStatus,
    PullRequest,
    Repository,
    ReviewRun,
    RunStatus,
)

#: Ratios are reported to three decimals — the spec's own examples (0.574, 0.167, 0.209).
RATIO_PRECISION = 3

#: The proof verdicts that mean "we executed something" (§6.9 `proof.attempted`).
ATTEMPTED_PROOF_STATUSES: tuple[str, ...] = (
    ProofStatus.PROVEN.value,
    ProofStatus.DISPROVEN.value,
    ProofStatus.INCONCLUSIVE.value,
    ProofStatus.SKIPPED_NO_ENV.value,
)

#: §6.9 verbatim. These strings ship in the response; they are the contract, not a comment.
DEFINITIONS: dict[str, str] = {
    "execution_verified_precision": (
        "proven / (proven + disproven) restricted to findings that were executed; "
        "1.0 by construction for published proven findings"
    ),
    "self_caught_false_positive_rate": (
        "disproven / attempted — findings the system itself refuted before publishing"
    ),
    "human_dismissal_rate": (
        "findings with a finding_outcomes row of 'dismissed' / published"
    ),
    "addressed_rate": (
        "findings whose fingerprint disappeared on a later run of the same PR / published"
    ),
}

#: §6.9 requires `caveats`; §11.2 assumption 16 requires the heuristic to be labelled as one.
CAVEATS: tuple[str, ...] = (
    "Not an external benchmark. Every number is computed from this deployment's own database.",
    "addressed_rate requires at least two runs on a PR; single-run PRs are excluded from n.",
    "Outcome inference is a heuristic: a published fingerprint that disappears on a later run "
    "of the same PR is counted as addressed, and an explicit suppression is counted as "
    "dismissed. Neither is a confirmation by the author.",
)


@dataclass(frozen=True)
class Metric:
    """A ratio that cannot be quoted without its denominator."""

    value: float | None
    n: int
    definition: str


@dataclass(frozen=True)
class ReportWindow:
    since: datetime | None = None
    until: datetime | None = None
    repository: str | None = None


@dataclass(frozen=True)
class RunTotals:
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    cancelled: int = 0
    median_duration_seconds: float | None = None


@dataclass(frozen=True)
class FindingTotals:
    proposed: int = 0
    published: int = 0
    suppressed: int = 0
    dropped_by_coordinator: int = 0
    per_review_published_mean: float = 0.0


@dataclass(frozen=True)
class ProofTotals:
    attempted: int = 0
    proven: int = 0
    disproven: int = 0
    inconclusive: int = 0
    skipped_no_env: int = 0
    proven_rate: float | None = None
    disproven_rate: float | None = None


@dataclass(frozen=True)
class GateTotals:
    runs_red: int = 0
    runs_green: int = 0
    runs_neutral: int = 0
    break_glass_overrides: int = 0


@dataclass(frozen=True)
class AccuracyReport:
    window: ReportWindow
    runs: RunTotals
    findings: FindingTotals
    proof: ProofTotals
    precision_proxies: dict[str, Metric]
    gate: GateTotals
    caveats: list[str] = field(default_factory=lambda: list(CAVEATS))


async def compute_report(
    session: AsyncSession,
    *,
    tenant_id: str,
    repository: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> AccuracyReport:
    """The §6.9 document for one tenant, one repository (optional) and one window."""
    run_ids = _run_ids(tenant_id=tenant_id, repository=repository, since=since, until=until)

    runs = await _run_totals(session, run_ids)
    findings = await _finding_totals(session, run_ids, run_count=runs.total)
    proof = await _proof_totals(session, run_ids)
    proxies = await _precision_proxies(session, run_ids, proof=proof, published=findings.published)
    gate = await _gate_totals(session, run_ids, tenant_id=tenant_id)

    return AccuracyReport(
        window=ReportWindow(since=since, until=until, repository=repository),
        runs=runs,
        findings=findings,
        proof=proof,
        precision_proxies=proxies,
        gate=gate,
        caveats=list(CAVEATS),
    )


def ratio(numerator: int, denominator: int) -> float | None:
    """`None` when there is nothing to divide — never a fabricated 0.0."""
    if denominator <= 0:
        return None
    return round(numerator / denominator, RATIO_PRECISION)


def _run_ids(
    *,
    tenant_id: str,
    repository: str | None,
    since: datetime | None,
    until: datetime | None,
) -> sa.Select[tuple[str]]:
    statement = sa.select(ReviewRun.id).where(ReviewRun.tenant_id == tenant_id)
    if since is not None:
        statement = statement.where(ReviewRun.created_at >= as_utc(since))
    if until is not None:
        statement = statement.where(ReviewRun.created_at <= as_utc(until))
    if repository is not None:
        owner, _, name = repository.partition("/")
        statement = statement.where(
            ReviewRun.pull_request_id.in_(
                sa.select(PullRequest.id).where(
                    PullRequest.repository_id.in_(
                        sa.select(Repository.id).where(
                            Repository.owner == owner, Repository.name == name
                        )
                    )
                )
            )
        )
    return statement


async def _run_totals(session: AsyncSession, run_ids: sa.Select[tuple[str]]) -> RunTotals:
    statuses = await _counts_by(
        session, sa.select(ReviewRun.status, sa.func.count()).where(ReviewRun.id.in_(run_ids))
    )
    timings = (
        await session.execute(
            sa.select(ReviewRun.started_at, ReviewRun.finished_at).where(
                ReviewRun.id.in_(run_ids),
                ReviewRun.started_at.is_not(None),
                ReviewRun.finished_at.is_not(None),
            )
        )
    ).all()
    durations = [
        (as_utc(finished) - as_utc(started)).total_seconds() for started, finished in timings
    ]
    return RunTotals(
        total=sum(statuses.values()),
        succeeded=statuses.get(RunStatus.SUCCEEDED.value, 0),
        failed=statuses.get(RunStatus.FAILED.value, 0),
        cancelled=statuses.get(RunStatus.CANCELLED.value, 0),
        median_duration_seconds=(
            round(statistics.median(durations), RATIO_PRECISION) if durations else None
        ),
    )


async def _finding_totals(
    session: AsyncSession, run_ids: sa.Select[tuple[str]], *, run_count: int
) -> FindingTotals:
    statuses = await _counts_by(
        session,
        sa.select(Finding.status, sa.func.count()).where(Finding.review_run_id.in_(run_ids)),
    )
    published = statuses.get(FindingStatus.PUBLISHED.value, 0)
    return FindingTotals(
        # Everything the specialists proposed, whatever became of it afterwards.
        proposed=sum(statuses.values()),
        published=published,
        suppressed=statuses.get(FindingStatus.SUPPRESSED.value, 0),
        dropped_by_coordinator=statuses.get(FindingStatus.DROPPED.value, 0),
        per_review_published_mean=(
            round(published / run_count, RATIO_PRECISION) if run_count else 0.0
        ),
    )


async def _proof_totals(session: AsyncSession, run_ids: sa.Select[tuple[str]]) -> ProofTotals:
    statuses = await _counts_by(
        session,
        sa.select(Finding.proof_status, sa.func.count()).where(
            Finding.review_run_id.in_(run_ids),
            Finding.proof_status.in_(ATTEMPTED_PROOF_STATUSES),
        ),
    )
    attempted = sum(statuses.values())
    proven = statuses.get(ProofStatus.PROVEN.value, 0)
    disproven = statuses.get(ProofStatus.DISPROVEN.value, 0)
    return ProofTotals(
        attempted=attempted,
        proven=proven,
        disproven=disproven,
        inconclusive=statuses.get(ProofStatus.INCONCLUSIVE.value, 0),
        skipped_no_env=statuses.get(ProofStatus.SKIPPED_NO_ENV.value, 0),
        proven_rate=ratio(proven, attempted),
        disproven_rate=ratio(disproven, attempted),
    )


async def _precision_proxies(
    session: AsyncSession,
    run_ids: sa.Select[tuple[str]],
    *,
    proof: ProofTotals,
    published: int,
) -> dict[str, Metric]:
    executed_and_published = await _counts_by(
        session,
        sa.select(Finding.proof_status, sa.func.count()).where(
            Finding.review_run_id.in_(run_ids),
            Finding.status == FindingStatus.PUBLISHED.value,
            Finding.proof_status.in_((ProofStatus.PROVEN.value, ProofStatus.DISPROVEN.value)),
        ),
    )
    executed = sum(executed_and_published.values())
    dismissed = await _distinct_outcome_findings(session, run_ids, OutcomeKind.DISMISSED)
    addressed = await _distinct_outcome_findings(session, run_ids, OutcomeKind.ADDRESSED)
    # The caveat says single-run PRs are excluded from `addressed_rate`'s n, so they are:
    # a fingerprint cannot be observed to disappear if there was never a second run.
    addressed_denominator = await _published_on_rerun_prs(session, run_ids)

    return {
        "execution_verified_precision": Metric(
            value=ratio(executed_and_published.get(ProofStatus.PROVEN.value, 0), executed),
            n=executed,
            definition=DEFINITIONS["execution_verified_precision"],
        ),
        "self_caught_false_positive_rate": Metric(
            value=ratio(proof.disproven, proof.attempted),
            n=proof.attempted,
            definition=DEFINITIONS["self_caught_false_positive_rate"],
        ),
        "human_dismissal_rate": Metric(
            value=ratio(dismissed, published),
            n=published,
            definition=DEFINITIONS["human_dismissal_rate"],
        ),
        "addressed_rate": Metric(
            value=ratio(addressed, addressed_denominator),
            n=addressed_denominator,
            definition=DEFINITIONS["addressed_rate"],
        ),
    }


async def _gate_totals(
    session: AsyncSession, run_ids: sa.Select[tuple[str]], *, tenant_id: str
) -> GateTotals:
    conclusions = await _counts_by(
        session,
        sa.select(ReviewRun.gate_conclusion, sa.func.count()).where(
            ReviewRun.id.in_(run_ids), ReviewRun.gate_conclusion.is_not(None)
        ),
    )
    overrides = await session.scalar(
        sa.select(sa.func.count())
        .select_from(AuditEvent)
        .where(
            AuditEvent.tenant_id == tenant_id,
            AuditEvent.event_type == AuditEventType.OVERRIDE_BREAK_GLASS.value,
            AuditEvent.review_run_id.in_(run_ids),
        )
    )
    return GateTotals(
        runs_red=conclusions.get(GateConclusion.FAILURE.value, 0),
        runs_green=conclusions.get(GateConclusion.SUCCESS.value, 0),
        runs_neutral=conclusions.get(GateConclusion.NEUTRAL.value, 0),
        break_glass_overrides=int(overrides or 0),
    )


async def _distinct_outcome_findings(
    session: AsyncSession, run_ids: sa.Select[tuple[str]], outcome: OutcomeKind
) -> int:
    """Findings, not outcome rows: two `addressed` rows for one finding are one finding."""
    total = await session.scalar(
        sa.select(sa.func.count(sa.distinct(FindingOutcome.finding_id))).where(
            FindingOutcome.outcome == outcome.value,
            FindingOutcome.finding_id.in_(
                sa.select(Finding.id).where(Finding.review_run_id.in_(run_ids))
            ),
        )
    )
    return int(total or 0)


async def _published_on_rerun_prs(
    session: AsyncSession, run_ids: sa.Select[tuple[str]]
) -> int:
    """Published findings on PRs that were run more than once inside the window."""
    rerun_pr_ids = (
        sa.select(ReviewRun.pull_request_id)
        .where(ReviewRun.id.in_(run_ids))
        .group_by(ReviewRun.pull_request_id)
        .having(sa.func.count() > 1)
    )
    total = await session.scalar(
        sa.select(sa.func.count())
        .select_from(Finding)
        .where(
            Finding.status == FindingStatus.PUBLISHED.value,
            Finding.review_run_id.in_(
                sa.select(ReviewRun.id).where(
                    ReviewRun.id.in_(run_ids),
                    ReviewRun.pull_request_id.in_(rerun_pr_ids),
                )
            ),
        )
    )
    return int(total or 0)


async def _counts_by(
    session: AsyncSession, statement: sa.Select[tuple[Any, int]]
) -> dict[str, int]:
    """`SELECT <column>, count(*) … GROUP BY <column>` as a plain mapping, nulls dropped."""
    grouped = statement.group_by(list(statement.selected_columns)[0])
    return {
        str(name): int(total) for name, total in (await session.execute(grouped)).all() if name
    }
