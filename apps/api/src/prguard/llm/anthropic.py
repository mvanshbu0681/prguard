"""The live Anthropic provider — the one module in this build that talks to a paid API.

It is deliberately thin. Everything interesting happens around it: ``structured.py`` validates
and repairs the response, ``circuit.py`` decides whether this model may be called at all, and the
pipeline decides what a failure means. This module's whole job is to turn an
:class:`~prguard.llm.client.LLMClient` call into one HTTP request and turn every failure mode
into an :class:`~prguard.llm.client.LLMError` that the layers above already know how to record.

Three decisions worth stating:

* **It does not retry.** The SDK's own retry loop is switched off (``max_retries=0``) because
  ``LLMClient.complete`` is documented not to retry silently: a hidden retry hides a failure from
  the circuit breaker, which is exactly the signal the breaker exists to count. One logical call
  is one attempt; ``structured.py`` owns the single repair, ``circuit.py`` owns the failback.
* **The SDK client is built lazily.** Constructing this class must be free and must never fail —
  ``build_client`` runs at startup, in tests, and in environments with no credentials. Anything
  that can raise for a missing key raises on the first call, where it belongs.
* **The system prompt is cached.** A specialist's system prompt — ``SHARED.md`` plus its own
  agent file — is identical on every run, so it is marked ``cache_control: ephemeral``. It is the
  stable prefix, which is where a breakpoint belongs; the per-pull-request material sits after it
  in the user turn. Cheapest cost lever available (§3 Tier 3: 85.7% cache hit rate in
  production) and it changes no behaviour.

**Deviation from spec §11.2 assumption 3, forced by the API:** the Messages API no longer accepts
sampling parameters (``temperature``, ``top_p``, ``top_k``) on the Claude 5 family — sending
``temperature`` to ``claude-sonnet-5`` or ``claude-opus-5`` is a 400, and the SDK does not expose
the argument. ``LLM_TEMPERATURE`` stays on the :class:`~prguard.llm.client.LLMClient` protocol
because it is config, it is asserted on in the fake, and another provider may honour it — but this
client does not forward it. Determinism on these models comes from the schema, not from sampling.

Spec §4.3, §4.8 (``ANTHROPIC_API_KEY``, model ids), §8.1 (what "down" means). Ownership: T8.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, Final

from prguard.llm.client import LLMError, LLMResponse, LLMUsage, Message

if TYPE_CHECKING:  # pragma: no cover — import cost is paid only on the live path
    from anthropic import AsyncAnthropic
    from anthropic.types import MessageParam, TextBlockParam

#: No SDK-level retries: a silent retry is a failure the circuit breaker never gets to count.
DEFAULT_MAX_RETRIES: Final[int] = 0

#: Generous, because a full review's coordinator call is a large prompt and a large answer.
DEFAULT_TIMEOUT_SECONDS: Final[float] = 120.0


class AnthropicUnavailableError(LLMError):
    """The API refused, timed out, or could not be reached. Carries what §8.1 needs to decide."""

    def __init__(self, message: str, *, status_code: int | None = None, retryable: bool) -> None:
        self.status_code = status_code
        self.retryable = retryable
        super().__init__(message)


class AnthropicConfigurationError(LLMError):
    """No usable credentials. Raised on first call, never at construction."""


class AnthropicClient:
    """The real provider (spec §4.3 ``llm/client.py`` → ``AnthropicClient``).

    ``sdk_client`` exists so this class is testable without a network: pass anything with an
    ``AsyncAnthropic``-shaped ``messages.create``. Nothing in the default test run constructs a
    real one.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        enable_prompt_caching: bool = True,
        sdk_client: AsyncAnthropic | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        self.enable_prompt_caching = enable_prompt_caching
        self._sdk_client = sdk_client

    def _client(self) -> AsyncAnthropic:
        """The SDK client, built on first use so construction stays free and offline-safe."""
        if self._sdk_client is None:
            try:
                from anthropic import AsyncAnthropic
            except ImportError as error:  # pragma: no cover — declared dependency
                raise AnthropicConfigurationError(f"the anthropic SDK is not installed: {error}")
            options: dict[str, Any] = {
                "timeout": self.timeout,
                "max_retries": self.max_retries,
            }
            if self.api_key is not None:
                options["api_key"] = self.api_key
            if self.base_url is not None:
                options["base_url"] = self.base_url
            try:
                self._sdk_client = AsyncAnthropic(**options)
            except Exception as error:
                raise AnthropicConfigurationError(
                    "could not construct the Anthropic client; set ANTHROPIC_API_KEY, or use "
                    f"LLM_PROVIDER=fake to run offline ({error})"
                ) from error
        return self._sdk_client

    def _system(self, system: str) -> str | list[TextBlockParam]:
        """The system prompt, marked cacheable when caching is on."""
        if not self.enable_prompt_caching:
            return system
        return [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[Message],
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        """One request, one attempt. Every failure arrives as an :class:`LLMError` subclass.

        ``temperature`` is accepted to satisfy the protocol and deliberately not sent — see the
        module docstring: the Claude 5 family rejects sampling parameters outright.
        """
        client = self._client()
        payload: list[MessageParam] = [
            {"role": item.role, "content": item.content} for item in messages
        ]
        try:
            message = await client.messages.create(
                model=model,
                system=self._system(system),
                messages=payload,
                max_tokens=max_tokens,
            )
        except Exception as error:
            raise _as_llm_error(error) from error

        return LLMResponse(
            text=_text_of(message),
            model=getattr(message, "model", model),
            stop_reason=getattr(message, "stop_reason", None),
            usage=_usage_of(message),
        )

    async def aclose(self) -> None:
        """Release the underlying HTTP connections. Safe to call when nothing was built."""
        if self._sdk_client is not None:
            await self._sdk_client.close()


def _text_of(message: Any) -> str:
    """Join the text blocks. A response with no text is an empty string, not an exception —
    ``structured.py`` already treats that as a non-JSON response and repairs it once."""
    blocks = getattr(message, "content", None) or []
    return "".join(
        getattr(block, "text", "") for block in blocks if getattr(block, "type", "") == "text"
    )


def _usage_of(message: Any) -> LLMUsage:
    usage = getattr(message, "usage", None)
    if usage is None:
        return LLMUsage()
    return LLMUsage(
        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
    )


def _as_llm_error(error: Exception) -> LLMError:
    """Map an SDK exception onto our vocabulary, without importing the SDK to do it.

    Matching on the class name rather than on ``isinstance`` keeps the offline path free of an
    SDK import and keeps this function testable with a stub that raises look-alikes.
    """
    if isinstance(error, LLMError):
        return error

    name = type(error).__name__
    status = getattr(error, "status_code", None)
    status_code = int(status) if isinstance(status, int) else None
    retryable = (
        name in {"APIConnectionError", "APITimeoutError", "APIConnectionTimeoutError"}
        or status_code == 429
        or (status_code is not None and status_code >= 500)
    )
    if status_code in {401, 403}:
        return AnthropicConfigurationError(f"{name}: {error}")
    return AnthropicUnavailableError(
        f"{name}: {error}", status_code=status_code, retryable=retryable
    )
