"""The live Google Gemini provider.

Deliberately thin, and shaped exactly like :mod:`prguard.llm.anthropic`: everything
interesting happens around it. ``structured.py`` validates and repairs the response,
``circuit.py`` decides whether this model may be called at all, and the pipeline decides what a
failure means. This module's whole job is to turn one
:class:`~prguard.llm.client.LLMClient` call into one HTTP request, and every failure mode into
an :class:`~prguard.llm.client.LLMError` the layers above already record.

Three decisions, matching the Anthropic client so the two are substitutable:

* **It does not retry.** ``LLMClient.complete`` is documented not to retry silently: a hidden
  retry hides a failure from the circuit breaker, which is the signal the breaker exists to
  count. One logical call is one attempt. ``structured.py`` owns the single repair,
  ``circuit.py`` owns the failback.
* **The HTTP client is built lazily.** Constructing this class must be free and must never
  fail — ``build_client`` runs at startup, in tests, and with no credentials present. A missing
  key raises on first call, where it belongs.
* **It talks REST, not the SDK.** ``httpx`` is already a dependency and the surface we need is
  one endpoint; adding ``google-genai`` would buy nothing and cost a dependency.

**Unlike the Anthropic client, this one forwards ``temperature``.** The Claude 5 family rejects
sampling parameters outright (see that module's docstring); Gemini accepts them, and
``LLM_TEMPERATURE`` defaults to ``0.0``, which is what we want for review determinism.

Spec §4.3, §4.8 (model ids), §8.1 (what "down" means).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

import httpx

from prguard.llm.client import LLMError, LLMResponse, LLMUsage, Message

#: AI Studio's endpoint. Authenticated with an API key header, not a bearer token.
DEFAULT_BASE_URL: Final[str] = "https://generativelanguage.googleapis.com/v1beta"

#: Generous: a coordinator call is a large prompt and a large answer.
DEFAULT_TIMEOUT_SECONDS: Final[float] = 120.0

#: Statuses worth a failback to another model. Everything else is our bug, not theirs.
RETRYABLE_STATUSES: Final[frozenset[int]] = frozenset({408, 409, 429, 500, 502, 503, 504})


class GeminiUnavailableError(LLMError):
    """The API refused, timed out, or could not be reached. Carries what §8.1 needs."""

    def __init__(self, message: str, *, status_code: int | None = None, retryable: bool) -> None:
        self.status_code = status_code
        self.retryable = retryable
        super().__init__(message)


class GeminiClient:
    """A `LLMClient` backed by Gemini's `generateContent` endpoint."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._transport = transport

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[Message],
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        if not self._api_key:
            raise GeminiUnavailableError(
                "GEMINI_API_KEY is not set; the gemini provider cannot make a request",
                retryable=False,
            )

        payload: dict[str, Any] = {
            "contents": [
                {"role": _role_of(m), "parts": [{"text": m.content}]} for m in messages
            ],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": temperature,
            },
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        url = f"{self._base_url}/models/{model}:generateContent"
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "x-goog-api-key": self._api_key,
                        "content-type": "application/json",
                    },
                )
        except httpx.TimeoutException as exc:
            raise GeminiUnavailableError(
                f"gemini request timed out: {exc}", retryable=True
            ) from exc
        except httpx.HTTPError as exc:
            raise GeminiUnavailableError(f"gemini request failed: {exc}", retryable=True) from exc

        if response.status_code >= 400:
            raise GeminiUnavailableError(
                f"gemini returned {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
                retryable=response.status_code in RETRYABLE_STATUSES,
            )

        return _to_response(response.json(), model=model)


def _role_of(message: Message) -> str:
    """Gemini names the assistant turn ``model``; every other role is a user turn."""
    return "model" if message.role == "assistant" else "user"


def _to_response(body: dict[str, Any], *, model: str) -> LLMResponse:
    """Flatten a `generateContent` body into an `LLMResponse`.

    A candidate can legitimately come back with no parts — a safety block, or
    ``MAX_TOKENS`` reached before any text. That is empty output, not a crash: the caller
    (``structured.py``) already treats an unparseable answer as a drop with a reason, and
    the ``finishReason`` we carry is what makes it diagnosable.
    """
    candidates = body.get("candidates") or []
    text = ""
    finish: str | None = None
    if candidates:
        first = candidates[0]
        finish = first.get("finishReason")
        parts = (first.get("content") or {}).get("parts") or []
        text = "".join(part.get("text", "") for part in parts)

    meta = body.get("usageMetadata") or {}
    return LLMResponse(
        text=text,
        model=model,
        stop_reason=finish,
        usage=LLMUsage(
            input_tokens=int(meta.get("promptTokenCount", 0) or 0),
            output_tokens=int(meta.get("candidatesTokenCount", 0) or 0),
        ),
    )
