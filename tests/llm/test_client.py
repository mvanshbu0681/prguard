"""The LLM substrate: the protocol, the fake provider, and the provider factory.

``FakeLLMClient`` is load-bearing for the whole test suite — it is the reason VERIFY passes with
the network off (spec §9.1). Everything here runs with zero API calls by construction.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from prguard.llm.client import (
    AnthropicClient,
    FakeLLMClient,
    FixtureNotFoundError,
    LLMResponse,
    Message,
    NoFakeResponseError,
    UnknownProviderError,
    build_client,
)

SYSTEM = "You are the bugs specialist. Return JSON."
PROMPT = "Review this diff: app/billing.py"


async def complete(client: FakeLLMClient, *, system: str = SYSTEM, prompt: str = PROMPT) -> str:
    response = await client.complete(
        model="claude-sonnet-5",
        system=system,
        messages=[Message(role="user", content=prompt)],
        max_tokens=8000,
        temperature=0.0,
    )
    return response.text


@pytest.fixture
def fixture_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "llm"
    directory.mkdir()
    (directory / "bugs.json").write_text(
        json.dumps({"specialist": "bugs", "model": "claude-sonnet-5", "findings": []}),
        encoding="utf-8",
    )
    (directory / "security.json").write_text(
        json.dumps({"specialist": "security", "model": "claude-sonnet-5", "findings": []}),
        encoding="utf-8",
    )
    (directory / "prose.txt").write_text("I think this code looks fine!", encoding="utf-8")
    return directory


# ---------------------------------------------------------------------------
# The fake provider
# ---------------------------------------------------------------------------


async def test_script_is_consumed_in_order() -> None:
    client = FakeLLMClient(script=["first", "second"])
    assert await complete(client) == "first"
    assert await complete(client) == "second"


async def test_every_call_is_recorded_for_assertions() -> None:
    client = FakeLLMClient(default="ok")
    await complete(client, prompt="one")
    await complete(client, prompt="two")

    assert len(client.calls) == 2
    assert [call.prompt for call in client.calls] == ["one", "two"]
    assert client.calls[0].model == "claude-sonnet-5"
    assert client.calls[0].temperature == 0.0
    assert client.calls[0].max_tokens == 8000
    assert client.calls[0].system == SYSTEM


async def test_routes_dispatch_on_prompt_content() -> None:
    """Specialists run under ``asyncio.gather``, so order is not a usable key — content is."""
    client = FakeLLMClient(routes={"bugs specialist": "BUGS", "security specialist": "SEC"})
    assert await complete(client, system="You are the security specialist.") == "SEC"
    assert await complete(client, system="You are the bugs specialist.") == "BUGS"


async def test_longest_matching_route_wins() -> None:
    client = FakeLLMClient(routes={"bugs": "SHORT", "bugs specialist": "LONG"})
    assert await complete(client) == "LONG"


async def test_route_matches_the_user_prompt_too() -> None:
    client = FakeLLMClient(routes={"app/billing.py": "BILLING"})
    assert await complete(client) == "BILLING"


async def test_script_takes_precedence_then_routes_then_default() -> None:
    client = FakeLLMClient(script=["SCRIPTED"], routes={"bugs": "ROUTED"}, default="DEFAULT")
    assert await complete(client) == "SCRIPTED"
    assert await complete(client) == "ROUTED"
    assert await complete(client, system="unrelated", prompt="unrelated") == "DEFAULT"


async def test_unmatched_call_raises_instead_of_inventing_an_answer() -> None:
    client = FakeLLMClient(routes={"bugs": "ROUTED"})
    with pytest.raises(NoFakeResponseError) as excinfo:
        await complete(client, system="unrelated", prompt="unrelated")
    assert "bugs" in str(excinfo.value)


async def test_a_full_llm_response_can_be_scripted() -> None:
    scripted = LLMResponse(text="{}", model="claude-opus-5", stop_reason="max_tokens")
    client = FakeLLMClient(script=[scripted])
    response = await client.complete(
        model="claude-sonnet-5",
        system=SYSTEM,
        messages=[Message(role="user", content=PROMPT)],
        max_tokens=100,
        temperature=0.0,
    )
    assert response is scripted
    assert response.stop_reason == "max_tokens"


async def test_response_echoes_the_requested_model_by_default() -> None:
    client = FakeLLMClient(default="ok")
    response = await client.complete(
        model="claude-opus-5",
        system=SYSTEM,
        messages=[Message(role="user", content=PROMPT)],
        max_tokens=10,
        temperature=0.0,
    )
    assert response.model == "claude-opus-5"


# ---------------------------------------------------------------------------
# Recorded fixtures
# ---------------------------------------------------------------------------


async def test_fixtures_are_registered_as_routes_by_file_stem(fixture_dir: Path) -> None:
    client = FakeLLMClient.from_fixtures(fixture_dir)
    text = await complete(client, system="You are the security specialist.")
    assert json.loads(text)["specialist"] == "security"


async def test_fixture_contents_are_returned_verbatim(fixture_dir: Path) -> None:
    """A malformed-JSON fixture must reach the parser malformed, not be re-serialised."""
    (fixture_dir / "broken.json").write_text('{"specialist": "bugs",', encoding="utf-8")
    client = FakeLLMClient.from_fixtures(fixture_dir)
    assert await complete(client, prompt="use the broken fixture") == '{"specialist": "bugs",'


async def test_fixtures_can_be_scripted_by_name(fixture_dir: Path) -> None:
    client = FakeLLMClient.from_fixtures(fixture_dir, script=["prose", "bugs"])
    assert await complete(client) == "I think this code looks fine!"
    assert json.loads(await complete(client))["specialist"] == "bugs"


def test_a_missing_fixture_name_fails_loudly_at_construction(fixture_dir: Path) -> None:
    with pytest.raises(FixtureNotFoundError) as excinfo:
        FakeLLMClient.from_fixtures(fixture_dir, script=["does_not_exist"])
    assert "does_not_exist" in str(excinfo.value)


def test_a_missing_fixture_directory_fails_loudly(tmp_path: Path) -> None:
    with pytest.raises(FixtureNotFoundError):
        FakeLLMClient.from_fixtures(tmp_path / "nope")


async def test_named_default_fixture_answers_anything(fixture_dir: Path) -> None:
    (fixture_dir / "default.json").write_text('{"findings": []}', encoding="utf-8")
    client = FakeLLMClient.from_fixtures(fixture_dir)
    assert await complete(client, system="anything", prompt="at all") == '{"findings": []}'


# ---------------------------------------------------------------------------
# The provider factory — LLM_PROVIDER is one config line (§4.8)
# ---------------------------------------------------------------------------


def test_build_client_returns_the_fake_provider() -> None:
    assert isinstance(build_client(provider="fake"), FakeLLMClient)


def test_build_client_wires_the_fixture_directory(fixture_dir: Path) -> None:
    client = build_client(provider="fake", fixture_dir=fixture_dir)
    assert isinstance(client, FakeLLMClient)
    assert "bugs" in client.routes


def test_build_client_returns_the_anthropic_provider() -> None:
    assert isinstance(build_client(provider="anthropic", api_key="sk-ant-test"), AnthropicClient)


def test_build_client_is_case_insensitive() -> None:
    assert isinstance(build_client(provider="FAKE"), FakeLLMClient)


def test_build_client_rejects_an_unknown_provider() -> None:
    with pytest.raises(UnknownProviderError) as excinfo:
        build_client(provider="openai")
    assert "openai" in str(excinfo.value)


# ---------------------------------------------------------------------------
# The real provider is a typed stub until T8 lands
# ---------------------------------------------------------------------------


async def test_anthropic_client_is_an_explicit_stub() -> None:
    client = AnthropicClient(api_key="sk-ant-test")
    with pytest.raises(NotImplementedError):
        await client.complete(
            model="claude-sonnet-5",
            system=SYSTEM,
            messages=[Message(role="user", content=PROMPT)],
            max_tokens=8000,
            temperature=0.0,
        )
