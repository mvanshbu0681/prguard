"""Application settings — every key from spec §4.8, all env-overridable.

Transcription, not design: the defaults below are the spec's defaults verbatim. The only
logic here is the startup validation the spec requires — `SEVERITY_WEIGHTS` must sum to
1.0 and cover every §4.4 input, and the band thresholds must descend.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Band = Literal["critical", "high", "medium", "low", "info"]
DeliveryModeSetting = Literal["auto", "post", "dry_run"]

#: Spec §4.4 — the six severity inputs and their default weights.
DEFAULT_SEVERITY_WEIGHTS: dict[str, float] = {
    "reachability": 0.20,
    "blast_radius": 0.15,
    "path_sensitivity": 0.25,
    "coverage_gap": 0.15,
    "churn": 0.10,
    "proof_confidence": 0.15,
}

#: Spec §4.4 `[ASSUMED]` band thresholds, `>=` semantics; `info` is the implicit floor.
DEFAULT_SEVERITY_BANDS: dict[str, float] = {
    "critical": 0.75,
    "high": 0.55,
    "medium": 0.35,
    "low": 0.15,
}

_WEIGHT_SUM_TOLERANCE = 1e-9


def _split_csv(value: Any) -> Any:
    """Accept either a JSON list or the spec's comma-separated env form."""
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("["):
            return json.loads(text)
        return [part.strip() for part in text.split(",") if part.strip()]
    return value


