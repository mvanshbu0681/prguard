"""The backend, imported read-only, plus the constants every other module shares.

``prguard`` must come from ``PYTHONPATH`` (the backend checkout at ``eeb1be8``). Nothing here
writes into that checkout: ``gen_fixtures.py`` turns bytecode caching off before this module is
imported, and the settings object is built with every output-relevant key pinned so neither the
shell environment nor a stray ``.env`` can change a byte of the corpus.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime

try:
    import prguard  # noqa: F401
except ModuleNotFoundError as missing:  # pragma: no cover - operator error
    raise SystemExit(
        "prguard is not importable. Run the generator as:\n"
        "  PYTHONPATH=<backend>/src <venv>/bin/python scripts/fixtures/gen_fixtures.py"
    ) from missing

assert sys.dont_write_bytecode, "gen_fixtures.py must disable bytecode before importing prguard"

from prguard.api import routes_accuracy, routes_audit, routes_findings, routes_reviews  # noqa: E402
from prguard.api import routes_suppressions, schemas  # noqa: E402
from prguard.api.deps import TenantScope  # noqa: E402
from prguard.config import Settings  # noqa: E402
from prguard.core import accuracy, audit, context, coordinator, fingerprint  # noqa: E402
from prguard.core import pipeline, severity, suppression  # noqa: E402
from prguard.core import types as core_types  # noqa: E402
from prguard.core.delivery import comment_ladder, gate, github_client  # noqa: E402
from prguard.core.proof import runner, selector  # noqa: E402
from prguard.core.specialists import registry  # noqa: E402
from prguard.db import models  # noqa: E402
from prguard.db.base import Base, as_utc  # noqa: E402

__all__ = [
    "Base",
    "as_utc",
    "accuracy",
    "audit",
    "comment_ladder",
    "context",
    "coordinator",
    "core_types",
    "fingerprint",
    "gate",
    "github_client",
    "models",
    "pipeline",
    "registry",
    "routes_accuracy",
    "routes_audit",
    "routes_findings",
    "routes_reviews",
    "routes_suppressions",
    "runner",
    "schemas",
    "selector",
    "severity",
    "suppression",
]

#: The backend commit this corpus was generated against (plan A2).
BACKEND_COMMIT = "eeb1be8"

#: Every random choice in the corpus derives from this seed (``rng.py``).
SEED = 20260923

#: "Now" for the whole corpus. Relative ages, expiries and heartbeats are computed against it.
NOW = datetime(2026, 9, 23, 12, 0, 0, tzinfo=UTC)

#: The one tenant (manifest ``ids.tenant_id``) and its slug.
TENANT_ID = "7f3c9a21-5b8e-4d6f-9a0c-2e4b6d8f1a3c"
TENANT_SLUG = "acme"

#: Self-hosted deployment origin used for the links inside posted reviews. ``.internal`` is
#: reserved for private use, so the URL cannot collide with anyone's public site.
PUBLIC_BASE_URL = "https://prguard.acme.internal"

#: §4.8 defaults, pinned so the corpus never depends on the shell it was generated in.
SETTINGS = Settings(
    _env_file=None,
    DATABASE_URL="sqlite+aiosqlite://",
    LLM_PROVIDER="fake",
    MODEL_SPECIALIST="claude-sonnet-5",
    MODEL_COORDINATOR="claude-opus-5",
    MODEL_PROOF_GENERATOR="claude-opus-5",
    LLM_TEMPERATURE=0.0,
    SEVERITY_WEIGHTS=dict(core_types.DEFAULT_SEVERITY_WEIGHTS),
    SEVERITY_BANDS=dict(core_types.DEFAULT_BAND_THRESHOLDS),
    BLOCK_MIN_SEVERITY="high",
    PROOF_MIN_SCORE=0.35,
    PROOF_MAX_PER_RUN=3,
    PROOF_TIMEOUT=90,
    PROOF_REQUIRE_BASELINE=True,
    PROOF_ALLOW_SUBPROCESS=True,
    NEAREST_LINE_MAX_DISTANCE=10,
    GATE_CONTEXT_NAME="prguard/merge-gate",
    PUBLIC_BASE_URL=PUBLIC_BASE_URL,
)

SCOPE = TenantScope(tenant_id=TENANT_ID, slug=TENANT_SLUG)

WEIGHTS: dict[str, float] = dict(SETTINGS.SEVERITY_WEIGHTS)
BANDS: dict[str, float] = dict(SETTINGS.SEVERITY_BANDS)


def compute_severity(inputs: core_types.SeverityInputs, *, notes=()) -> core_types.SeverityResult:
    """``Pipeline._compute`` — the only call shape the pipeline ever uses (§4.4)."""
    return severity.compute(inputs, weights=WEIGHTS, thresholds=BANDS, notes=notes)
