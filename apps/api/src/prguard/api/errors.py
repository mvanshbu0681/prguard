"""The error envelope — spec §6.0, "every non-2xx response, no exceptions".

One exception type (`PRGuardError`), one registry, and handlers wide enough that nothing
can escape as a bare Starlette error page.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

REQUEST_ID_HEADER = "X-Request-Id"


class ErrorCode(StrEnum):
    """The §6.0 registry, plus the two envelope fallbacks a router needs (see below)."""

    INVALID_PR_URL = "INVALID_PR_URL"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"
    WEBHOOK_NOT_CONFIGURED = "WEBHOOK_NOT_CONFIGURED"
    REVIEW_NOT_FOUND = "REVIEW_NOT_FOUND"
    FINDING_NOT_FOUND = "FINDING_NOT_FOUND"
    SUPPRESSION_NOT_FOUND = "SUPPRESSION_NOT_FOUND"
    PR_NOT_FOUND = "PR_NOT_FOUND"
    REPO_FORBIDDEN = "REPO_FORBIDDEN"
    RESULT_NOT_READY = "RESULT_NOT_READY"
    GITHUB_UNAVAILABLE = "GITHUB_UNAVAILABLE"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    # Not endpoint codes: §6.0 demands an envelope on *every* non-2xx response, and a
    # request to a route that does not exist has no domain-specific code to carry.
    NOT_FOUND = "NOT_FOUND"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"


#: Spec §6.0 verbatim — code → HTTP status.
ERROR_STATUS: dict[ErrorCode, int] = {
    ErrorCode.INVALID_PR_URL: 422,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.INVALID_SIGNATURE: 401,
    ErrorCode.WEBHOOK_NOT_CONFIGURED: 503,
    ErrorCode.REVIEW_NOT_FOUND: 404,
    ErrorCode.FINDING_NOT_FOUND: 404,
    ErrorCode.SUPPRESSION_NOT_FOUND: 404,
    ErrorCode.PR_NOT_FOUND: 404,
    ErrorCode.REPO_FORBIDDEN: 403,
    ErrorCode.RESULT_NOT_READY: 409,
    ErrorCode.GITHUB_UNAVAILABLE: 502,
    ErrorCode.LLM_UNAVAILABLE: 502,
    ErrorCode.DATABASE_UNAVAILABLE: 503,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.METHOD_NOT_ALLOWED: 405,
}

#: The sixteen codes §6.0 names; asserted by the app-shell test so the registry cannot drift.
SPEC_ERROR_CODES: frozenset[ErrorCode] = frozenset(ERROR_STATUS) - {
    ErrorCode.NOT_FOUND,
    ErrorCode.METHOD_NOT_ALLOWED,
}

DEFAULT_MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.INVALID_PR_URL: "Could not parse a GitHub pull request from the supplied URL.",
    ErrorCode.VALIDATION_ERROR: "The request body failed validation.",
    ErrorCode.UNAUTHORIZED: "A valid bearer token is required for this endpoint.",
    ErrorCode.INVALID_SIGNATURE: "The webhook signature did not match.",
    ErrorCode.WEBHOOK_NOT_CONFIGURED: "No webhook secret is configured; refusing unsigned events.",
    ErrorCode.REVIEW_NOT_FOUND: "No review run with that id.",
    ErrorCode.FINDING_NOT_FOUND: "No finding with that id.",
    ErrorCode.SUPPRESSION_NOT_FOUND: "No suppression with that id.",
    ErrorCode.PR_NOT_FOUND: "The pull request could not be found on GitHub.",
    ErrorCode.REPO_FORBIDDEN: "The configured token cannot access that repository.",
    ErrorCode.RESULT_NOT_READY: "The run has not finished; retry, or pass ?partial=true.",
    ErrorCode.GITHUB_UNAVAILABLE: "GitHub could not be reached.",
    ErrorCode.LLM_UNAVAILABLE: "The model provider could not be reached.",
    ErrorCode.DATABASE_UNAVAILABLE: "The database could not be reached.",
    ErrorCode.RATE_LIMITED: "Rate limited; retry later.",
    ErrorCode.INTERNAL_ERROR: "An unexpected error occurred.",
    ErrorCode.NOT_FOUND: "No such route.",
    ErrorCode.METHOD_NOT_ALLOWED: "That method is not allowed on this route.",
}

#: Generic HTTP statuses raised by the framework, mapped onto the registry.
STATUS_FALLBACK: dict[int, ErrorCode] = {
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.REPO_FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    409: ErrorCode.RESULT_NOT_READY,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
    502: ErrorCode.GITHUB_UNAVAILABLE,
    503: ErrorCode.DATABASE_UNAVAILABLE,
}


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] | None = None
    request_id: str


class ErrorEnvelope(BaseModel):
    """The one and only non-2xx response shape."""

    error: ErrorBody


class PRGuardError(Exception):
    """Raise this anywhere; the handler turns it into the §6.0 envelope."""

    def __init__(
        self,
        code: ErrorCode,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
        status_code: int | None = None,
    ) -> None:
        self.code = code
        self.message = message or DEFAULT_MESSAGES[code]
        self.details = details
        self.status_code = status_code or ERROR_STATUS[code]
        super().__init__(self.message)


def request_id_of(request: Request) -> str:
    """Set by the request-id middleware; falls back so a handler can never itself fail."""
    value = getattr(request.state, "request_id", None)
    return value if isinstance(value, str) else "unknown"


def envelope_response(
    *,
    code: ErrorCode,
    message: str,
    request_id: str,
    details: dict[str, Any] | None = None,
    status_code: int | None = None,
) -> JSONResponse:
    envelope = ErrorEnvelope(
        error=ErrorBody(code=code, message=message, details=details, request_id=request_id)
    )
    return JSONResponse(
        status_code=status_code or ERROR_STATUS[code],
        content=envelope.model_dump(mode="json"),
        headers={REQUEST_ID_HEADER: request_id},
    )


async def prguard_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, PRGuardError)
    return envelope_response(
        code=exc.code,
        message=exc.message,
        details=exc.details,
        request_id=request_id_of(request),
        status_code=exc.status_code,
    )


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return envelope_response(
        code=ErrorCode.VALIDATION_ERROR,
        message=DEFAULT_MESSAGES[ErrorCode.VALIDATION_ERROR],
        details={"errors": _jsonable_validation_errors(exc)},
        request_id=request_id_of(request),
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = STATUS_FALLBACK.get(exc.status_code, ErrorCode.INTERNAL_ERROR)
    detail = exc.detail if isinstance(exc.detail, str) and exc.detail else DEFAULT_MESSAGES[code]
    return envelope_response(
        code=code,
        message=detail,
        request_id=request_id_of(request),
        status_code=exc.status_code,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return envelope_response(
        code=ErrorCode.INTERNAL_ERROR,
        message=DEFAULT_MESSAGES[ErrorCode.INTERNAL_ERROR],
        details={"type": type(exc).__name__},
        request_id=request_id_of(request),
    )


def _jsonable_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    """Strip the un-serialisable `ctx`/`input` pydantic attaches to raw errors."""
    cleaned: list[dict[str, Any]] = []
    for error in exc.errors():
        cleaned.append(
            {
                "loc": [str(part) for part in error.get("loc", ())],
                "msg": str(error.get("msg", "")),
                "type": str(error.get("type", "")),
            }
        )
    return cleaned


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(PRGuardError, prguard_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
