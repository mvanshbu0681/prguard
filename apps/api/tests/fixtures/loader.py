"""Typed accessors for the offline fixture corpus.

Stdlib only, and it imports nothing from ``prguard`` — so importing it can never drag a
half-built module into a test that only wanted a recorded response. Every track is
expected to read fixtures through here rather than hand-rolling paths:

    from tests.fixtures.loader import github_response, llm_fixture, repo_tree

    recorded = github_response("pr_42_files")
    respx_mock.get(recorded.url).mock(
        return_value=httpx.Response(recorded.status, headers=recorded.headers,
                                    json=recorded.body)
    )

Fixture file conventions:

* ``github/*.json`` — a whole recorded HTTP response: ``request``/``status``/``headers``/
  ``body``. ``body`` is a decoded JSON document. A fixture that also carries
  ``repo_fixture`` has its patches verified against the committed tree of that name.
* ``webhooks/*.json`` — a recorded delivery: ``event``, ``delivery_id``, ``headers``,
  ``payload``, plus the ``expected_response`` §6.10 prescribes.
* ``llm/*.json`` — a recorded model response. ``response_text`` is the raw string the
  provider returned and is what a fake client must replay verbatim; ``parsed`` is the same
  document decoded, and is present only when ``valid`` is true. Invalid fixtures
  (``kind`` of ``malformed`` or ``prose``) exist so the reject-and-repair path is testable.
* ``expectations/*.json`` — what the corpus asserts *about* itself: the §4.6 proof matrix,
  the §4.7 ladder rungs, and the context/exclusion sets.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).resolve().parent
REPOS = FIXTURES / "repos"
GITHUB = FIXTURES / "github"
WEBHOOKS = FIXTURES / "webhooks"
LLM = FIXTURES / "llm"
EXPECTATIONS = FIXTURES / "expectations"

GITHUB_API = "https://api.github.com"


@dataclass(frozen=True)
class RecordedResponse:
    """One recorded GitHub API response, ready to hand to respx."""

    name: str
    method: str
    path: str
    status: int
    headers: dict[str, str]
    body: Any
    query: dict[str, str]
    repo_fixture: str | None
    notes: str

    @property
    def url(self) -> str:
        return f"{GITHUB_API}{self.path}"


@dataclass(frozen=True)
class RecordedDelivery:
    """One recorded webhook delivery (§6.10)."""

    name: str
    event: str
    delivery_id: str
    headers: dict[str, str]
    payload: dict[str, Any]
    handled: bool
    expected_response: dict[str, Any]
    notes: str

    @property
    def raw_body(self) -> bytes:
        """The exact bytes to sign with `GITHUB_WEBHOOK_SECRET` and POST."""
        return json.dumps(self.payload, separators=(",", ":")).encode("utf-8")


@dataclass(frozen=True)
class RecordedLLMResponse:
    """One recorded model response for the `fake` provider."""

    name: str
    kind: str
    valid: bool
    model: str
    prompt_key: str
    response_text: str
    parsed: Any
    context: dict[str, Any]
    notes: str
    extra: dict[str, Any]


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fixture_path(*parts: str) -> Path:
    """Return an absolute path inside the corpus."""
    return FIXTURES.joinpath(*parts)


def load_json(*parts: str) -> Any:
    """Return any corpus JSON file, decoded."""
    return _load(fixture_path(*parts))


def github_response(name: str) -> RecordedResponse:
    """Return the recorded GitHub response called ``name`` (without the .json)."""
    payload = _load(GITHUB / f"{name}.json")
    request = payload.get("request", {})
    return RecordedResponse(
        name=payload["name"],
        method=request.get("method", "GET"),
        path=request.get("path", ""),
        status=payload["status"],
        headers=dict(payload.get("headers", {})),
        body=payload.get("body"),
        query=dict(request.get("query", {})),
        repo_fixture=payload.get("repo_fixture"),
        notes=payload.get("notes", ""),
    )


def github_diff(name: str = "pr_42") -> str:
    """Return a recorded unified diff (the `application/vnd.github.v3.diff` body)."""
    return (GITHUB / f"{name}.diff").read_text(encoding="utf-8")


def webhook_delivery(name: str) -> RecordedDelivery:
    """Return the recorded webhook delivery called ``name``."""
    payload = _load(WEBHOOKS / f"{name}.json")
    return RecordedDelivery(
        name=payload["name"],
        event=payload["event"],
        delivery_id=payload["delivery_id"],
        headers=dict(payload.get("headers", {})),
        payload=payload["payload"],
        handled=bool(payload.get("handled")),
        expected_response=payload.get("expected_response", {}),
        notes=payload.get("notes", ""),
    )


def llm_fixture(name: str) -> RecordedLLMResponse:
    """Return the recorded model response called ``name``."""
    payload = _load(LLM / f"{name}.json")
    known = {
        "name",
        "kind",
        "valid",
        "model",
        "prompt_key",
        "response_text",
        "parsed",
        "context",
        "notes",
    }
    return RecordedLLMResponse(
        name=payload["name"],
        kind=payload["kind"],
        valid=bool(payload["valid"]),
        model=payload["model"],
        prompt_key=payload.get("prompt_key", ""),
        response_text=payload["response_text"],
        parsed=payload.get("parsed"),
        context=dict(payload.get("context", {})),
        notes=payload.get("notes", ""),
        extra={key: value for key, value in payload.items() if key not in known},
    )


def llm_fixtures(kind: str | None = None) -> list[RecordedLLMResponse]:
    """Return every recorded model response, optionally filtered by ``kind``."""
    found = [llm_fixture(path.stem) for path in sorted(LLM.glob("*.json"))]
    return [item for item in found if kind is None or item.kind == kind]


def repo_tree(name: str, ref: str = "head") -> Path:
    """Return the committed fixture repo tree for ``name`` at ``ref`` (``base``/``head``).

    Never run a tree in place — copy it into a workspace first. Several of them are
    deliberately red, and running them where they sit litters the corpus with bytecode.
    """
    tree = REPOS / name / ref
    if not tree.is_dir():
        raise FileNotFoundError(f"no fixture repo tree at repos/{name}/{ref}")
    return tree


def proof_matrix() -> dict[str, Any]:
    """Return the §4.6 classification expectations."""
    return dict(_load(EXPECTATIONS / "proof_matrix.json"))


def proof_case(case_id: str) -> dict[str, Any]:
    """Return one row of the §4.6 expectation table by id."""
    for case in proof_matrix()["cases"]:
        if case["id"] == case_id:
            return dict(case)
    raise KeyError(f"no proof case {case_id!r} in expectations/proof_matrix.json")


def ladder_rungs() -> dict[str, Any]:
    """Return the §4.7 ladder expectations for the recorded PR-42 diff."""
    return dict(_load(EXPECTATIONS / "ladder_rungs.json"))


def context_files() -> dict[str, Any]:
    """Return the supplied-context and E9 exclusion sets."""
    return dict(_load(EXPECTATIONS / "context_files.json"))