class Settings(BaseSettings):
    """Spec §4.8. Field names are the env var names; nothing is renamed."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # --- persistence ---
    DATABASE_URL: str = "sqlite+aiosqlite:///./prguard.db"

    # --- auth & tenancy ---
    PRGUARD_API_TOKEN: str | None = None
    DEFAULT_TENANT_SLUG: str = "default"

    # --- LLM ---
    ANTHROPIC_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    LLM_PROVIDER: Literal["anthropic", "gemini", "fake"] = "anthropic"
    MODEL_SPECIALIST: str = "claude-sonnet-5"
    MODEL_COORDINATOR: str = "claude-opus-5"
    MODEL_PROOF_GENERATOR: str = "claude-opus-5"
    MODEL_FAILBACK_CHAIN: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["claude-opus-5", "claude-sonnet-5"]
    )
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_OUTPUT_TOKENS: int = 8000
    CONTEXT_TOKEN_BUDGET: int = 120000

    # --- run execution ---
    REVIEW_WORKERS: int = 2
    REVIEW_MAX_CONCURRENCY: int = 2
    RUN_STALE_SECONDS: int = 600

    # --- severity (§4.4) ---
    SEVERITY_WEIGHTS: dict[str, float] = Field(
        default_factory=lambda: dict(DEFAULT_SEVERITY_WEIGHTS)
    )
    SEVERITY_BANDS: dict[str, float] = Field(default_factory=lambda: dict(DEFAULT_SEVERITY_BANDS))
    BLOCK_MIN_SEVERITY: Band = "high"

    # --- proof (§4.6) ---
    PROOF_MIN_SCORE: float = 0.35
    PROOF_MAX_PER_RUN: int = 3
    PROOF_TIMEOUT: int = 90
    DEP_INSTALL_TIMEOUT: int = 180
    PROOF_OUTPUT_MAX_BYTES: int = 20000
    PROOF_REQUIRE_BASELINE: bool = True
    PROOF_ALLOW_SUBPROCESS: bool = True

    # --- context (§4.1 S2, E5/E6) ---
    MAX_FILES: int = 300
    MAX_DIFF_BYTES: int = 2_000_000
    #: How many files *outside* the diff S2 may fetch to find the callers of a changed symbol
    #: (§4.4 `blast_radius`/`reachability`). One tree listing plus at most this many bodies, so
    #: a monorepo cannot fan a single review out into thousands of requests. 0 turns the search
    #: off; the review then measures callers over the diff alone and says so.
    RELATED_FILES_MAX: int = 40

    # --- GitHub (§4.7, §6.10) ---
    GITHUB_TOKEN: str | None = None
    GITHUB_APP_ID: str | None = None
    GITHUB_APP_PRIVATE_KEY: str | None = None
    GITHUB_WEBHOOK_SECRET: str | None = None
    ALLOW_UNSIGNED_WEBHOOKS: bool = False
    GITHUB_DELIVERY_MODE: DeliveryModeSetting = "auto"
    GITHUB_API_BASE: str = "https://api.github.com"
    #: Public origin of this deployment, used to build an absolute link back to a run.
    #: GitHub rejects a relative `target_url` with 422 ("must use http(s) scheme"), which
    #: knocked the gate off the commit-status rung all the way to dry_run. Unset means the
    #: verdict still publishes -- it just carries no link.
    PUBLIC_BASE_URL: str | None = None
    REVIEW_DRAFT_PRS: bool = False
    NEAREST_LINE_MAX_DISTANCE: int = 10
    GATE_CONTEXT_NAME: str = "prguard/merge-gate"

    @property
    def llm_api_key(self) -> str | None:
        """The credential for whichever provider ``LLM_PROVIDER`` names.

        One place decides this. Passing ``ANTHROPIC_API_KEY`` to a Gemini client is the kind
        of mismatch that surfaces as an unauthenticated 401 halfway through a review rather
        than at startup, so the mapping lives next to the keys themselves.
        """
        if self.LLM_PROVIDER == "gemini":
            return self.GEMINI_API_KEY
        if self.LLM_PROVIDER == "anthropic":
            return self.ANTHROPIC_API_KEY
        return None

    @field_validator("MODEL_FAILBACK_CHAIN", mode="before")
    @classmethod
    def _parse_failback_chain(cls, value: Any) -> Any:
        return _split_csv(value)

    @field_validator("SEVERITY_WEIGHTS", "SEVERITY_BANDS", mode="before")
    @classmethod
    def _parse_mapping(cls, value: Any) -> Any:
        if isinstance(value, str):
            return json.loads(value)
        return value

    @field_validator("SEVERITY_WEIGHTS")
    @classmethod
    def _weights_sum_to_one(cls, value: dict[str, float]) -> dict[str, float]:
        missing = sorted(set(DEFAULT_SEVERITY_WEIGHTS) - set(value))
        if missing:
            raise ValueError(f"SEVERITY_WEIGHTS is missing severity inputs: {', '.join(missing)}")
        unknown = sorted(set(value) - set(DEFAULT_SEVERITY_WEIGHTS))
        if unknown:
            raise ValueError(f"SEVERITY_WEIGHTS has unknown severity inputs: {', '.join(unknown)}")
        total = sum(value.values())
        if abs(total - 1.0) > _WEIGHT_SUM_TOLERANCE:
            raise ValueError(f"SEVERITY_WEIGHTS must sum to 1.0, got {total!r}")
        return value

    @field_validator("SEVERITY_BANDS")
    @classmethod
    def _bands_descend(cls, value: dict[str, float]) -> dict[str, float]:
        missing = sorted(set(DEFAULT_SEVERITY_BANDS) - set(value))
        if missing:
            raise ValueError(f"SEVERITY_BANDS is missing bands: {', '.join(missing)}")
        ordered = [value[name] for name in ("critical", "high", "medium", "low")]
        if not all(a > b for a, b in zip(ordered, ordered[1:], strict=False)):
            raise ValueError(
                f"SEVERITY_BANDS thresholds must be strictly descending, got {ordered!r}"
            )
        return value

    @model_validator(mode="after")
    def _concurrency_is_positive(self) -> Settings:
        if self.REVIEW_WORKERS < 1:
            raise ValueError("REVIEW_WORKERS must be >= 1")
        if self.REVIEW_MAX_CONCURRENCY < 1:
            raise ValueError("REVIEW_MAX_CONCURRENCY must be >= 1")
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith(("postgres", "postgresql"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings, cached. Tests call `get_settings.cache_clear()`."""
    return Settings()
