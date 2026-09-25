"""The live Gemini provider, exercised entirely offline through an injected transport."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from prguard.llm.client import Message, build_client
from prguard.llm.gemini import GeminiClient, GeminiUnavailableError


def _transport(
    handler: Any,
) -> tuple[httpx.MockTransport, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def _handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    return httpx.MockTransport(_handle), seen


def _ok(body: dict[str, Any]) -> Any:
    return lambda _request: httpx.Response(200, json=body)


_GOOD = {
    "candidates": [
        {
            "content": {"parts": [{"text": '{"findings": []}'}], "role": "model"},
            "finishReason": "STOP",
        }
    ],
    "usageMetadata": {"promptTokenCount": 1200, "candidatesTokenCount": 40},
}


@pytest.mark.asyncio
async def test_request_carries_system_contents_and_generation_config() -> None:
    transport, seen = _transport(_ok(_GOOD))
    client = GeminiClient(api_key="k", transport=transport)

    await client.complete(
        model="gemini-3.5-flash",
        system="you are a reviewer",
        messages=[Message(role="user", content="review this")],
        max_tokens=4096,
        temperature=0.0,
    )

    assert len(seen) == 1
    request = seen[0]
    assert request.url.path.endswith("/models/gemini-3.5-flash:generateContent")
    assert request.headers["x-goog-api-key"] == "k"
    body = json.loads(request.content)
    assert body["systemInstruction"]["parts"][0]["text"] == "you are a reviewer"
    assert body["contents"] == [{"role": "user", "parts": [{"text": "review this"}]}]
    assert body["generationConfig"]["maxOutputTokens"] == 4096


@pytest.mark.asyncio
async def test_temperature_is_forwarded() -> None:
    """The opposite of the Anthropic client, deliberately.

    Claude 5 rejects sampling parameters, so that client drops `temperature` on the floor.
    Gemini accepts it, and `LLM_TEMPERATURE` defaults to 0.0 for review determinism — if this
    silently stopped being sent, every review would become nondeterministic with no signal.
    """
    transport, seen = _transport(_ok(_GOOD))
    client = GeminiClient(api_key="k", transport=transport)

    await client.complete(
        model="gemini-3.5-flash",
        system="s",
        messages=[Message(role="user", content="u")],
        max_tokens=10,
        temperature=0.0,
    )

    assert json.loads(seen[0].content)["generationConfig"]["temperature"] == 0.0


@pytest.mark.asyncio
async def test_response_text_stop_reason_and_usage_are_parsed() -> None:
    transport, _ = _transport(_ok(_GOOD))
    client = GeminiClient(api_key="k", transport=transport)

    reply = await client.complete(
        model="gemini-3.5-flash",
        system="s",
        messages=[Message(role="user", content="u")],
        max_tokens=10,
        temperature=0.0,
    )

    assert reply.text == '{"findings": []}'
    assert reply.model == "gemini-3.5-flash"
    assert reply.stop_reason == "STOP"
    assert reply.usage.input_tokens == 1200
    assert reply.usage.output_tokens == 40


@pytest.mark.asyncio
async def test_an_assistant_turn_is_sent_as_the_model_role() -> None:
    """Gemini names the assistant turn `model`; sending `assistant` is a 400."""
    transport, seen = _transport(_ok(_GOOD))
    client = GeminiClient(api_key="k", transport=transport)

    await client.complete(
        model="gemini-3.5-flash",
        system="s",
        messages=[
            Message(role="user", content="first"),
            Message(role="assistant", content="prior answer"),
        ],
        max_tokens=10,
        temperature=0.0,
    )

    roles = [part["role"] for part in json.loads(seen[0].content)["contents"]]
    assert roles == ["user", "model"]


@pytest.mark.asyncio
async def test_a_blocked_candidate_is_empty_output_not_a_crash() -> None:
    """A safety block or MAX_TOKENS yields a candidate with no parts.

    structured.py already treats an unparseable answer as a drop with a reason, so the right
    behaviour is to hand it back with the finishReason that makes it diagnosable.
    """
    transport, _ = _transport(_ok({"candidates": [{"finishReason": "SAFETY"}]}))
    client = GeminiClient(api_key="k", transport=transport)

    reply = await client.complete(
        model="gemini-3.5-flash",
        system="s",
        messages=[Message(role="user", content="u")],
        max_tokens=10,
        temperature=0.0,
    )

    assert reply.text == ""
    assert reply.stop_reason == "SAFETY"


@pytest.mark.asyncio
async def test_a_missing_key_fails_before_any_request_is_made() -> None:
    transport, seen = _transport(_ok(_GOOD))
    client = GeminiClient(api_key=None, transport=transport)

    with pytest.raises(GeminiUnavailableError) as caught:
        await client.complete(
            model="gemini-3.5-flash",
            system="s",
            messages=[Message(role="user", content="u")],
            max_tokens=10,
            temperature=0.0,
        )

    assert caught.value.retryable is False
    assert seen == []


@pytest.mark.parametrize(
    ("status", "retryable"),
    [(429, True), (500, True), (503, True), (400, False), (401, False), (404, False)],
)
@pytest.mark.asyncio
async def test_http_errors_carry_the_right_retryable_verdict(status: int, retryable: bool) -> None:
    """§8.1: the circuit breaker's failback only makes sense for failures worth retrying."""
    transport, _ = _transport(lambda _r: httpx.Response(status, json={"error": "nope"}))
    client = GeminiClient(api_key="k", transport=transport)

    with pytest.raises(GeminiUnavailableError) as caught:
        await client.complete(
            model="gemini-3.5-flash",
            system="s",
            messages=[Message(role="user", content="u")],
            max_tokens=10,
            temperature=0.0,
        )

    assert caught.value.status_code == status
    assert caught.value.retryable is retryable


@pytest.mark.asyncio
async def test_a_timeout_is_retryable() -> None:
    def _boom(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow")

    transport, _ = _transport(_boom)
    client = GeminiClient(api_key="k", transport=transport)

    with pytest.raises(GeminiUnavailableError) as caught:
        await client.complete(
            model="gemini-3.5-flash",
            system="s",
            messages=[Message(role="user", content="u")],
            max_tokens=10,
            temperature=0.0,
        )

    assert caught.value.retryable is True


def test_build_client_resolves_gemini_and_opens_no_connection() -> None:
    client = build_client(provider="gemini", api_key="k")
    assert isinstance(client, GeminiClient)


def test_build_client_still_rejects_an_unknown_provider() -> None:
    from prguard.llm.client import UnknownProviderError

    with pytest.raises(UnknownProviderError) as caught:
        build_client(provider="llama", api_key=None)
    assert "gemini" in str(caught.value)
