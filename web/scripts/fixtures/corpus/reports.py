"""The self-report, the series behind it, the cost summary and the simulated live run.

``accuracy/report.json`` is computed twice and the two must agree to the byte:

1. ``raw_counts`` — the eleven populations ``core/accuracy.py`` queries for, counted here over
   the corpus rows with the same predicates (``ATTEMPTED_PROOF_STATUSES``, "ever published",
   "published on PRs run more than once"), then turned into the §6.9 document with the
   backend's own ``accuracy.ratio`` / ``RATIO_PRECISION`` / ``DEFINITIONS`` / ``CAVEATS``.
2. ``accuracy.compute_report`` itself, run by the backend against an in-memory SQLite database
   holding a copy of every run, finding, outcome and audit row.

The corpus *is* the tenant's whole history (the audit chain starts at seq 1), so the report is
computed over all of it: ``GET /v1/accuracy`` with no window.
"""

from __future__ import annotations

import asyncio
import statistics
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

from corpus.backend import (
    NOW,
    TENANT_ID,
    TENANT_SLUG,
    Base,
    accuracy,
    models,
    routes_reviews,
    schemas,
)
from corpus.emit import roundtrip
from corpus.simulate import STAGES, World

ATTEMPTED = accuracy.ATTEMPTED_PROOF_STATUSES
BANDS_DESC = ("critical", "high", "medium", "low", "info")
CATEGORIES = ("correctness", "security", "test_integrity", "performance", "maintainability")


# =======================================================================================
# Accuracy
# =======================================================================================


def _rows(world: World) -> list[tuple[Any, models.Finding]]:
    return [(run, item.row) for run in world.runs for item in run.findings]


def raw_counts(world: World, events: list[models.AuditEvent]) -> dict[str, Any]:
    runs = world.runs
    rows = _rows(world)
    statuses = Counter(run.row.status for run in runs)
    durations = [
        (run.row.finished_at - run.row.started_at).total_seconds()
        for run in runs
        if run.row.started_at is not None and run.row.finished_at is not None
    ]
    finding_status = Counter(row.status for _, row in rows)
    proof = Counter(row.proof_status for _, row in rows if row.proof_status in ATTEMPTED)
    executed = Counter(
        row.proof_status
        for _, row in rows
        if row.status == "published" and row.proof_status in ("proven", "disproven")
    )
    dismissed_ids = {o.finding_id for o in world.outcomes if o.outcome == "dismissed"}
    addressed_ids = {o.finding_id for o in world.outcomes if o.outcome == "addressed"}
    ever_published = [row for _, row in rows if row.status == "published" or row.id in dismissed_ids]
    runs_per_pr = Counter(run.row.pull_request_id for run in runs)
    rerun_prs = {pr for pr, count in runs_per_pr.items() if count > 1}
    addressable = [
        row
        for run, row in rows
        if row.status == "published" and run.row.pull_request_id in rerun_prs
    ]
    run_ids = {run.row.id for run in runs}
    conclusions = Counter(run.row.gate_conclusion for run in runs if run.row.gate_conclusion)
    overrides = sum(
        1
        for event in events
        if event.event_type == models.AuditEventType.OVERRIDE_BREAK_GLASS.value
        and event.review_run_id in run_ids
    )
    return {
        "runs": {
            "total": sum(statuses.values()),
            "succeeded": statuses.get("succeeded", 0),
            "failed": statuses.get("failed", 0),
            "cancelled": statuses.get("cancelled", 0),
            "timed": len(durations),
            "median_duration_seconds": (
                round(statistics.median(durations), accuracy.RATIO_PRECISION) if durations else None
            ),
        },
        "findings": {
            "proposed": sum(finding_status.values()),
            "published": finding_status.get("published", 0),
            "suppressed": finding_status.get("suppressed", 0),
            "dropped": finding_status.get("dropped", 0),
            "disproven": finding_status.get("disproven", 0),
            "proposed_unresolved": finding_status.get("proposed", 0),
        },
        "proof": {
            "attempted": sum(proof.values()),
            "proven": proof.get("proven", 0),
            "disproven": proof.get("disproven", 0),
            "inconclusive": proof.get("inconclusive", 0),
            "skipped_no_env": proof.get("skipped_no_env", 0),
        },
        "precision": {
            "executed_and_published": sum(executed.values()),
            "published_proven": executed.get("proven", 0),
            "ever_published": len(ever_published),
            "dismissed": sum(1 for row in ever_published if row.id in dismissed_ids),
            "rerun_prs": len(rerun_prs),
            "published_on_rerun_prs": len(addressable),
            "addressed": sum(1 for row in addressable if row.id in addressed_ids),
        },
        "gate": {
            "runs_red": conclusions.get("failure", 0),
            "runs_green": conclusions.get("success", 0),
            "runs_neutral": conclusions.get("neutral", 0),
            "break_glass_overrides": overrides,
        },
    }


