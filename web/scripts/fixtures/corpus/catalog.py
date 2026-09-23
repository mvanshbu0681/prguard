"""The tenant's other five weeks: repositories, what their specialists wrote, and every run.

Content only. Each ``Template`` is a finding a specialist wrote against a symbol; each
``RunSpec`` is a pull request run that raised some of them. Every score, band, fingerprint,
proof verdict, ladder rung and gate below is computed from these by ``simulate.py``.
"""

from __future__ import annotations

from corpus.model import DropTemplate, Facts, Proof, RepoSpec, Revoke, RunSpec, Suppress, Template, Use
from corpus.repro import proof
from corpus.synth import FileSpec, Sym

# =======================================================================================
# Repositories
# =======================================================================================

CHECKOUT = RepoSpec(
    key="checkout",
    owner="acme",
    name="checkout-service",
    app_installed=False,
    short_summary=False,
    files=(
        FileSpec(
            "app/checkout/session.py",
            doc="Checkout sessions, one per account and cart.",
            imports=("from datetime import UTC, datetime, timedelta",),
            symbols=(
                Sym("create_checkout_session", lines=16, params=("account_id: str", "cart_id: str")),
                Sym("session_key_for", lines=6, params=("account_id: str", "cart_id: str")),
                Sym("expire_sessions", lines=14, params=("now: datetime",)),
                Sym("load_session", lines=10, params=("session_id: str",)),
            ),
        ),
        FileSpec(
            "tests/checkout/test_session.py",
            doc="Tests for checkout sessions.",
            symbols=(
                Sym("test_session_is_created", lines=8),
                Sym("test_expired_sessions_are_swept", lines=10),
            ),
        ),
    ),
)

REPOS = (CHECKOUT,)

# =======================================================================================
# Findings the specialists wrote
# =======================================================================================

SESSION_KEY = Template(
    key="co.session_account_key",
    specialist="bugs",
    category="correctness",
    rule_key="session_key_collision",
    file="app/checkout/session.py",
    symbol="create_checkout_session",
    span=(2, 5),
    title="Two carts for one account share a single checkout session",
    body=(
        "`create_checkout_session()` derives the session key from `account_id` (line {start}), "
        "so an account with two open carts gets the first cart's session back for the second, "
        "and the second checkout charges the first cart."
    ),
    hint="high",
    confidence=0.64,
    provable=True,
    facts=Facts(public_entrypoint=False, internal_callers=2, file_is_tested=True, commits_90d=3),
    proofs={
        "default": proof(
            "passes_both",
            target="app/checkout/session.py::create_checkout_session",
            claim="two carts for one account share a single checkout session.",
            imports=("from app.checkout.session import create_checkout_session",),
            test_name="test_second_cart_gets_its_own_session",
            body=(
                'first = create_checkout_session("acct_31c", cart_id="cart_a")',
                'second = create_checkout_session("acct_31c", cart_id="cart_b")',
                "assert first.id != second.id",
            ),
            signal="AssertionError",
            base_seconds=0.36,
            head_seconds=0.34,
        )
    },
)

TEMPLATES = {template.key: template for template in (SESSION_KEY,)}

DROPS = {
    drop.key: drop
    for drop in (
        DropTemplate(
            key="nit_naming",
            specialist="quality",
            category="maintainability",
            rule_key="unclear_function_name",
            title="Rename `{symbol}()` to say that it persists the session.",
            body="`{symbol}()` builds and stores a session; the name reads like a pure constructor.",
            reason="nitpick",
            detail="naming preference; nothing a caller can get wrong",
            hint="info",
            confidence=0.48,
        ),
        DropTemplate(
            key="spec_race",
            specialist="bugs",
            category="correctness",
            rule_key="concurrent_sweep",
            title="Guard `{symbol}()` against two sweeps running at once.",
            body="Two workers running `{symbol}()` together could each delete the other's batch.",
            reason="speculative",
            detail="the supplied files schedule {symbol}() from one cron entry only",
            hint="medium",
            confidence=0.44,
        ),
        DropTemplate(
            key="ood_old_test",
            specialist="tests",
            category="test_integrity",
            rule_key="missing_not_found_test",
            title="Cover the 404 branch of `{symbol}()`.",
            body="`{symbol}()` has no test for an unknown order id.",
            reason="out_of_diff",
            detail="{symbol}() is unchanged by this pull request",
            hint="low",
            confidence=0.58,
        ),
    )
}

RUNS: tuple[RunSpec, ...] = ()

REVOCATIONS: tuple[Revoke, ...] = ()

__all__ = ["DROPS", "REPOS", "REVOCATIONS", "RUNS", "TEMPLATES"]

_UNUSED = (Proof, Suppress, Use)
