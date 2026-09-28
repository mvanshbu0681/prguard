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
    # §6.9 writes both denominators as "published". Taken literally that is not the
    # population the numerator is drawn from, and the published number stops being a rate:
    # suppressing a published finding moves it *off* `published`, so a dismissal adds to
    # the numerator and takes away from the denominator (4 published, 3 suppressed → 3.0),
    # and an `addressed` finding on a PR whose second run falls outside the window is
    # counted while its PR is excluded (→ 2.0). The strings below say which population each
    # ratio actually divides by, because a definition that does not match the arithmetic is
    # worse than no definition.
    "human_dismissal_rate": (
        "findings with a finding_outcomes row of 'dismissed' / findings that were ever "
        "published (published now, plus those a human dismissed off that set)"
    ),
    "addressed_rate": (
        "findings whose fingerprint disappeared on a later run of the same PR / published "
        "findings on PRs run more than once inside the window"
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
    proxies = await _precision_proxies(session, run_ids, proof=proof)
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

    # Each ratio below takes its numerator and its denominator from *one* population, so a
    # subset is being divided by its superset and the result cannot exceed 1.0.
    ever_published = _ever_published(run_ids)
    dismissed = await _outcome_findings(session, ever_published, OutcomeKind.DISMISSED)
    dismissal_denominator = await _count_of(session, ever_published)

    # The caveat says single-run PRs are excluded from `addressed_rate`'s n, so they are:
    # a fingerprint cannot be observed to disappear if there was never a second run.
    addressable = _published_on_rerun_prs(run_ids)
    addressed = await _outcome_findings(session, addressable, OutcomeKind.ADDRESSED)
    addressed_denominator = await _count_of(session, addressable)

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
            value=ratio(dismissed, dismissal_denominator),
            n=dismissal_denominator,
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


async def _outcome_findings(
    session: AsyncSession, finding_ids: sa.Select[tuple[str]], outcome: OutcomeKind
) -> int:
    """Findings, not outcome rows: two `addressed` rows for one finding are one finding.

    `finding_ids` is the metric's population, so the count returned is always a subset of
    :func:`_count_of` over the same select.
    """
    total = await session.scalar(
        sa.select(sa.func.count(sa.distinct(FindingOutcome.finding_id))).where(
            FindingOutcome.outcome == outcome.value,
            FindingOutcome.finding_id.in_(finding_ids),
        )
    )
    return int(total or 0)


def _ever_published(run_ids: sa.Select[tuple[str]]) -> sa.Select[tuple[str]]:
    """`human_dismissal_rate`'s population: findings that were ever published.

    Suppressing a finding moves it off `published` (§6.6), so the rows still *in* that
    status are the ones nobody dismissed — dividing by them would shrink the denominator by
    exactly the findings the numerator counts.
    """
    return sa.select(Finding.id).where(
        Finding.review_run_id.in_(run_ids),
        sa.or_(
            Finding.status == FindingStatus.PUBLISHED.value,
            Finding.id.in_(
                sa.select(FindingOutcome.finding_id).where(
                    FindingOutcome.outcome == OutcomeKind.DISMISSED.value
                )
            ),
        ),
    )


def _published_on_rerun_prs(run_ids: sa.Select[tuple[str]]) -> sa.Select[tuple[str]]:
    """`addressed_rate`'s population: published findings on PRs run more than once here.

    A fingerprint cannot be observed to disappear without a second run inside the window,
    and a finding that was never published cannot have been addressed — so both halves of
    the ratio come from this one select, not from two different readings of "published".
    """
    rerun_pr_ids = (
        sa.select(ReviewRun.pull_request_id)
        .where(ReviewRun.id.in_(run_ids))
        .group_by(ReviewRun.pull_request_id)
        .having(sa.func.count() > 1)
    )
    return sa.select(Finding.id).where(
        Finding.status == FindingStatus.PUBLISHED.value,
        Finding.review_run_id.in_(
            sa.select(ReviewRun.id).where(
                ReviewRun.id.in_(run_ids),
                ReviewRun.pull_request_id.in_(rerun_pr_ids),
            )
        ),
    )


async def _count_of(session: AsyncSession, finding_ids: sa.Select[tuple[str]]) -> int:
    total = await session.scalar(
        sa.select(sa.func.count()).select_from(finding_ids.subquery())
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