def report_from_counts(counts: dict[str, Any]) -> dict[str, Any]:
    """The §6.9 document from ``raw_counts``, with the backend's own ratio and definitions."""
    ratio = accuracy.ratio
    runs, findings, proof = counts["runs"], counts["findings"], counts["proof"]
    precision, gate = counts["precision"], counts["gate"]
    metric = schemas.AccuracyMetric
    obj = schemas.AccuracyReport(
        window=schemas.AccuracyWindow(since=None, until=None, repository=None),
        runs=schemas.AccuracyRuns(
            total=runs["total"],
            succeeded=runs["succeeded"],
            failed=runs["failed"],
            cancelled=runs["cancelled"],
            median_duration_seconds=runs["median_duration_seconds"],
        ),
        findings=schemas.AccuracyFindings(
            proposed=findings["proposed"],
            published=findings["published"],
            suppressed=findings["suppressed"],
            dropped_by_coordinator=findings["dropped"],
            per_review_published_mean=(
                round(findings["published"] / runs["total"], accuracy.RATIO_PRECISION)
                if runs["total"]
                else 0.0
            ),
        ),
        proof=schemas.AccuracyProof(
            attempted=proof["attempted"],
            proven=proof["proven"],
            disproven=proof["disproven"],
            inconclusive=proof["inconclusive"],
            skipped_no_env=proof["skipped_no_env"],
            proven_rate=ratio(proof["proven"], proof["attempted"]),
            disproven_rate=ratio(proof["disproven"], proof["attempted"]),
        ),
        precision_proxies=schemas.AccuracyPrecisionProxies(
            execution_verified_precision=metric(
                value=ratio(precision["published_proven"], precision["executed_and_published"]),
                n=precision["executed_and_published"],
                definition=accuracy.DEFINITIONS["execution_verified_precision"],
            ),
            self_caught_false_positive_rate=metric(
                value=ratio(proof["disproven"], proof["attempted"]),
                n=proof["attempted"],
                definition=accuracy.DEFINITIONS["self_caught_false_positive_rate"],
            ),
            human_dismissal_rate=metric(
                value=ratio(precision["dismissed"], precision["ever_published"]),
                n=precision["ever_published"],
                definition=accuracy.DEFINITIONS["human_dismissal_rate"],
            ),
            addressed_rate=metric(
                value=ratio(precision["addressed"], precision["published_on_rerun_prs"]),
                n=precision["published_on_rerun_prs"],
                definition=accuracy.DEFINITIONS["addressed_rate"],
            ),
        ),
        gate=schemas.AccuracyGate(**gate),
        caveats=list(accuracy.CAVEATS),
    )
    return roundtrip(schemas.AccuracyReport, obj)


