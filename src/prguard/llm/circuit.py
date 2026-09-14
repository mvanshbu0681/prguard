"""Per-model circuit breaker and the model failback chain — spec §8.1, §3 Tier 3.

A review fires several concurrent model calls; Cloudflare's report is blunt that at that
concurrency you meet every provider incident there is. Two mechanisms answer that, and both
belong to the substrate rather than to any caller:

* **A breaker per model.** Five failures inside sixty seconds take that model out of rotation
  for two minutes (§8.1). Per *model*, not per client — Opus being overloaded says nothing
  about Sonnet, and a global breaker would take the whole review down with it.
* **A failback chain.** ``MODEL_FAILBACK_CHAIN`` (§4.8, default Opus → Sonnet) names the
  models a call may land on when its first choice is out. Falling back *down* the chain is a
  degradation we accept; falling back *up* it would silently spend Opus money on a Sonnet
  call, so :func:`failback_candidates` only ever walks forwards.

:class:`FailbackClient` is an ``LLMClient``, so it wraps the real provider and everything
above it — :func:`~prguard.llm.structured.complete_structured`, the specialists, the
coordinator — keeps calling ``complete`` and needs to know none of this.

Ownership: T8. Wiring (which client gets wrapped, with which chain) belongs to the pipeline.
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Final, Literal

from prguard.llm.client import LLMClient, LLMError, LLMResponse, Message

#: Spec §8.1 — five failures inside this window open the breaker.
DEFAULT_FAILURE_THRESHOLD: Final[int] = 5

#: Spec §8.1 — failures older than this no longer count towards the threshold.
DEFAULT_WINDOW_SECONDS: Final[float] = 60.0

#: Spec §8.1 — how long an open breaker refuses calls before admitting a probe.
DEFAULT_OPEN_SECONDS: Final[float] = 120.0

CircuitState = Literal["closed", "open", "half_open"]


class CircuitOpenError(LLMError):
    """Every model this call could have used is out of rotation. Nothing was sent."""

    def __init__(self, *, models: Sequence[str], retry_after: float) -> None:
        self.models: tuple[str, ...] = tuple(models)
        self.retry_after = retry_after
        super().__init__(
            f"circuit open for every candidate model ({', '.join(self.models)}); "
            f"retry in {retry_after:.0f}s"
        )


@dataclass(frozen=True)
class CircuitPolicy:
    """The three numbers spec §8.1 fixes. Config may override them; nothing else may."""

    failure_threshold: int = DEFAULT_FAILURE_THRESHOLD
    window_seconds: float = DEFAULT_WINDOW_SECONDS
    open_seconds: float = DEFAULT_OPEN_SECONDS


@dataclass
class _ModelCircuit:
    """The state of one model's breaker. Internal — read it through :class:`CircuitBreaker`."""

    failures: deque[float] = field(default_factory=deque)
    opened_at: float | None = None
    probe_in_flight: bool = False


class CircuitBreaker:
    """Failure bookkeeping for a set of models.

    Not thread-safe and deliberately not locked: every caller is on one event loop, and each
    method here runs to completion without awaiting, so the state can never be observed
    half-updated. ``clock`` is injected so the tests never sleep.
    """

    def __init__(
        self,
        *,
        policy: CircuitPolicy | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.policy = policy or CircuitPolicy()
        self._clock = clock
        self._circuits: dict[str, _ModelCircuit] = {}

    # -- inspection ---------------------------------------------------------

    def state(self, model: str) -> CircuitState:
        """``closed`` (calls flow), ``open`` (refusing), or ``half_open`` (one probe allowed)."""
        circuit = self._circuits.get(model)
        if circuit is None or circuit.opened_at is None:
            return "closed"
        if self._clock() - circuit.opened_at < self.policy.open_seconds:
            return "open"
        return "half_open"

    def failure_count(self, model: str) -> int:
        """Failures still inside the window. Observability, and what the tests assert on."""
        circuit = self._circuits.get(model)
        if circuit is None:
            return 0
        self._prune(circuit)
        return len(circuit.failures)

    def retry_after(self, model: str) -> float:
        """Seconds until an open breaker will admit a probe; ``0.0`` when it already would."""
        circuit = self._circuits.get(model)
        if circuit is None or circuit.opened_at is None:
            return 0.0
        remaining = self.policy.open_seconds - (self._clock() - circuit.opened_at)
        return max(0.0, remaining)

    # -- the decision -------------------------------------------------------

    def allow(self, model: str) -> bool:
        """May this model be called right now?

        Mutating by design: the single half-open probe is *reserved* here, so two concurrent
        specialists cannot both take it and re-hammer a model that is still down.
        """
        state = self.state(model)
        if state == "open":
            return False
        if state == "half_open":
            circuit = self._circuits[model]
            if circuit.probe_in_flight:
                return False
            circuit.probe_in_flight = True
        return True

    def record_success(self, model: str) -> None:
        """A model answered: forget its failures and close the breaker."""
        self._circuits[model] = _ModelCircuit()

    def record_failure(self, model: str) -> None:
        """A model failed. Opens the breaker on the threshold, or re-opens a failed probe."""
        circuit = self._circuits.setdefault(model, _ModelCircuit())
        now = self._clock()

        if circuit.opened_at is not None:
            # The probe that was admitted after the open window failed: straight back to open.
            circuit.opened_at = now
            circuit.probe_in_flight = False
            circuit.failures = deque([now])
            return

        circuit.failures.append(now)
        self._prune(circuit)
        if len(circuit.failures) >= self.policy.failure_threshold:
            circuit.opened_at = now
            circuit.probe_in_flight = False

    def _prune(self, circuit: _ModelCircuit) -> None:
        cutoff = self._clock() - self.policy.window_seconds
        while circuit.failures and circuit.failures[0] <= cutoff:
            circuit.failures.popleft()


def failback_candidates(model: str, chain: Sequence[str]) -> tuple[str, ...]:
    """The models this call may use, best first.

    A model inside the chain may fall back to its **successors only** — Sonnet never gets
    promoted to Opus behind the caller's back. A model that is not in the chain at all (a
    one-off routing choice) may fall back to the whole chain.
    """
    candidates = [model]
    if model in chain:
        index = list(chain).index(model)
        candidates.extend(chain[index + 1 :])
    else:
        candidates.extend(chain)

    seen: set[str] = set()
    unique: list[str] = []
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            unique.append(candidate)
    return tuple(unique)


class FailbackClient:
    """An ``LLMClient`` that routes around models whose breaker is open (§8.1).

    Everything except the model id is passed straight through: re-routing a call is a
    degradation we can defend, quietly re-tuning its sampling is not.
    """

    def __init__(
        self,
        inner: LLMClient,
        *,
        chain: Sequence[str],
        breaker: CircuitBreaker | None = None,
    ) -> None:
        self.inner = inner
        self.chain: tuple[str, ...] = tuple(chain)
        self.breaker = breaker or CircuitBreaker()

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[Message],
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        candidates = failback_candidates(model, self.chain)
        last_error: Exception | None = None

        for candidate in candidates:
            if not self.breaker.allow(candidate):
                continue
            try:
                response = await self.inner.complete(
                    model=candidate,
                    system=system,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except Exception as error:
                # `except Exception` deliberately excludes CancelledError: a superseded run
                # (E3) is our decision, not the provider's, and must not spend the budget.
                self.breaker.record_failure(candidate)
                last_error = error
                continue
            self.breaker.record_success(candidate)
            return response

        if last_error is not None:
            raise last_error
        raise CircuitOpenError(
            models=candidates,
            retry_after=max(self.breaker.retry_after(name) for name in candidates),
        )
