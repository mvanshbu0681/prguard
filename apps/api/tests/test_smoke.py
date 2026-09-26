"""Smoke test for the empty skeleton.

Its only job is to prove the package tree of spec §4.3 imports, and to keep `uv run pytest`
exiting 0 rather than 5 (no tests collected) while that tree is still empty.
"""

import importlib

PACKAGES = [
    "prguard",
    "prguard.api",
    "prguard.core",
    "prguard.core.delivery",
    "prguard.core.proof",
    "prguard.core.specialists",
    "prguard.db",
    "prguard.llm",
    "prguard.migrations",
]


def test_package_imports() -> None:
    for name in PACKAGES:
        assert importlib.import_module(name).__name__ == name
