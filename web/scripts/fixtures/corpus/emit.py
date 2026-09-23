"""The API's responses, assembled by the API's own code and round-tripped through its models.

Every object below is built the way its route builds it — ``routes_findings._finding_object``,
``routes_reviews._context_info`` / ``_gate_info`` / ``_delivery_info`` / ``_duration_seconds`` /
``stage_index_of`` / ``stage_label_of``, ``routes_suppressions._is_active``,
``routes_audit._audit_item`` — over the simulation's transient ORM rows. Two things the routes
read from the wall clock (``seconds_since_heartbeat``, a suppression's ``active``) are read
against the corpus's fixed "now" instead, so the output never depends on when it was generated.

``roundtrip`` then does what the brief requires of every object: ``model_validate`` the JSON
form, ``model_dump(mode="json")`` it again, and insist the two agree — so what is written is
exactly what the API emits, timestamps in its ``Z`` form included.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from pydantic import BaseModel

from corpus.backend import (
    NOW,
    SETTINGS,
    TENANT_ID,
    models,
    routes_audit,
    routes_findings,
    routes_reviews,
    routes_suppressions,
    schemas,
)
from corpus.simulate import FindingRecord, RunRecord, World


def roundtrip(model: type[BaseModel], value: BaseModel | dict[str, Any]) -> dict[str, Any]:
    data = value.model_dump(mode="json") if isinstance(value, BaseModel) else value
    again = model.model_validate(data).model_dump(mode="json")
    if again != data:
        raise AssertionError(f"{model.__name__} does not round-trip")
    return again


def _suppression_row(world: World, suppression_id: str | None) -> models.Suppression | None:
    if suppression_id is None:
        return None
    for record in world.suppressions.values():
        if record.row.id == suppression_id:
            return record.row
    raise KeyError(suppression_id)


def finding(world: World, run: RunRecord, item: FindingRecord) -> dict[str, Any]:
    obj = routes_findings._finding_object(
        item.row,
        artifact=item.artifact,
        fingerprint=item.identity,
        suppression=_suppression_row(world, item.row.suppression_id),
        run=run.row,
        settings=SETTINGS,
    )
    return roundtrip(schemas.Finding, obj)


def _rows(run: RunRecord) -> list[FindingRecord]:
    """``get_review_result``'s order: ``created_at`` ascending, then ``id``."""
    return sorted(run.findings, key=lambda item: (item.row.created_at, item.row.id))


def _counts(run: RunRecord) -> tuple[Counter[str], int]:
    by_status = Counter(item.row.status for item in run.findings)
    blocking = sum(1 for item in run.findings if item.row.blocking)
    return by_status, blocking


def review_status(run: RunRecord) -> dict[str, Any]:
    row = run.row
    by_status, blocking = _counts(run)
    beat = row.heartbeat_at
    obj = schemas.ReviewStatus(
        review_id=row.id,
        status=row.status,
        stage=row.stage,
        stage_index=routes_reviews.stage_index_of(row.stage),
        stage_total=schemas.STAGE_TOTAL,
        stage_label=routes_reviews.stage_label_of(row.stage, row.risk_tier),
        seconds_since_heartbeat=(max(0, int((NOW - beat).total_seconds())) if beat else None),
        risk_tier=row.risk_tier,
        head_sha=row.head_sha,
        degradations=[str(item) for item in row.degradations or []],
        counts=schemas.RunCounts(
            proposed=by_status.get("proposed", 0),
            published=by_status.get("published", 0),
            suppressed=by_status.get("suppressed", 0),
            blocking=blocking,
        ),
        started_at=row.started_at,
        finished_at=row.finished_at,
        error=(
            schemas.RunError(code=row.error_code, message=row.error_message or "")
            if row.error_code
            else None
        ),
    )
    return roundtrip(schemas.ReviewStatus, obj)


