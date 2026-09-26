"""Delivery fixtures — the §4.7 ladder corpus, canonical findings and a faked GitHub.

Root `tests/conftest.py` is frozen (plan §9.3 rule 2), so everything T6 needs lives here.

The ladder cases are **not** written out by hand: they are read from
`tests/fixtures/expectations/ladder_rungs.json`, which T3 recomputes from the recorded PR-42
diff. If the diff moves, the expectations move with it and these tests fail loudly rather than
quietly asserting a stale rung.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import respx

from prguard.core.delivery.github_client import GitHubClient
from prguard.core.types import CanonicalFinding, LineMap
from tests.fixtures.loader import github_response, ladder_rungs

OWNER = "octocat"
REPO = "hello-world"
PR_NUMBER = 42
HEAD_SHA = "9a1e3c7f0b2d4e6a8c1f3b5d7e9a0c2e4f6a8b1d"
API_BASE = "https://api.github.com"
REVIEWS_URL = f"{API_BASE}/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews"


def make_finding(**overrides: Any) -> CanonicalFinding:
    """A published, single-line canonical finding; override only what a test cares about."""
    kwargs: dict[str, Any] = {
        "id": "f-1",
        "tenant_id": "t-1",
        "repository_id": "r-1",
        "specialist": "bugs",
        "category": "correctness",
        "rule_key": "unguarded_none_arithmetic",
        "title": "apply_discount raises TypeError when rate is None",
        "body_markdown": "`apply_discount` multiplies `price * rate` without checking `rate`.",
        "file_path": "app/billing.py",
        "start_line": 41,
        "end_line": 41,
        "side": "RIGHT",
        "language": "python",
        "symbol_path": "app/billing.py::apply_discount",
        "fingerprint": "8f14e45f" * 8,
        "status": "published",
    }
    kwargs.update(overrides)
    return CanonicalFinding(**kwargs)


@pytest.fixture
def ladder_expectations() -> dict[str, Any]:
    """The §4.7 rung table T3 recorded, verbatim."""
    return ladder_rungs()


@pytest.fixture
def ladder_line_maps(ladder_expectations: dict[str, Any]) -> dict[str, LineMap]:
    """RIGHT-side commentable lines per file, exactly as the recorded diff has them.

    `app/receipts.py` is deliberately absent: a file with no entry is a file GitHub will not
    take any comment on, which is what drives rung 4.
    """
    return {
        path: LineMap(file_path=path, commentable_lines=frozenset(lines))
        for path, lines in ladder_expectations["in_hunk_right_side_lines"].items()
    }


@pytest.fixture
def ladder_findings(ladder_expectations: dict[str, Any]) -> list[CanonicalFinding]:
    """One canonical finding per recorded ladder case, in fixture order."""
    return [
        make_finding(
            id=case["id"],
            file_path=case["file_path"],
            start_line=case["line"],
            end_line=case["line"],
            title=f"{case['id']} — {case['expected_rung']}",
            body_markdown=case["why"],
            fingerprint=f"{index:016x}" * 4,
        )
        for index, case in enumerate(ladder_expectations["findings"])
    ]


@pytest.fixture
def github_mock() -> Any:
    """A respx router over the GitHub API base with no route registered by default.

    `assert_all_called=False` because most tests here assert on *which* rung was reached, and
    an un-called route is frequently the point (the gate never falling past rung 2, say).
    """
    with respx.mock(base_url=API_BASE, assert_all_called=False) as router:
        yield router


def recorded(name: str) -> httpx.Response:
    """Replay a recorded GitHub response as an httpx response, headers and all."""
    fixture = github_response(name)
    return httpx.Response(fixture.status, headers=fixture.headers, json=fixture.body)


class SleepRecorder:
    """Stands in for `asyncio.sleep` so backoff is observable and instant."""

    def __init__(self) -> None:
        self.waits: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.waits.append(seconds)


def make_client(sleep: SleepRecorder | None = None, **kwargs: Any) -> GitHubClient:
    """A client whose clock is fake — no test in this package ever really sleeps."""
    return GitHubClient(
        token="ghp_test_token",
        base_url=API_BASE,
        sleep=sleep or SleepRecorder(),
        jitter=lambda: 0.0,
        **kwargs,
    )
