"""POST /webhooks/github (spec §6.10).

The receiver **fails closed**: with no `GITHUB_WEBHOOK_SECRET` configured it refuses the
delivery (503) unless `ALLOW_UNSIGNED_WEBHOOKS=true` is set deliberately for local ngrok
testing. An unauthenticated endpoint that triggers work is not a shortcut, it is a hole.

Handled deliveries call the *same* :func:`prguard.api.routes_reviews.enqueue_review` the
API door calls (G6). Nothing about a review is decided here: this module authenticates,
deduplicates, and translates a GitHub payload into a `ReviewTarget`.

The order of §6.10's rules is the security property, not a formality. Rule 2 runs before
the body is parsed and before `action` is known, because unverified bytes are not handed to
a JSON parser; rule 3 runs after it, and only ever answers for a delivery this service
actually *handled* — an `invalid` row is a rejected attempt, and letting it count as a
duplicate would let anyone who knows a delivery id suppress the real one.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Annotated, Any

import sqlalchemy as sa
from fastapi import APIRouter, Header, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.api.deps import JobQueueDep, SessionDep, SettingsDep, TenantScope, TenantScopeDep
from prguard.api.errors import ErrorCode, PRGuardError, request_id_of
from prguard.api.routes_reviews import ReviewTarget, enqueue_review
from prguard.api.schemas import WebhookAccepted, WebhookDuplicate, WebhookIgnored
from prguard.db import models
from prguard.db.base import new_uuid, utcnow

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

#: §6.10 rule 4 — the four actions that start a review.
HANDLED_ACTIONS = frozenset({"opened", "synchronize", "reopened", "ready_for_review"})
HANDLED_EVENT = "pull_request"
SIGNATURE_PREFIX = "sha256="

#: The `webhook_deliveries` column widths (§5.1). Rule 2 records a delivery nobody has
#: authenticated, so the headers it records are bounded to the columns they land in: an
#: oversized header must not turn the 401 AC-19 requires into a 500.
DELIVERY_ID_MAX = 255
EVENT_MAX = 64
ACTION_MAX = 64


@router.post(
    "/github",
    response_model=None,
    summary="GitHub webhook receiver (§6.10)",
    responses={
        202: {"model": WebhookAccepted},
        200: {"model": WebhookDuplicate | WebhookIgnored},
    },
)
async def receive_github_webhook(
    request: Request,
    session: SessionDep,
    scope: TenantScopeDep,
    settings: SettingsDep,
    queue: JobQueueDep,
    x_github_event: Annotated[str | None, Header()] = None,
    x_github_delivery: Annotated[str | None, Header()] = None,
    x_hub_signature_256: Annotated[str | None, Header()] = None,
) -> JSONResponse:
    body = await request.body()

    secret = settings.GITHUB_WEBHOOK_SECRET
    if not secret and not settings.ALLOW_UNSIGNED_WEBHOOKS:
        # Rule 1, before anything is recorded: we cannot trust this delivery at all.
        raise PRGuardError(ErrorCode.WEBHOOK_NOT_CONFIGURED)

    # Headers only. The body stays raw bytes until the HMAC has spoken for it.
    event = _bounded(x_github_event, EVENT_MAX) or ""
    delivery_id = _bounded(x_github_delivery, DELIVERY_ID_MAX) or new_uuid()

    if secret and not _signature_matches(body, x_hub_signature_256, secret):
        # Rule 2, before anything reads the body: `action` is unknowable here precisely
        # because these bytes are not trusted enough to parse. The attempt is recorded so
        # probing is visible afterwards, and recorded once — GitHub retries with the same
        # delivery id and an attacker replays by definition, so a second insert would 500
        # on the unique index where AC-19 requires 401 every time.
        await _record_rejection(session, scope, delivery_id, event)
        raise PRGuardError(ErrorCode.INVALID_SIGNATURE, details={"delivery_id": delivery_id})

    duplicate = await _handled_delivery(session, delivery_id)
    if duplicate is not None:
        # Rule 3 / E20: GitHub retries deliveries; without this the demo double-reviews.
        return _json(
            status.HTTP_200_OK,
            WebhookDuplicate(review_id=duplicate.review_run_id),
        )

    payload = _decode(body)
    action = _bounded(payload.get("action"), ACTION_MAX)
    pull_request = payload.get("pull_request")
    if event != HANDLED_EVENT or action not in HANDLED_ACTIONS or not isinstance(
        pull_request, dict
    ):
        # Rule 6: not ours, and not an error.
        await _record(
            session, scope, delivery_id, event, action, models.WebhookStatus.IGNORED, commit=True
        )
        return _json(status.HTTP_200_OK, WebhookIgnored(reason="unhandled_event"))

    if bool(pull_request.get("draft")) and not settings.REVIEW_DRAFT_PRS:
        # Rule 5: a draft is ignored, not rejected.
        await _record(
            session, scope, delivery_id, event, action, models.WebhookStatus.IGNORED, commit=True
        )
        return _json(status.HTTP_200_OK, WebhookIgnored(reason="draft"))

    delivery = await _record(
        session, scope, delivery_id, event, action, models.WebhookStatus.ACCEPTED, commit=False
    )
    enqueued = await enqueue_review(
        session=session,
        scope=scope,
        queue=queue,
        target=_target_from(payload, pull_request),
        trigger=models.RunTrigger.WEBHOOK,
        request_id=request_id_of(request),
        # GitHub delivered this; no human pressed anything.
        actor_type=models.ActorType.SYSTEM,
        actor_id="webhook:github",
    )
    delivery.review_run_id = enqueued.run.id
    await session.commit()

    return _json(
        status.HTTP_202_ACCEPTED,
        WebhookAccepted(
            review_id=enqueued.run.id,
            delivery_id=delivery_id,
            event=event,
            action=action,
        ),
    )


def _target_from(payload: dict[str, Any], pull_request: dict[str, Any]) -> ReviewTarget:
    """A GitHub `pull_request` payload → the same target the API door builds by parsing."""
    repository = payload.get("repository") or {}
    owner = (repository.get("owner") or {}).get("login") or ""
    head = pull_request.get("head") or {}
    base = pull_request.get("base") or {}
    return ReviewTarget(
        owner=str(owner),
        name=str(repository.get("name") or ""),
        number=int(pull_request.get("number") or payload.get("number") or 0),
        head_sha=_optional_str(head.get("sha")),
        base_sha=_optional_str(base.get("sha")),
        head_ref=_optional_str(head.get("ref")),
        base_ref=_optional_str(base.get("ref")),
        title=_optional_str(pull_request.get("title")),
        author_login=_optional_str((pull_request.get("user") or {}).get("login")),
        state=_optional_str(pull_request.get("state")),
        url=_optional_str(pull_request.get("html_url")),
        is_draft=bool(pull_request.get("draft")),
        default_branch=_optional_str(repository.get("default_branch")),
        external_repo_id=_optional_str(repository.get("id")),
    )


def _signature_matches(body: bytes, header: str | None, secret: str) -> bool:
    """HMAC-SHA256 over the raw body, compared in constant time."""
    if not header or not header.startswith(SIGNATURE_PREFIX):
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header[len(SIGNATURE_PREFIX) :], expected)


def _decode(body: bytes) -> dict[str, Any]:
    try:
        payload = json.loads(body or b"{}")
    except ValueError as exc:
        raise PRGuardError(
            ErrorCode.VALIDATION_ERROR, "The webhook body is not valid JSON."
        ) from exc
    return payload if isinstance(payload, dict) else {}


async def _delivery_row(
    session: AsyncSession, delivery_id: str
) -> models.WebhookDelivery | None:
    """Not tenant-scoped on purpose: `delivery_id` is unique across the whole table (§5.1)."""
    statement = sa.select(models.WebhookDelivery).where(
        models.WebhookDelivery.delivery_id == delivery_id
    )
    return (await session.execute(statement)).scalars().first()


async def _handled_delivery(
    session: AsyncSession, delivery_id: str
) -> models.WebhookDelivery | None:
    """Rule 3's duplicate — a delivery this service actually handled.

    `invalid` rows are excluded. They record an attempt that was *refused*, so treating one
    as a duplicate would answer `200 {"status": "duplicate"}` to the correctly-signed
    delivery that follows it and no review would ever run — reachable by an unauthenticated
    POST that knows only the delivery id, and reached for free during a secret rotation,
    where GitHub's first attempt fails the HMAC and its retry is the real one.
    """
    statement = sa.select(models.WebhookDelivery).where(
        models.WebhookDelivery.delivery_id == delivery_id,
        models.WebhookDelivery.status != models.WebhookStatus.INVALID.value,
    )
    return (await session.execute(statement)).scalars().first()


async def _record_rejection(
    session: AsyncSession, scope: TenantScope, delivery_id: str, event: str
) -> None:
    """Rule 2's `invalid` row, written at most once per delivery id.

    A delivery already on file keeps the disposition it has. Re-inserting would violate the
    unique index, and overwriting would let an unauthenticated POST erase the record of a
    delivery that was accepted — so a replay is simply refused again, which is what AC-19
    asks for.
    """
    if await _delivery_row(session, delivery_id) is not None:
        return
    session.add(
        models.WebhookDelivery(
            id=new_uuid(),
            tenant_id=scope.tenant_id,
            delivery_id=delivery_id,
            event=event or None,
            action=None,
            received_at=utcnow(),
            status=models.WebhookStatus.INVALID.value,
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        # Two replays landed at once and the other one won. One record is enough, and the
        # caller owes this delivery a 401 either way.
        await session.rollback()


async def _record(
    session: AsyncSession,
    scope: TenantScope,
    delivery_id: str,
    event: str,
    action: str | None,
    outcome: models.WebhookStatus,
    *,
    commit: bool,
) -> models.WebhookDelivery:
    """Record how this delivery was handled, one row per `delivery_id` (§5.1).

    A rejected attempt and the correctly-signed delivery that follows it are one delivery,
    so the existing row is updated rather than joined by a second one that the unique index
    would refuse.
    """
    delivery = await _delivery_row(session, delivery_id)
    if delivery is None:
        delivery = models.WebhookDelivery(
            id=new_uuid(), tenant_id=scope.tenant_id, delivery_id=delivery_id
        )
        session.add(delivery)
    delivery.event = event or None
    delivery.action = action
    delivery.received_at = utcnow()
    delivery.status = outcome.value
    if commit:
        # The rejected and ignored paths raise or return immediately, so the record has to
        # be durable before that happens.
        await session.commit()
    else:
        await session.flush()
    return delivery


def _json(
    status_code: int, body: WebhookAccepted | WebhookDuplicate | WebhookIgnored
) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


def _optional_str(value: Any) -> str | None:
    return None if value is None else str(value)


def _bounded(value: Any, limit: int) -> str | None:
    """An untrusted header or payload field, trimmed to the column it lands in (§5.1)."""
    text = "" if value is None else str(value)
    return text[:limit] or None
