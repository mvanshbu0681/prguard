"""Root fixtures — frozen after T1 (plan §9.3 rule 2).

Tracks needing extra fixtures add a package-level `tests/<pkg>/conftest.py`; nothing is
added here after this track merges.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from prguard.config import Settings, get_settings


@pytest.fixture(autouse=True)
def _isolated_settings_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Neither the ambient environment nor a local `.env` may leak into a test."""
    for key in Settings.model_fields:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)  # type: ignore[typeddict-item]
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
