"""The live Anthropic provider — spec §4.3, §4.8, §8.1.

Every test here runs offline against a stub SDK object, except the one marked
``requires_network``, which is deselected by default (``pyproject.toml`` addopts) and exists so
there is a way to prove the wiring against the real API before a demo without putting a paid
call inside VERIFY.

What is worth pinning: the configured model and sampling reach the request untouched, the system
prompt is sent as a cacheable block, and every provider failure arrives as an ``LLMError``
subclass — because ``circuit.py`` counts those and the pipeline records them.
"""

from __future__ import annotations

import os
from typing import Any

import pytest

from prguard.llm.anthropic import (
    AnthropicClient,
    AnthropicConfigurationError,
    AnthropicUnavailableError,
)
from prguard.llm.client import LLMError, Message

SYSTEM = "You are the bugs specialist. Return JSON."
PROMPT = "Review this diff: app/billing.py"


class StubBlock:
    def __init__(self, text: str, kind: str = "text") -> None:
        self.text = text
        self.type = kind


class StubUsage:
    def __init__(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class StubMessage:
    def __init__(self, text: str) -> None:
        self.content = [StubBlock(text)]
        self.model = "claude-sonnet-5"
        self.stop_reason = "end_turn"
        self.usage = StubUsage(1200, 340)


class StubMessages:
    def __init__(self, *, reply: str = '{"findings": []}', error: Exception | None = None) -> None:
        self.reply = reply
        self.error = error
        self.kwargs: dict[str, Any] = {}

    async def create(self, **kwargs: Any) -> StubMessage:
        self.kwargs = kwargs
        if self.error is not None:
            raise self.error
        return StubMessage(self.reply)


class StubSDK:
    def __init__(self, messages: StubMessages) -> None:
        self.messages = messages
        self.closed = False

    async def close(self) -> None:
        self.closed = True


def client_over(messages: StubMessages, **options: Any) -> AnthropicClient:
    return AnthropicClient(api_key="sk-ant-test", sdk_client=StubSDK(messages), **options)  # type: ignore[arg-type]


async def complete(client: AnthropicClient, *, model: str = "claude-sonnet-5") -> Any:
    return await client.complete(
        model=model,
        system=SYSTEM,
        messages=[Message(role="user", content=PROMPT)],
        max_tokens=8000,
        temperature=0.0,
    )


# ---------------------------------------------------------------------------
# The request we actually send
# ---------------------------------------------------------------------------


async def test_the_configured_model_and_budget_reach_the_request() -> None:
    messages = StubMessages()

    await complete(client_over(messages), model="claude-opus-5")

    assert messages.kwargs["model"] == "claude-opus-5"
    assert messages.kwargs["max_tokens"] == 8000
    assert messages.kwargs["messages"] == [{"role": "user", "content": PROMPT}]


async def test_sampling_parameters_are_not_sent() -> None:
    """The Claude 5 family rejects `temperature`/`top_p`/`top_k` with a 400.

    `LLM_TEMPERATURE` stays on the protocol — it is config, and another provider may honour it —
    but forwarding it here would turn every live review into a bad request.
    """
    messages = StubMessages()

    await complete(client_over(messages))

    assert "temperature" not in messages.kwargs
    assert "top_p" not in messages.kwargs
    assert "top_k" not in messages.kwargs


async def test_the_system_prompt_is_sent_as_a_cacheable_block() -> None:
    """§3 Tier 3: one assembled system prompt per run, reused by every specialist."""
    messages = StubMessages()

    await complete(client_over(messages))

    assert messages.kwargs["system"] == [
        {"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}
    ]


async def test_caching_can_be_switched_off_without_changing_the_prompt() -> None:
    messages = StubMessages()

    await complete(client_over(messages, enable_prompt_caching=False))

    assert messages.kwargs["system"] == SYSTEM


# ---------------------------------------------------------------------------
# The response we hand back
# ---------------------------------------------------------------------------


async def test_the_text_blocks_are_joined_and_the_usage_is_carried() -> None:
    response = await complete(client_over(StubMessages(reply='{"findings": []}')))

    assert response.text == '{"findings": []}'
    assert response.model == "claude-sonnet-5"
    assert response.stop_reason == "end_turn"
    assert response.usage.input_tokens == 1200
    assert response.usage.output_tokens == 340


async def test_an_answer_with_no_text_is_an_empty_string_not_an_exception() -> None:
    """`structured.py` already treats an empty answer as non-JSON and repairs it once."""

    class Empty(StubMessage):
        def __init__(self) -> None:
            super().__init__("")
            self.content = []

    class EmptyMessages(StubMessages):
        async def create(self, **kwargs: Any) -> Any:
            self.kwargs = kwargs
            return Empty()

    response = await complete(client_over(EmptyMessages()))

    assert response.text == ""


# ---------------------------------------------------------------------------
# §8.1 — every failure arrives as an LLMError the breaker can count
# ---------------------------------------------------------------------------


class FakeStatusError(Exception):
    def __init__(self, message: str, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(message)


class APIConnectionError(Exception):
    """Named to match the SDK's class, which is what the mapper keys on."""


@pytest.mark.parametrize("status_code", [429, 500, 529])
async def test_a_retryable_status_is_typed_as_retryable(status_code: int) -> None:
    messages = StubMessages(error=FakeStatusError("overloaded", status_code))

    with pytest.raises(AnthropicUnavailableError) as excinfo:
        await complete(client_over(messages))

    assert excinfo.value.status_code == status_code
    assert excinfo.value.retryable is True


async def test_a_bad_request_is_not_retryable() -> None:
    messages = StubMessages(error=FakeStatusError("max_tokens too large", 400))

    with pytest.raises(AnthropicUnavailableError) as excinfo:
        await complete(client_over(messages))

    assert excinfo.value.retryable is False


async def test_a_rejected_key_is_a_configuration_error() -> None:
    messages = StubMessages(error=FakeStatusError("invalid x-api-key", 401))

    with pytest.raises(AnthropicConfigurationError):
        await complete(client_over(messages))


async def test_a_connection_failure_is_retryable() -> None:
    messages = StubMessages(error=APIConnectionError("connection reset"))

    with pytest.raises(AnthropicUnavailableError) as excinfo:
        await complete(client_over(messages))

    assert excinfo.value.retryable is True
    assert excinfo.value.status_code is None


async def test_every_provider_failure_is_an_llm_error() -> None:
    """The one property `circuit.py` and the specialist runner depend on."""
    messages = StubMessages(error=RuntimeError("something exotic"))

    with pytest.raises(LLMError):
        await complete(client_over(messages))


async def test_closing_is_safe_when_nothing_was_ever_built() -> None:
    await AnthropicClient(api_key="sk-ant-test").aclose()


# ---------------------------------------------------------------------------
# The live path — deselected by default
# ---------------------------------------------------------------------------


@pytest.mark.requires_network
async def test_a_live_call_returns_text() -> None:  # pragma: no cover — opt-in
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        pytest.skip("ANTHROPIC_API_KEY is not set")

    client = AnthropicClient(api_key=api_key)
    try:
        response = await client.complete(
            model="claude-sonnet-5",
            system="Reply with the single JSON value {} and nothing else.",
            messages=[Message(role="user", content="{}")],
            max_tokens=16,
            temperature=0.0,
        )
    finally:
        await client.aclose()

    assert response.text