def backend_report(world: World, events: list[models.AuditEvent]) -> dict[str, Any]:
    """``accuracy.compute_report`` — the backend's SQL — over a SQLite copy of the corpus."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from corpus.backend import routes_accuracy  # noqa: F401 - the route's mapping, below

    def clone(row: Any) -> Any:
        return type(row)(**{column.key: getattr(row, column.key) for column in row.__table__.columns})

    rows: list[Any] = [
        models.Tenant(id=TENANT_ID, slug=TENANT_SLUG, name="Acme", created_at=datetime(2026, 8, 18, 9, tzinfo=NOW.tzinfo))
    ]
    rows += [clone(repo.row) for repo in world.repos.values()]
    rows += [clone(pr) for pr in world.prs.values()]
    rows += [clone(fp) for fp in world.fingerprints.values()]
    rows += [clone(s.row) for s in world.suppressions.values()]
    for run in world.runs:
        rows.append(clone(run.row))
        for item in run.findings:
            rows.append(clone(item.row))
            if item.artifact is not None:
                rows.append(clone(item.artifact))
    rows += [clone(outcome) for outcome in world.outcomes]
    rows += [clone(event) for event in events]

    async def compute() -> accuracy.AccuracyReport:
        engine = create_async_engine("sqlite+aiosqlite://")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            session.add_all(rows)
            await session.commit()
            report = await accuracy.compute_report(session, tenant_id=TENANT_ID)
        await engine.dispose()
        return report

    report = asyncio.run(compute())
    proxies = report.precision_proxies

    def metric(value: accuracy.Metric) -> schemas.AccuracyMetric:
        return schemas.AccuracyMetric(value=value.value, n=value.n, definition=value.definition)

    obj = schemas.AccuracyReport(
        window=schemas.AccuracyWindow(since=None, until=None, repository=None),
        runs=schemas.AccuracyRuns(**report.runs.__dict__),
        findings=schemas.AccuracyFindings(**report.findings.__dict__),
        proof=schemas.AccuracyProof(**report.proof.__dict__),
        precision_proxies=schemas.AccuracyPrecisionProxies(
            execution_verified_precision=metric(proxies["execution_verified_precision"]),
            self_caught_false_positive_rate=metric(proxies["self_caught_false_positive_rate"]),
            human_dismissal_rate=metric(proxies["human_dismissal_rate"]),
            addressed_rate=metric(proxies["addressed_rate"]),
        ),
        gate=schemas.AccuracyGate(**report.gate.__dict__),
        caveats=report.caveats,
    )
    return roundtrip(schemas.AccuracyReport, obj)


# =======================================================================================
# series.json (fixture-only)
# =======================================================================================


def _week_start(moment: datetime) -> date:
    day = moment.date()
    return day - timedelta(days=day.weekday())


def series(world: World, counts: dict[str, Any]) -> dict[str, Any]:
    rows = _rows(world)
    first = min(run.queued_at for run in world.runs)
    weeks: list[date] = []
    cursor = _week_start(first)
    while cursor <= _week_start(NOW):
        weeks.append(cursor)
        cursor += timedelta(days=7)
    weekly = {week: Counter() for week in weeks}
    for run, row in rows:
        week = _week_start(run.queued_at)
        if row.proof_status in ATTEMPTED:
            weekly[week][row.proof_status] += 1
        elif row.status != "dropped" and row.proof_status in ("not_attempted", "not_applicable"):
            weekly[week][row.proof_status] += 1

    dismissed_ids = {o.finding_id for o in world.outcomes if o.outcome == "dismissed"}
    addressed_ids = {o.finding_id for o in world.outcomes if o.outcome == "addressed"}
    ever = [row for _, row in rows if row.status == "published" or row.id in dismissed_ids]
    # Calibration divides by the addressed_rate population: published findings on PRs
    # run more than once (core/accuracy.py CAVEATS: single-run PRs are excluded from n).
    runs_per_pr = Counter(run.row.pull_request_id for run in world.runs)
    rerun_prs = {pr for pr, count in runs_per_pr.items() if count > 1}
    addressable = [
        row
        for run, row in rows
        if row.status == "published" and run.row.pull_request_id in rerun_prs
    ]

    by_category = []
    for category in CATEGORIES:
        population = [row for row in ever if row.category == category]
        by_category.append(
            {
                "category": category,
                "dismissed": sum(1 for row in population if row.id in dismissed_ids),
                "published": len(population),
            }
        )
    calibration = []
    for band in BANDS_DESC:
        population = [row for row in addressable if row.severity_band == band]
        calibration.append(
            {
                "band": band,
                "predicted_score_mean": (
                    round(statistics.fmean(row.severity_score for row in population), 3)
                    if population
                    else None
                ),
                "addressed": sum(1 for row in population if row.id in addressed_ids),
                "n": len(population),
                "published_n": sum(1 for row in ever if row.severity_band == band),
            }
        )
    out = {
        "weekly": [
            {
                "week_start": week.isoformat(),
                "proven": weekly[week]["proven"],
                "disproven": weekly[week]["disproven"],
                "inconclusive": weekly[week]["inconclusive"],
                "skipped_no_env": weekly[week]["skipped_no_env"],
                "not_attempted": weekly[week]["not_attempted"],
                "not_applicable": weekly[week]["not_applicable"],
            }
            for week in weeks
        ],
        "dismissal_by_category": by_category,
        "calibration": calibration,
        "raw_counts": counts,
    }
    # The composition sums to the report's totals, and every population is the report's.
    for key in ("proven", "disproven", "inconclusive", "skipped_no_env"):
        assert sum(week[key] for week in out["weekly"]) == counts["proof"][key], key
    visible = sum(1 for _, row in rows if row.status != "dropped")
    assert sum(sum(v for k, v in week.items() if k != "week_start") for week in out["weekly"]) == visible
    assert sum(item["published"] for item in by_category) == counts["precision"]["ever_published"]
    assert sum(item["dismissed"] for item in by_category) == counts["precision"]["dismissed"]
    assert sum(item["n"] for item in calibration) == counts["precision"]["published_on_rerun_prs"]
    assert sum(item["addressed"] for item in calibration) == counts["precision"]["addressed"]
    assert sum(item["published_n"] for item in calibration) == counts["precision"]["ever_published"]
    return out


# =======================================================================================
# cost/summary.json (fixture-only)
# =======================================================================================


def _nearest_rank(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    rank = max(1, -(-len(ordered) * percentile // 100))
    return ordered[int(rank) - 1]


def cost_summary(world: World) -> dict[str, Any]:
    succeeded = [run for run in world.runs if run.row.status == "succeeded"]
    per_stage = []
    for index, key in enumerate(STAGES):
        seconds = [run.stages[index].duration_ms / 1000 for run in succeeded]
        per_stage.append(
            {
                "stage": key,
                "p50_s": round(statistics.median(seconds), 3),
                "p95_s": round(_nearest_rank(seconds, 95), 3),
            }
        )
    costs = [run.row.cost_usd_estimate for run in succeeded if run.row.cost_usd_estimate is not None]
    width = 0.2
    top = max(costs)
    bins = []
    start = 0.0
    while start <= top:
        end = round(start + width, 2)
        bins.append(
            {
                "bin_start_usd": round(start, 2),
                "bin_end_usd": end,
                "runs": sum(1 for cost in costs if start <= cost < end),
            }
        )
        start = end
    assert sum(item["runs"] for item in bins) == len(costs)
    days: dict[str, dict[str, int]] = {}
    for run in world.runs:
        usage = run.row.token_usage or {}
        if not usage.get("input_tokens"):
            continue
        day = run.queued_at.date().isoformat()
        entry = days.setdefault(day, {"cache_read_tokens": 0, "input_tokens": 0})
        entry["cache_read_tokens"] += int(usage.get("cache_read_tokens", 0))
        entry["input_tokens"] += int(usage.get("input_tokens", 0))
    first = min(run.queued_at for run in world.runs)
    return {
        "window": {
            "since": first.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "until": NOW.isoformat().replace("+00:00", "Z"),
            "runs": len(succeeded),
        },
        "per_stage": per_stage,
        "cost_histogram": bins,
        "cost_p50_usd": round(statistics.median(costs), 4),
        "cost_p95_usd": round(_nearest_rank(costs, 95), 4),
        "cache_hit": [{"day": day, **days[day]} for day in sorted(days)],
    }


# =======================================================================================
# live/demo-run.json (fixture-only, plan A5)
# =======================================================================================


def live_demo(world: World, review_id: str) -> dict[str, Any]:
    run = next(run for run in world.runs if run.row.id == review_id)
    stages = [
        {
            "key": log.key,
            "duration_ms": log.duration_ms,
            "label": routes_reviews.stage_label_of(log.key, run.row.risk_tier),
        }
        for log in run.stages
    ]
    assert [stage["key"] for stage in stages] == list(STAGES)
    return {
        "review_id": review_id,
        "time_scale": 0.5,
        "stages": stages,
        "heartbeat_interval_ms": 1200,
        "final_status_file": f"reviews/{review_id}.status.json",
        "final_result_file": f"reviews/{review_id}.result.json",
    }


__all__ = [
    "backend_report",
    "cost_summary",
    "live_demo",
    "raw_counts",
    "report_from_counts",
    "series",
]
