"""Settings transcription checks — spec §4.8.

The weights validator is the only piece of logic in `config.py`; everything else is a
transcribed default, so the tests below assert the defaults literally.
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from prguard.config import DEFAULT_SEVERITY_WEIGHTS, Settings, get_settings

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_weights_must_sum_to_one() -> None:
    with pytest.raises(ValidationError) as excinfo:
        Settings(SEVERITY_WEIGHTS={**DEFAULT_SEVERITY_WEIGHTS, "churn": 0.9})
    assert "sum to 1.0" in str(excinfo.value)


def test_default_weights_sum_to_one() -> None:
    settings = Settings()
    assert sum(settings.SEVERITY_WEIGHTS.values()) == pytest.approx(1.0)
    assert settings.SEVERITY_WEIGHTS == DEFAULT_SEVERITY_WEIGHTS


def test_weights_accept_a_json_string() -> None:
    settings = Settings(SEVERITY_WEIGHTS=json.dumps(DEFAULT_SEVERITY_WEIGHTS))
    assert settings.SEVERITY_WEIGHTS == DEFAULT_SEVERITY_WEIGHTS


def test_weights_must_cover_every_severity_input() -> None:
    partial = {k: v for k, v in DEFAULT_SEVERITY_WEIGHTS.items() if k != "churn"}
    partial["reachability"] = 0.30
    with pytest.raises(ValidationError) as excinfo:
        Settings(SEVERITY_WEIGHTS=partial)
    assert "churn" in str(excinfo.value)


def test_severity_bands_must_be_descending() -> None:
    with pytest.raises(ValidationError) as excinfo:
        Settings(SEVERITY_BANDS={"critical": 0.15, "high": 0.55, "medium": 0.35, "low": 0.75})
    assert "descending" in str(excinfo.value)


def test_defaults_match_spec_section_4_8() -> None:
    settings = Settings()
    assert settings.DATABASE_URL == "sqlite+aiosqlite:///./prguard.db"
    assert settings.PRGUARD_API_TOKEN is None
    assert settings.ANTHROPIC_API_KEY is None
    assert settings.LLM_PROVIDER == "anthropic"
    assert settings.MODEL_SPECIALIST == "claude-sonnet-5"
    assert settings.MODEL_COORDINATOR == "claude-opus-5"
    assert settings.MODEL_PROOF_GENERATOR == "claude-opus-5"
    assert settings.MODEL_FAILBACK_CHAIN == ["claude-opus-5", "claude-sonnet-5"]
    assert settings.LLM_TEMPERATURE == 0.0
    assert settings.LLM_MAX_OUTPUT_TOKENS == 8000
    assert settings.CONTEXT_TOKEN_BUDGET == 120000
    assert settings.REVIEW_WORKERS == 2
    assert settings.REVIEW_MAX_CONCURRENCY == 2
    assert settings.RUN_STALE_SECONDS == 600
    assert settings.BLOCK_MIN_SEVERITY == "high"
    assert settings.PROOF_MIN_SCORE == 0.35
    assert settings.PROOF_MAX_PER_RUN == 3
    assert settings.PROOF_TIMEOUT == 90
    assert settings.DEP_INSTALL_TIMEOUT == 180
    assert settings.PROOF_OUTPUT_MAX_BYTES == 20000
    assert settings.PROOF_REQUIRE_BASELINE is True
    assert settings.PROOF_ALLOW_SUBPROCESS is True
    assert settings.GITHUB_TOKEN is None
    assert settings.GITHUB_APP_ID is None
    assert settings.GITHUB_APP_PRIVATE_KEY is None
    assert settings.GITHUB_WEBHOOK_SECRET is None
    assert settings.ALLOW_UNSIGNED_WEBHOOKS is False
    assert settings.GITHUB_DELIVERY_MODE == "auto"
    assert settings.REVIEW_DRAFT_PRS is False
    assert settings.NEAREST_LINE_MAX_DISTANCE == 10
    assert settings.MAX_FILES == 300
    assert settings.RELATED_FILES_MAX == 40
    assert settings.DEFAULT_TENANT_SLUG == "default"


def test_env_overrides_are_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BLOCK_MIN_SEVERITY", "critical")
    monkeypatch.setenv("MODEL_FAILBACK_CHAIN", "claude-opus-5,claude-sonnet-5,claude-haiku-5")
    settings = Settings()
    assert settings.BLOCK_MIN_SEVERITY == "critical"
    assert settings.MODEL_FAILBACK_CHAIN[-1] == "claude-haiku-5"


def test_get_settings_is_cached() -> None:
    get_settings.cache_clear()
    assert get_settings() is get_settings()
    get_settings.cache_clear()


def test_env_example_lists_only_real_settings_and_parses() -> None:
    """`.env.example` is the operator-facing copy of §4.8; it must not drift."""
    text = (REPO_ROOT / ".env.example").read_text(encoding="utf-8")
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key] = value

    unknown = sorted(set(values) - set(Settings.model_fields))
    assert unknown == [], f".env.example names settings that do not exist: {unknown}"
    # Every documented default must survive validation.
    assert Settings(**values).SEVERITY_WEIGHTS == DEFAULT_SEVERITY_WEIGHTS


def test_database_url_dialect_helpers() -> None:
    assert Settings().is_sqlite is True
    assert Settings().is_sqlite is not Settings().is_postgres
    pg = Settings(DATABASE_URL="postgresql+asyncpg://u:p@host/db")
    assert pg.is_postgres is True
    assert pg.is_sqlite is False
