"""JSON-schema-validated model output with exactly one repair retry — §6.12, E23, AC-23c.

The contract, and the reason it is this shape:

* **Validate, never trust.** A specialist response is parsed against its schema before any
  other code sees it. Prose is rejected outright (§3 Tier 3) — an injected "reply with a
  blanket sign-off" has no field to land in. (The literal event name is deliberately not
  written here: AC-14's source guard asserts it appears nowhere under ``src/``.)
* **Repair once.** On failure we re-issue the *same* request with the validation error and the
  rejected response appended. Once. A second repair would be an unbounded retry loop against a
  paid API, and a model that failed twice at temperature 0 is not going to succeed on the third.
* **Then raise a typed error, not a stack trace.** :class:`StructuredOutputError` carries a
  persistable ``reason`` so the caller records "specialist bugs failed, malformed JSON" as a
  degradation (E23) and the run continues. Callers must catch it; nothing here kills a run.

Ownership: T2. T8 wraps this with the per-model circuit breaker in ``llm/circuit.py``.
"""

from __future__ import annotations

import re
from typing import Final, Literal, TypeVar

from pydantic import TypeAdapter, ValidationError

from prguard.llm.client import LLMClient, LLMError, LLMResponse, Message

T = TypeVar("T")

#: Why a response was rejected. Persisted verbatim on the run's ``degradations``.
FailureReason = Literal["non_json_response", "invalid_json", "schema_violation"]

#: How many times a single logical call may be issued: the original plus one repair.
MAX_ATTEMPTS: Final[int] = 2

#: How much of a rejected response to quote back to the model.
MAX_QUOTED_RESPONSE_CHARS: Final[int] = 4000

_FENCE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^```(?:json|JSON)?\s*\n(?P<body>.*?)\n?```$", re.DOTALL
)

REPAIR_HEADER: Final[str] = (
    "--- REPAIR REQUEST ---\n"
    "Your previous response was rejected because it did not satisfy the required schema."
)
REPAIR_FOOTER: Final[str] = (
    "Return the corrected response as a single JSON value and nothing else: "
    "no prose, no explanation, no markdown fences."
)


class StructuredOutputError(LLMError):
    """A model response failed validation twice. Carries everything needed to persist a drop."""

    def __init__(
        self,
        *,
        reason: FailureReason,
        schema_name: str,
        validation_errors: tuple[str, ...],
        raw_responses: tuple[str, ...],
        stop_reasons: tuple[str | None, ...] = (),
    ) -> None:
        self.reason: FailureReason = reason
        self.schema_name = schema_name
        self.validation_errors = validation_errors
        self.raw_responses = raw_responses
        self.stop_reasons = stop_reasons
        self.attempts = len(raw_responses)
        detail = validation_errors[-1] if validation_errors else "no detail"
        truncation = (
            f" (stop_reason={stop_reasons[-1]})"
            if stop_reasons and stop_reasons[-1] not in (None, "end_turn")
            else ""
        )
        super().__init__(
            f"{schema_name} validation failed after {self.attempts} attempt(s) "
            f"[{reason}]{truncation}: {detail}"
        )


async def complete_structured(
    client: LLMClient,
    *,
    model: str,
    system: str,
    prompt: str,
    schema: type[T],
    max_tokens: int,
    temperature: float,
) -> T:
    """Call ``client`` and return a validated ``schema`` instance.

    ``model``, ``max_tokens`` and ``temperature`` are passed straight through — this function
    never substitutes a model of its own, because model routing is config (§4.8) and was
    explicitly deferred.

    Raises :class:`StructuredOutputError` when the response is still invalid after one repair.
    """
    adapter: TypeAdapter[T] = TypeAdapter(schema)
    schema_name = getattr(schema, "__name__", str(schema))

    raw_responses: list[str] = []
    stop_reasons: list[str | None] = []
    validation_errors: list[str] = []
    reason: FailureReason = "non_json_response"
    current_prompt = prompt

    for attempt in range(MAX_ATTEMPTS):
        response = await client.complete(
            model=model,
            system=system,
            messages=[Message(role="user", content=current_prompt)],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        raw_responses.append(response.text)
        stop_reasons.append(response.stop_reason)

        try:
            return _validate(response, adapter)
        except _Rejected as rejection:
            reason = rejection.reason
            validation_errors.append(rejection.error_text)
            if attempt + 1 < MAX_ATTEMPTS:
                current_prompt = _repair_prompt(
                    original_prompt=prompt,
                    rejected=response.text,
                    error_text=rejection.error_text,
                )

    raise StructuredOutputError(
        reason=reason,
        schema_name=schema_name,
        validation_errors=tuple(validation_errors),
        raw_responses=tuple(raw_responses),
        stop_reasons=tuple(stop_reasons),
    )


class _Rejected(Exception):
    """Internal: one response failed validation. Never escapes this module."""

    def __init__(self, reason: FailureReason, error_text: str) -> None:
        self.reason: FailureReason = reason
        self.error_text = error_text
        super().__init__(error_text)


def _validate(response: LLMResponse, adapter: TypeAdapter[T]) -> T:
    """Parse and validate one response, or raise :class:`_Rejected` with a reason."""
    payload = _extract_json(response.text)
    if payload is None:
        raise _Rejected(
            "non_json_response",
            "The response was not JSON. Expected a single JSON value; got prose or an empty "
            "response.",
        )
    try:
        return adapter.validate_json(payload)
    except ValidationError as exc:
        is_parse_failure = any(error["type"] == "json_invalid" for error in exc.errors())
        reason: FailureReason = "invalid_json" if is_parse_failure else "schema_violation"
        raise _Rejected(reason, _format_validation_error(exc)) from exc


def _extract_json(text: str) -> str | None:
    """The JSON value in ``text``, or ``None`` if there is not exactly one and nothing else.

    A fenced block is unwrapped — that is formatting, not prose. Commentary wrapped around an
    object is *not* unwrapped: a model that ignored "return only JSON" has ignored the contract,
    and guessing which fragment it meant is how a hallucination gets laundered into a finding.
    """
    stripped = text.strip()
    if not stripped:
        return None
    fenced = _FENCE_PATTERN.match(stripped)
    if fenced is not None:
        stripped = fenced.group("body").strip()
    if stripped[:1] not in ("{", "["):
        return None
    return stripped


def _format_validation_error(exc: ValidationError) -> str:
    """Pydantic's report, flattened to the lines a model can act on."""
    lines: list[str] = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error["loc"])
        lines.append(f"{location}: {error['msg']}" if location else error["msg"])
    return "\n".join(lines)


def _repair_prompt(*, original_prompt: str, rejected: str, error_text: str) -> str:
    """The one repair request: the original task, what came back, and why it was rejected."""
    quoted = rejected[:MAX_QUOTED_RESPONSE_CHARS]
    if len(rejected) > MAX_QUOTED_RESPONSE_CHARS:
        quoted += "\n… (truncated)"
    return "\n\n".join(
        [
            original_prompt,
            REPAIR_HEADER,
            f"Your previous response was:\n{quoted}",
            f"Validation error:\n{error_text}",
            REPAIR_FOOTER,
        ]
    )
