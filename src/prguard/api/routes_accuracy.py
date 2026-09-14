"""GET /v1/accuracy (spec §6.9).

A thin mapping over `core.accuracy`: the arithmetic lives in core (which never imports
`api`), and this module only turns it into the §6.9 document.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from prguard.api.deps import SessionDep, TenantScopeDep
from prguard.api.schemas import (
    AccuracyFindings,
    AccuracyGate,
    AccuracyMetric,
    AccuracyPrecisionProxies,
    AccuracyProof,
    AccuracyReport,
    AccuracyRuns,
    AccuracyWindow,
)
from prguard.core import accuracy

router = APIRouter(prefix="/v1", tags=["accuracy"])


@router.get("/accuracy", response_model=AccuracyReport, summary="The self-report (§6.9)")
async def get_accuracy_report(
    session: SessionDep,
    scope: TenantScopeDep,
    repository: Annotated[str | None, Query(description="`owner/name`")] = None,
    since: Annotated[datetime | None, Query()] = None,
    until: Annotated[datetime | None, Query()] = None,
) -> AccuracyReport:
    report = await accuracy.compute_report(
        session,
        tenant_id=scope.tenant_id,
        repository=repository,
        since=since,
        until=until,
    )
    proxies = report.precision_proxies
    return AccuracyReport(
        window=AccuracyWindow(
            since=report.window.since,
            until=report.window.until,
            repository=report.window.repository,
        ),
        runs=AccuracyRuns(
            total=report.runs.total,
            succeeded=report.runs.succeeded,
            failed=report.runs.failed,
            cancelled=report.runs.cancelled,
            median_duration_seconds=report.runs.median_duration_seconds,
        ),
        findings=AccuracyFindings(
            proposed=report.findings.proposed,
            published=report.findings.published,
            suppressed=report.findings.suppressed,
            dropped_by_coordinator=report.findings.dropped_by_coordinator,
            per_review_published_mean=report.findings.per_review_published_mean,
        ),
        proof=AccuracyProof(
            attempted=report.proof.attempted,
            proven=report.proof.proven,
            disproven=report.proof.disproven,
            inconclusive=report.proof.inconclusive,
            skipped_no_env=report.proof.skipped_no_env,
            proven_rate=report.proof.proven_rate,
            disproven_rate=report.proof.disproven_rate,
        ),
        precision_proxies=AccuracyPrecisionProxies(
            execution_verified_precision=_metric(proxies["execution_verified_precision"]),
            self_caught_false_positive_rate=_metric(proxies["self_caught_false_positive_rate"]),
            human_dismissal_rate=_metric(proxies["human_dismissal_rate"]),
            addressed_rate=_metric(proxies["addressed_rate"]),
        ),
        gate=AccuracyGate(
            runs_red=report.gate.runs_red,
            runs_green=report.gate.runs_green,
            runs_neutral=report.gate.runs_neutral,
            break_glass_overrides=report.gate.break_glass_overrides,
        ),
        caveats=report.caveats,
    )


def _metric(metric: accuracy.Metric) -> AccuracyMetric:
    return AccuracyMetric(value=metric.value, n=metric.n, definition=metric.definition)
