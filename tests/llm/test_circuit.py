"""Per-model circuit breaker and the Opus → Sonnet failback chain — spec §8.1, §3 Tier 3.

Seven concurrent model calls per review guarantee that we meet every provider outage, so the
substrate has to have an opinion about one: five failures inside sixty seconds take a model out
for two minutes, and the call lands on the next model in ``MODEL_FAILBACK_CHAIN`` instead of on
the floor. Time is injected, so none of this sleeps.
"""

from __future__ import annotations

import asyncio

import pytest

from prguard.llm.circuit import (
    DEFAULT_FAILURE_THRESHOLD,
    DEFAULT_OPEN_SECONDS,
    DEFAULT_WINDOW_SECONDS,
    CircuitBreaker,
    CircuitOpenError,
    FailbackClient,
    failback_candidates,
)
from prguard.llm.client import FakeLLMClient, LLMError, LLMResponse, Message

OPUS = "claude-opus-5"
SONNET = "claude-sonnet-5"
CHAIN = (OPUS, SONNET)


class FakeClock:
    """A monotonic clock the test drives by hand."""

    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class ExplodingClient:
    """An ``LLMClient`` that fails for the named models and answers for the rest."""

    def __init__(self, *, failing: set[str], error: Exception | None = None) -> None:
        self.failing = failing
        self.error = error or LLMError("upstream 529 overloaded")
        self.models: list[str] = []

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[Message] | tuple[Message, ...],
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        self.models.append(model)
        if model in self.failing:
            raise self.error
        return LLMResponse(text="{}", model=model, stop_reason="end_turn")


def breaker(clock: FakeClock) -> CircuitBreaker:
    return CircuitBreaker(clock=clock)


def fail(circuit: CircuitBreaker, model: str, times: int) -> None:
    for _ in range(times):
        circuit.record_failure(model)


async def call(client: FailbackClient, *, model: str = OPUS) -> LLMResponse:
    return await client.complete(
        model=model,
        system="You are the coordinator.",
        messages=[Message(role="user", content="merge these findings")],
        max_tokens=8000,
        temperature=0.0,
    )


# ---------------------------------------------------------------------------
# Opening: 5 failures / 60 s (§8.1)
# ---------------------------------------------------------------------------


def test_four_failures_leave_the_circuit_closed() -> None:
    circuit = breaker(FakeClock())
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD - 1)

    assert circuit.state(OPUS) == "closed"
    assert circuit.allow(OPUS) is True


def test_five_failures_in_the_window_open_the_circuit() -> None:
    circuit = breaker(FakeClock())
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)

    assert circuit.state(OPUS) == "open"
    assert circuit.allow(OPUS) is False


def test_failures_older_than_the_window_do_not_count() -> None:
    clock = FakeClock()
    circuit = breaker(clock)
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD - 1)
    clock.advance(DEFAULT_WINDOW_SECONDS + 1)
    circuit.record_failure(OPUS)

    assert circuit.state(OPUS) == "closed"


def test_a_success_clears_the_failure_count() -> None:
    circuit = breaker(FakeClock())
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD - 1)
    circuit.record_success(OPUS)
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD - 1)

    assert circuit.state(OPUS) == "closed"


def test_breakers_are_per_model() -> None:
    circuit = breaker(FakeClock())
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)

    assert circuit.state(OPUS) == "open"
    assert circuit.state(SONNET) == "closed"


# ---------------------------------------------------------------------------
# Recovering: open for 120 s, then one probe
# ---------------------------------------------------------------------------


def test_the_circuit_stays_open_for_the_whole_window() -> None:
    clock = FakeClock()
    circuit = breaker(clock)
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)

    clock.advance(DEFAULT_OPEN_SECONDS - 1)
    assert circuit.state(OPUS) == "open"
    assert circuit.retry_after(OPUS) == pytest.approx(1.0)


def test_a_successful_probe_closes_the_circuit() -> None:
    clock = FakeClock()
    circuit = breaker(clock)
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)
    clock.advance(DEFAULT_OPEN_SECONDS)

    assert circuit.state(OPUS) == "half_open"
    assert circuit.allow(OPUS) is True
    circuit.record_success(OPUS)
    assert circuit.state(OPUS) == "closed"
    assert circuit.allow(OPUS) is True


def test_a_failed_probe_reopens_the_circuit_for_another_window() -> None:
    clock = FakeClock()
    circuit = breaker(clock)
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)
    clock.advance(DEFAULT_OPEN_SECONDS)
    assert circuit.allow(OPUS) is True

    circuit.record_failure(OPUS)
    assert circuit.state(OPUS) == "open"
    assert circuit.retry_after(OPUS) == pytest.approx(DEFAULT_OPEN_SECONDS)