def review_result(world: World, run: RunRecord) -> dict[str, Any]:
    row = run.row
    pr = run.pr
    repo = run.repo.row
    rows = _rows(run)
    blocking_ids = [item.row.id for item in rows if item.row.blocking]
    by_status, blocking = _counts(run)
    usage = dict(row.token_usage or {})
    obj = schemas.ReviewResult(
        review_id=row.id,
        status=row.status,
        repository=schemas.RepositoryInfo(
            owner=repo.owner, name=repo.name, default_branch=repo.default_branch
        ),
        pull_request=schemas.PullRequestInfo(
            number=pr.number,
            title=pr.title,
            author=pr.author_login,
            head_sha=pr.head_sha,
            base_sha=pr.base_sha,
            url=pr.url,
        ),
        risk_tier=row.risk_tier,
        context=routes_reviews._context_info(row),
        gate=routes_reviews._gate_info(row, blocking_ids, SETTINGS),
        delivery=routes_reviews._delivery_info(row, [item.row for item in rows]),
        counts=schemas.ResultCounts(
            proposed=sum(by_status.values()),
            published=by_status.get("published", 0),
            suppressed=by_status.get("suppressed", 0),
            dropped=by_status.get("dropped", 0),
            disproven=by_status.get("disproven", 0),
            blocking=blocking,
        ),
        cost=schemas.CostInfo(
            usd_estimate=row.cost_usd_estimate,
            input_tokens=int(usage.get("input_tokens", 0)),
            output_tokens=int(usage.get("output_tokens", 0)),
            cache_read_tokens=int(usage.get("cache_read_tokens", 0)),
        ),
        timing=schemas.TimingInfo(
            queued_at=row.created_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
            duration_seconds=routes_reviews._duration_seconds(row),
        ),
        degradations=[str(item) for item in row.degradations or []],
        findings=[
            routes_findings._finding_object(
                item.row,
                artifact=item.artifact,
                fingerprint=item.identity,
                suppression=_suppression_row(world, item.row.suppression_id),
                run=row,
                settings=SETTINGS,
            )
            for item in rows
        ],
        review_payload=row.review_payload,
        audit_url=f"/v1/audit?review_id={row.id}",
    )
    return roundtrip(schemas.ReviewResult, obj)


def review_list_item(result: dict[str, Any], run: RunRecord) -> dict[str, Any]:
    """Plan A11's ``ReviewListItem`` — fixture-only, read off the served ``/result``."""
    return {
        "review_id": result["review_id"],
        "status": result["status"],
        "trigger": run.row.trigger,
        "repository": {"owner": result["repository"]["owner"], "name": result["repository"]["name"]},
        "pull_request": {
            "number": result["pull_request"]["number"],
            "title": result["pull_request"]["title"],
            "author": result["pull_request"]["author"],
        },
        "risk_tier": result["risk_tier"],
        "gate_conclusion": result["gate"]["conclusion"] if result["gate"] else None,
        "counts": result["counts"],
        "cost_usd_estimate": result["cost"]["usd_estimate"],
        "duration_seconds": result["timing"]["duration_seconds"],
        "created_at": result["timing"]["queued_at"],
        "finished_at": result["timing"]["finished_at"],
    }


def suppressions(world: World) -> dict[str, Any]:
    """``GET /v1/suppressions?active=false`` — the whole ledger, newest first, with totals."""
    rows = sorted(
        (record.row for record in world.suppressions.values()),
        key=lambda row: (row.created_at, row.id),
        reverse=True,
    )
    fingerprints = {fp.id: fp for fp in world.fingerprints.values()}
    usage: dict[str, list[Any]] = {}
    for run in world.runs:
        for item in run.findings:
            if item.row.suppression_id:
                usage.setdefault(item.row.suppression_id, []).append(item.row.created_at)
    items = []
    for row in rows:
        fp = fingerprints.get(row.fingerprint_id or "")
        matched = usage.get(row.id, [])
        items.append(
            schemas.SuppressionItem(
                suppression_id=row.id,
                scope=row.scope,
                match_path=row.match_path,
                rule_key=fp.rule_key if fp is not None else row.match_rule_key,
                category=fp.category if fp is not None else None,
                reason=row.reason,
                created_by=row.created_by,
                source=row.source,
                active=routes_suppressions._is_active(row, NOW),
                expires_at=row.expires_at,
                revoked_at=row.revoked_at,
                suppressed_count=len(matched),
                last_matched_at=max(matched) if matched else None,
                created_at=row.created_at,
            )
        )
    revoked = sum(1 for row in rows if row.revoked_at is not None)
    expired = sum(
        1 for row in rows if row.revoked_at is None and row.expires_at is not None and row.expires_at <= NOW
    )
    totals = schemas.SuppressionTotals(active=len(rows) - revoked - expired, expired=expired, revoked=revoked)
    full = schemas.SuppressionList(
        items=items, page=schemas.PageInfo(limit=len(items), next_cursor=None, has_more=False), totals=totals
    )
    data = roundtrip(schemas.SuppressionList, full)
    return {"items": data["items"], "totals": data["totals"]}


def audit_items(events: list[models.AuditEvent]) -> list[dict[str, Any]]:
    """``routes_audit._audit_item`` per row, plus ``tenant_id`` (plan A9: the hash covers it)."""
    items = []
    for event in events:
        data = roundtrip(schemas.AuditItem, routes_audit._audit_item(event))
        data["tenant_id"] = TENANT_ID
        items.append(data)
    return items


def audit_chain(verification: Any) -> dict[str, Any]:
    return roundtrip(
        schemas.AuditChain,
        schemas.AuditChain(
            verified=verification.verified,
            checked=verification.checked,
            first_seq=verification.first_seq,
            last_seq=verification.last_seq,
            broken_at_seq=verification.broken_at_seq,
        ),
    )
