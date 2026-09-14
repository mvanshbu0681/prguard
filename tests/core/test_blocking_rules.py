"""Nothing but proof blocks a merge, and nothing outside Python blocks at all (AC-16, §4.4).

``severity.is_blocking`` is T2's pinned predicate and the codebase's **only** writer of
``blocking``. This file asserts the two properties the product promises about it from the
outside — the non-Python rule across the whole band × proof-status grid (AC-16, E25), and that
no other module in ``src/`` writes the flag — plus the §4.3 layering rule for the pure modules
this track owns, because a severity module that can reach the database is no longer a pure
function of stored inputs.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from prguard.core import severity
from prguard.core.types import BAND_ORDER, Band, FindingStatus, ProofStatus

SRC = Path(__file__).resolve().parents[2] / "src" / "prguard"

ALL_BANDS: tuple[Band, ...] = BAND_ORDER
ALL_PROOF_STATUSES: tuple[ProofStatus, ...] = (
    "not_attempted",
    "not_applicable",
    "proven",
    "disproven",
    "inconclusive",
    "skipped_no_env",
)
ALL_FINDING_STATUSES: tuple[FindingStatus, ...] = (
    "proposed",
    "suppressed",
    "published",
    "dropped",
    "disproven",
)

#: Every language a finding could be reported in tonight, plus the awkward spellings.
NON_PYTHON_LANGUAGES = (
    "typescript",
    "javascript",
    "go",
    "rust",
    "java",
    "yaml",
    "markdown",
    "unknown",
    "",
    "python3",
    "pythonic",
)

#: The modules this track owns. §4.3: pure, so they can be tested exhaustively and cheaply.
PURE_MODULES = (
    "core/diff.py",
    "core/context.py",
    "core/sanitize.py",
    "core/fingerprint.py",
    "core/severity.py",
    "core/suppression.py",
)

#: Importing any of these from a pure module means it is no longer a pure function of its
#: inputs — it is a function of whatever the network or the database said that second.
FORBIDDEN_IMPORTS = (
    "prguard.api",
    "prguard.db",
    "httpx",
    "sqlalchemy",
    "anthropic",
    "fastapi",
    "subprocess",
    "socket",
    "requests",
)


# ---------------------------------------------------------------------------
# AC-16 — a non-Python finding is never blocking, at any severity, with any proof
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("language", NON_PYTHON_LANGUAGES)
@pytest.mark.parametrize("band", ALL_BANDS)
@pytest.mark.parametrize("proof_status", ALL_PROOF_STATUSES)
def test_non_python_never_blocks(language: str, band: Band, proof_status: ProofStatus) -> None:
    """Q9 / E25: the sandbox only runs Python, so only Python can ever be proven enough."""
    assert not severity.is_blocking(
        proof_status=proof_status,
        band=band,
        language=language,
        status="published",
        block_min_severity="info",
    )


@pytest.mark.parametrize("language", NON_PYTHON_LANGUAGES)
@pytest.mark.parametrize("status", ALL_FINDING_STATUSES)
def test_non_python_never_blocks_in_any_lifecycle_state(
    language: str, status: FindingStatus
) -> None:
    assert not severity.is_blocking(
        proof_status="proven",
        band="critical",
        language=language,
        status=status,
        block_min_severity="info",
    )


def test_the_python_equivalent_of_those_cases_does_block() -> None:
    """The control: identical arguments except the language, so the test cannot pass vacuously."""
    assert severity.is_blocking(
        proof_status="proven",
        band="critical",
        language="python",
        status="published",
        block_min_severity="info",
    )


# ---------------------------------------------------------------------------
# `blocking` has exactly one writer (§4.4)
# ---------------------------------------------------------------------------


def _is_is_blocking_call(value: ast.expr | None) -> bool:
    """True when the assigned value is the result of calling ``severity.is_blocking``.

    The invariant is that ``blocking`` is only ever *written from* ``is_blocking``, not that
    the attribute is never assigned. Recomputing the flag through the single source of truth
    is the required pattern, so it must not be reported as an offender.
    """
    if not isinstance(value, ast.Call):
        return False
    func = value.func
    if isinstance(func, ast.Name):
        return func.id == "is_blocking"
    if isinstance(func, ast.Attribute):
        return func.attr == "is_blocking"
    return False


def test_is_blocking_is_the_only_writer_of_the_blocking_flag() -> None:
    """Assign ``blocking`` anywhere else and the gate stops being a function of proof."""
    offenders: list[str] = []
    for path in sorted(SRC.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            targets: list[ast.expr] = []
            if isinstance(node, ast.Assign):
                targets = list(node.targets)
            elif isinstance(node, ast.AnnAssign | ast.AugAssign):
                targets = [node.target]
            value = getattr(node, "value", None)
            if _is_is_blocking_call(value):
                continue
            for target in targets:
                if isinstance(target, ast.Attribute) and target.attr == "blocking":
                    offenders.append(f"{path.relative_to(SRC)}:{node.lineno}")
    assert offenders == [], (
        "`blocking` may only be written from the result of severity.is_blocking; "
        f"found direct assignment at {offenders}"
    )


# ---------------------------------------------------------------------------
# §4.3 layering — the pure modules stay pure
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("relative", PURE_MODULES)
def test_pure_modules_import_no_io(relative: str) -> None:
    module = SRC / relative
    tree = ast.parse(module.read_text(encoding="utf-8"))
    imported: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imported.append(node.module)
    forbidden = [
        name
        for name in imported
        for banned in FORBIDDEN_IMPORTS
        if name == banned or name.startswith(f"{banned}.")
    ]
    assert forbidden == [], f"{relative} is supposed to be pure but imports {forbidden}"
