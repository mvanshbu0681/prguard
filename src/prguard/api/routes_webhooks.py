"""POST /webhooks/github (spec §6.10).

The receiver **fails closed**: with no `GITHUB_WEBHOOK_SECRET` configured it refuses the
delivery (503) unless `ALLOW_UNSIGNED_WEBHOOKS=true` is set deliberately for local ngrok
testing. An unauthenticated endpoint that triggers work is not a shortcut, it is a hole.

Handled deliveries call the *same* :func:`prguard.api.routes_reviews.enqueue_review` the
API door calls (G6). Nothing about a review is decided here: this module authenticates,
deduplicates, and translates a GitHub payload into a `ReviewTarget`.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Annotated, Any

import sqlalchemy as sa
from fastapi import APIRouter, Header, Request, status
from fastapi.responses import JSONResponse
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

    event = x_github_event or ""
    delivery_id = x_github_delivery or new_uuid()
    payload = _decode(body)
    action = str(payload.get("action") or "") or None

    if secret and not _signature_matches(body, x_hub_signature_256, secret):
        # Rule 2: recorded as `invalid` so a probing attempt is visible afterwards.
        await _record(
            session, scope, delivery_id, event, action, models.WebhookStatus.INVALID, commit=True
        )
        raise PRGuardError(ErrorCode.INVALID_SIGNATURE, details={"delivery_id": delivery_id})

    duplicate = await _known_delivery(session, delivery_id)
    if duplicate is not None:
        # Rule 3 / E20: GitHub retries deliveries; without this the demo double-reviews.
        return _json(
            status.HTTP_200_OK,
            WebhookDuplicate(review_id=duplicate.review_run_id),
        )

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


async def _known_delivery(
    session: AsyncSession, delivery_id: str
) -> models.WebhookDelivery | None:
    """Not tenant-scoped on purpose: `delivery_id` is unique across the whole table (§5.1)."""
    statement = sa.select(models.WebhookDelivery).where(
        models.WebhookDelivery.delivery_id == delivery_id
    )
    return (await session.execute(statement)).scalars().first()


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
    delivery = models.WebhookDelivery(
        id=new_uuid(),
        tenant_id=scope.tenant_id,
        delivery_id=delivery_id,
        event=event or None,
        action=action,
        received_at=utcnow(),
        status=outcome.value,
    )
    session.add(delivery)
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