def test_half_open_admits_exactly_one_probe() -> None:
    clock = FakeClock()
    circuit = breaker(clock)
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)
    clock.advance(DEFAULT_OPEN_SECONDS)

    assert circuit.allow(OPUS) is True
    assert circuit.allow(OPUS) is False


# ---------------------------------------------------------------------------
# The failback chain — §4.8 MODEL_FAILBACK_CHAIN, §3 Tier 3
# ---------------------------------------------------------------------------


def test_candidates_are_the_model_then_its_successors() -> None:
    assert failback_candidates(OPUS, CHAIN) == (OPUS, SONNET)


def test_the_last_model_in_the_chain_has_nowhere_to_fall_back_to() -> None:
    """Sonnet is the floor: a specialist call must not be silently promoted to Opus."""
    assert failback_candidates(SONNET, CHAIN) == (SONNET,)


def test_a_model_outside_the_chain_falls_back_to_the_whole_chain() -> None:
    assert failback_candidates("claude-haiku-5", CHAIN) == ("claude-haiku-5", OPUS, SONNET)


async def test_an_open_circuit_routes_to_the_next_model() -> None:
    clock = FakeClock()
    circuit = breaker(clock)
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)
    inner = ExplodingClient(failing=set())
    client = FailbackClient(inner, chain=CHAIN, breaker=circuit)

    response = await call(client, model=OPUS)

    assert inner.models == [SONNET]
    assert response.model == SONNET


async def test_a_failure_falls_back_within_the_same_call() -> None:
    circuit = breaker(FakeClock())
    inner = ExplodingClient(failing={OPUS})
    client = FailbackClient(inner, chain=CHAIN, breaker=circuit)

    response = await call(client, model=OPUS)

    assert inner.models == [OPUS, SONNET]
    assert response.model == SONNET
    assert circuit.failure_count(OPUS) == 1
    assert circuit.failure_count(SONNET) == 0


async def test_every_candidate_open_raises_without_calling_the_provider() -> None:
    circuit = breaker(FakeClock())
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD)
    fail(circuit, SONNET, DEFAULT_FAILURE_THRESHOLD)
    inner = ExplodingClient(failing=set())
    client = FailbackClient(inner, chain=CHAIN, breaker=circuit)

    with pytest.raises(CircuitOpenError) as excinfo:
        await call(client, model=OPUS)

    assert inner.models == []
    assert excinfo.value.models == (OPUS, SONNET)
    assert excinfo.value.retry_after == pytest.approx(DEFAULT_OPEN_SECONDS)


async def test_the_last_error_surfaces_when_every_candidate_fails() -> None:
    circuit = breaker(FakeClock())
    inner = ExplodingClient(failing={OPUS, SONNET}, error=LLMError("upstream 500"))
    client = FailbackClient(inner, chain=CHAIN, breaker=circuit)

    with pytest.raises(LLMError, match="upstream 500"):
        await call(client, model=OPUS)

    assert inner.models == [OPUS, SONNET]


async def test_a_cancellation_is_not_recorded_as_a_provider_failure() -> None:
    """A cancelled run (E3 supersede) must not spend the breaker's failure budget."""
    circuit = breaker(FakeClock())
    inner = ExplodingClient(failing={OPUS}, error=asyncio.CancelledError())
    client = FailbackClient(inner, chain=CHAIN, breaker=circuit)

    with pytest.raises(asyncio.CancelledError):
        await call(client, model=OPUS)

    assert inner.models == [OPUS]
    assert circuit.failure_count(OPUS) == 0


async def test_a_healthy_call_records_a_success() -> None:
    circuit = breaker(FakeClock())
    fail(circuit, OPUS, DEFAULT_FAILURE_THRESHOLD - 1)
    client = FailbackClient(FakeLLMClient(default="{}"), chain=CHAIN, breaker=circuit)

    await call(client, model=OPUS)

    assert circuit.failure_count(OPUS) == 0


async def test_the_wrapper_passes_sampling_through_untouched() -> None:
    """Model routing is config (§4.8); the breaker may re-route but never re-tune."""
    circuit = breaker(FakeClock())
    inner = FakeLLMClient(default="{}")
    client = FailbackClient(inner, chain=CHAIN, breaker=circuit)

    await client.complete(
        model=OPUS,
        system="sys",
        messages=[Message(role="user", content="prompt")],
        max_tokens=1234,
        temperature=0.7,
    )

    assert inner.calls[0].max_tokens == 1234
    assert inner.calls[0].temperature == pytest.approx(0.7)
    assert inner.calls[0].system == "sys"
