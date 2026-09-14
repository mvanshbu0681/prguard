"""Shared scaffolding for the proof suite.

Package-level by design — the root ``tests/conftest.py`` is frozen (plan §9.3 rule 2), and
nothing here needs a database, an app or an event loop policy anyway. What it does need is a
way to build canonical findings and to materialise a committed fixture repo into a disposable
workspace, because every test below the classifier runs a real process against real files.
"""

from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from prguard.core.proof.workspace import LocalPathSource, ProofWorkspace, write_repro
from prguard.core.types import (
    CanonicalFinding,
    ProofGeneration,
    ProofRequest,
    RunResult,
    SeverityInputs,
    SeverityResult,
)
from tests.fixtures.loader import llm_fixture, repo_tree

#: The proof timeout every test uses. Short: nothing here is allowed to take 90 s to fail.
TEST_TIMEOUT_SECONDS = 30


def make_severity(score: float = 0.81, band: str = "critical") -> SeverityResult:
    """A severity result carrying a score, which is all the selector looks at."""
    inputs = SeverityInputs(
        reachability=1.0,
        blast_radius=0.7,
        path_sensitivity=1.0,
        coverage_gap=1.0,
        churn=0.35,
        proof_confidence=0.5,
    )
    return SeverityResult(
        score=score,
        band=band,  # type: ignore[arg-type]
        inputs=inputs,
        weights=dict(inputs.as_mapping()),
    )


def make_finding(**overrides: Any) -> CanonicalFinding:
    """The §6.4 sample finding, with only what a test cares about overridden."""
    kwargs: dict[str, Any] = {
        "id": "f-9c2e",
        "tenant_id": "t-1",
        "repository_id": "r-1",
        "specialist": "bugs",
        "category": "correctness",
        "rule_key": "unguarded_none_arithmetic",
        "title": "apply_discount raises TypeError when rate is None",
        "body_markdown": "`apply_discount` multiplies `price * rate` without checking `rate`.",
        "file_path": "app/billing.py",
        "start_line": 41,
        "end_line": 44,
        "side": "RIGHT",
        "language": "python",
        "symbol_path": "app/billing.py::apply_discount",
        "severity": make_severity(),
        "fingerprint": "8f14e45f" * 8,
    }
    kwargs.update(overrides)
    return CanonicalFinding(**kwargs)


def generation(name: str) -> ProofGeneration:
    """One of T3's recorded proof-generator responses, as the validated output object."""
    parsed = llm_fixture(name).parsed
    return ProofGeneration(
        test_file_path=parsed["test_file_path"],
        test_code=parsed["test_code"],
        expected_failure_signal=parsed["expected_failure_signal"],
        extra_requirements=tuple(parsed.get("extra_requirements", ())),
        explanation=parsed.get("explanation", ""),
    )


def make_request(name: str, *, finding_id: str = "f-9c2e", **overrides: Any) -> ProofRequest:
    """A ``ProofRequest`` built from a recorded generation, so no repro is invented here."""
    recorded = generation(name)
    kwargs: dict[str, Any] = {
        "finding_id": finding_id,
        "test_file_path": recorded.test_file_path,
        "test_code": recorded.test_code,
        "expected_failure_signal": recorded.expected_failure_signal,
        "extra_requirements": recorded.extra_requirements,
        "timeout_seconds": TEST_TIMEOUT_SECONDS,
    }
    kwargs.update(overrides)
    return ProofRequest(**kwargs)


def make_run(exit_code: int = 0, **overrides: Any) -> RunResult:
    kwargs: dict[str, Any] = {"exit_code": exit_code}
    kwargs.update(overrides)
    return RunResult(**kwargs)


@pytest.fixture
def workspace_root(tmp_path: Path) -> Path:
    return tmp_path / "workspace"


@pytest.fixture
def materialise_repo(workspace_root: Path) -> Iterator[Any]:
    """`materialise_repo("buggy_calc", request)` → a workspace with base and head trees.

    Copies rather than runs in place: several fixture trees are deliberately red, and running
    them where they sit would litter the committed corpus (``tests/fixtures/conftest.py``).
    """
    created: list[ProofWorkspace] = []

    def build(name: str, request: ProofRequest, *, with_base: bool = True) -> ProofWorkspace:
        root = workspace_root / f"{name}-{len(created)}"
        head = root / "head"
        base = root / "base" if with_base else None
        shutil.copytree(repo_tree(name, "head"), head)
        write_repro(head, request)
        if base is not None:
            shutil.copytree(repo_tree(name, "base"), base)
            write_repro(base, request)
        workspace = ProofWorkspace(root=root, head_tree=head, base_tree=base)
        created.append(workspace)
        return workspace

    yield build
    for workspace in created:
        workspace.close()


@pytest.fixture
def local_source() -> Any:
    """`local_source("buggy_calc")` → a ``LocalPathSource`` over that committed fixture repo."""

    def build(name: str) -> LocalPathSource:
        return LocalPathSource(
            trees={"base": repo_tree(name, "base"), "head": repo_tree(name, "head")}
        )

    return build
