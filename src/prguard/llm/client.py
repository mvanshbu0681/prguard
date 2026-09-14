"""The LLM substrate — protocol, providers, and the fake that keeps VERIFY offline.

Spec §4.3 (`llm/client.py`), §4.8 (`LLM_PROVIDER`), §9.1 ("every LLM call uses
`FakeLLMClient`").

Three rules this module exists to enforce:

1. **Nothing hardcodes a model.** ``model``, ``max_tokens`` and ``temperature`` are required
   keyword arguments on :meth:`LLMClient.complete`, so every call site is handed its values by
   config (§4.8). Model routing was deferred — switching must stay a one-line config change.
2. **The pipeline runs with zero API calls.** ``LLM_PROVIDER=fake`` selects
   :class:`FakeLLMClient`, which answers from recorded fixtures.
3. **A fake never invents an answer.** An unmatched call raises :class:`NoFakeResponseError`
   rather than returning something plausible; a silently-wrong fixture is a debugging tar pit.

Ownership: T2 owns this module. T8 replaces the body of :class:`AnthropicClient` in wave 2 and
adds ``llm/circuit.py`` (the failback chain) next to it.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol, runtime_checkable

Role = Literal["user", "assistant"]

#: Fixture file suffixes :meth:`FakeLLMClient.from_fixtures` will look for, in order.
FIXTURE_SUFFIXES: tuple[str, ...] = (".json", ".txt", ".md")

#: A fixture with this stem answers any call that matched no route (see ``from_fixtures``).
DEFAULT_FIXTURE_STEM = "default"


class LLMError(Exception):
    """Base class for every failure raised by the LLM substrate."""


class NoFakeResponseError(LLMError):
    """The fake provider was called with a request it has no canned response for."""


class FixtureNotFoundError(LLMError):
    """A recorded fixture was named but does not exist on disk."""


class UnknownProviderError(LLMError):
    """``LLM_PROVIDER`` names a provider this build does not have."""


@dataclass(frozen=True)
class Message:
    """One turn of the conversation sent to the model."""

    role: Role
    content: str


@dataclass(frozen=True)
class LLMUsage:
    """Token accounting, persisted per run in ``review_runs.token_usage`` (§5.1)."""

    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True)
class LLMResponse:
    """A completion. ``text`` is the raw model output — parsing belongs to ``structured.py``."""

    text: str
    model: str
    stop_reason: str | None = None
    usage: LLMUsage = LLMUsage()


@runtime_checkable
class LLMClient(Protocol):
    """The seam every caller depends on. Implemented by the real and the fake provider."""

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[Message],
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        """Return one completion. Implementations must not retry silently."""
        ...


@dataclass(frozen=True)
class LLMCall:
    """A request as the fake provider saw it, so tests can assert on what we actually sent."""

    model: str
    system: str
    messages: tuple[Message, ...]
    max_tokens: int
    temperature: float

    @property
    def prompt(self) -> str:
        """The user-authored half of the request, newline-joined."""
        return "\n".join(message.content for message in self.messages if message.role == "user")

    @property
    def text(self) -> str:
        """Everything the model was shown — system prompt included. What routes match on."""
        return "\n".join([self.system, *(message.content for message in self.messages)])


FakeReply = str | LLMResponse


class FakeLLMClient:
    """A deterministic, offline provider backed by canned replies.

    Three resolution mechanisms, tried in this order, so a test can use whichever fits:

    1. ``script`` — replies consumed FIFO. Right for a *sequence* that matters, such as the
       malformed-then-repaired exchange in :mod:`prguard.llm.structured`.
    2. ``routes`` — ``{marker: reply}``; a route matches when its marker appears anywhere in the
       system prompt or the messages. Right for S3, where four specialists run under
       ``asyncio.gather`` and call order is not a usable key. The **longest** matching marker
       wins, ties broken lexicographically, so resolution never depends on dict ordering.
    3. ``default`` — the catch-all.

    With none of the three matching, the call raises :class:`NoFakeResponseError`.
    ``calls`` records every request for assertions.
    """

    def __init__(
        self,
        *,
        script: Iterable[FakeReply] = (),
        routes: Mapping[str, FakeReply] | None = None,
        default: FakeReply | None = None,
    ) -> None:
        self.script: list[FakeReply] = list(script)
        self.routes: dict[str, FakeReply] = dict(routes or {})
        self.default: FakeReply | None = default
        self.calls: list[LLMCall] = []

    @classmethod
    def from_fixtures(
        cls,
        fixture_dir: Path,
        *,
        script: Sequence[str] = (),
        routes: Mapping[str, str] | None = None,
        default: str | None = None,
    ) -> FakeLLMClient:
        """Build a fake from a directory of recorded responses.

        Every file in ``fixture_dir`` becomes a route keyed by its stem, and its **verbatim**
        contents are the response text — a recorded malformed-JSON response has to arrive
        malformed to be worth recording. ``script``, ``routes`` and ``default`` name fixtures
        rather than inlining text; a name with no file raises immediately, at construction, so a
        typo surfaces where it was made instead of mid-run.
        """
        if not fixture_dir.is_dir():
            raise FixtureNotFoundError(f"fixture directory does not exist: {fixture_dir}")

        loaded: dict[str, str] = {}
        for path in sorted(fixture_dir.iterdir()):
            if path.is_file() and path.suffix in FIXTURE_SUFFIXES:
                loaded[path.stem] = path.read_text(encoding="utf-8")

        def resolve(name: str) -> str:
            if name in loaded:
                return loaded[name]
            raise FixtureNotFoundError(
                f"no fixture named {name!r} in {fixture_dir}; available: {sorted(loaded)}"
            )

        resolved_routes: dict[str, FakeReply] = dict(loaded.items())
        resolved_routes.pop(DEFAULT_FIXTURE_STEM, None)
        for marker, name in (routes or {}).items():
            resolved_routes[marker] = resolve(name)

        fallback = resolve(default) if default is not None else loaded.get(DEFAULT_FIXTURE_STEM)
        return cls(
            script=[resolve(name) for name in script],
            routes=resolved_routes,
            default=fallback,
        )

    def add_route(self, marker: str, reply: FakeReply) -> None:
        """Register one more content-addressed reply."""
        self.routes[marker] = reply

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[Message],
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        call = LLMCall(
            model=model,
            system=system,
            messages=tuple(messages),
            max_tokens=max_tokens,
            temperature=temperature,
        )
        self.calls.append(call)
        return _as_response(self._resolve(call), model=model)

    def _resolve(self, call: LLMCall) -> FakeReply:
        if self.script:
            return self.script.pop(0)
        matched = [marker for marker in self.routes if marker in call.text]
        if matched:
            best = sorted(matched, key=lambda marker: (-len(marker), marker))[0]
            return self.routes[best]
        if self.default is not None:
            return self.default
        raise NoFakeResponseError(
            f"FakeLLMClient has no reply for model={call.model!r}; "
            f"script is empty and no route matched. Known routes: {sorted(self.routes)}"
        )


class AnthropicClient:
    """The real provider. **Stub until T8** — see plan §10, track T8.

    Constructed here (rather than in wave 2) so that ``build_client`` and every type annotation
    downstream are already correct when T8 fills in the body.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 120.0,
        max_retries: int = 2,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[Message],
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        raise NotImplementedError(
            "AnthropicClient is a typed stub in T2; T8 implements the live call. "
            "Set LLM_PROVIDER=fake to run offline."
        )


def build_client(
    *,
    provider: str,
    api_key: str | None = None,
    fixture_dir: Path | None = None,
) -> LLMClient:
    """Resolve ``LLM_PROVIDER`` (§4.8) to a client. The one place a provider is chosen.

    ``fake`` with a ``fixture_dir`` gives the whole pipeline recorded answers and zero API
    calls; ``fake`` without one is an empty fake that raises on first use, which is what you
    want in a unit test that should not be talking to a model at all.
    """
    normalised = provider.strip().lower()
    if normalised == "fake":
        if fixture_dir is not None:
            return FakeLLMClient.from_fixtures(fixture_dir)
        return FakeLLMClient()
    if normalised == "anthropic":
        return AnthropicClient(api_key=api_key)
    raise UnknownProviderError(
        f"unknown LLM_PROVIDER {provider!r}; expected one of: anthropic, fake"
    )


def _as_response(reply: FakeReply, *, model: str) -> LLMResponse:
    if isinstance(reply, LLMResponse):
        return reply
    return LLMResponse(text=reply, model=model, stop_reason="end_turn")
