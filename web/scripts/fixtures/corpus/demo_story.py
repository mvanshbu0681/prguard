"""The demo story: acme/checkout-service#4821 and the two runs before it that it depends on.

Three runs tell it:

1. ``co-4790`` (2026-09-07) — "Store checkout sessions per account". The quality reviewer flags
   ``_line()`` in ``app/api/checkout.py`` for formatting money with float division. It is
   published, and priya-raman suppresses it that afternoon with ``scope=file``. That ledger row
   is the one that later suppresses a demo-run finding.
2. ``co-4821-a`` (2026-09-23, first push ``3e5a1c8``) — superseded 25 seconds in by the second
   push, while S6 was persisting its findings with ``status: proposed``; it stops at the next
   stage boundary. Its ``charge()`` finding is the first sighting of the fingerprint the demo
   run's proven finding carries — the local is named ``cur`` there and the function sits two
   lines higher — which is why that finding's history reads ``occurrence_count: 2``.
3. ``co-4821`` (the demo run, head ``9c2d4b1``) — 12 raised, 4 dropped at the coordinator,
   3 deduplicated, 1 suppressed by the existing rule, and of the 3 findings the selector sent
   to the sandbox: 1 proven, 1 disproven, 1 inconclusive (a pre-existing failure at base).
   The gate fails, and reaches GitHub as a commit status because the check-run rung is refused
   for this repository (the GitHub App is not installed on it).

Everything numeric about these findings — scores, bands, fingerprints, verdicts, rungs — is
computed by the backend in ``simulate.py``. This module only supplies what a specialist wrote
and what the sandbox printed.
"""

from __future__ import annotations

from corpus import demo_sources as src
from corpus.model import DropTemplate, Facts, Proof, RunSpec, Suppress, Template, Use
from corpus.repro import eq_call, raised

REPO = "checkout"

# ---------------------------------------------------------------------------------------
# Identifiers the manifest binds (plan A10)
# ---------------------------------------------------------------------------------------

DEMO_REVIEW_ID = "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41"
PROVEN_FINDING_ID = "a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d"
DISPROVEN_FINDING_ID = "5d20b7f4-9c1a-4e8b-a6d3-1f7e9b2c4a60"
INCONCLUSIVE_FINDING_ID = "c83e61a9-2d4f-4b7a-9e05-6a1d3f8c2b97"
BASE_SHA = "7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19"
HEAD_SHA = "9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92"
FIRST_PUSH_SHA = "3e5a1c8d9b2f4a6e8c0d1b3f5a7c9e2d4b6f8a01"
PR_NUMBER = 4821
PR_TITLE = "Resolve account currency at charge time"
PR_AUTHOR = "mhollis"

#: The demo run's nine stage durations (ms). They sum to 41 200: "succeeded in 41.2s".
#: S3's four specialists run in parallel, so the stage lasts as long as the slowest lane.
DEMO_STAGE_MS = (1840, 3120, 14260, 6480, 90, 310, 12870, 1960, 270)
assert sum(DEMO_STAGE_MS) == 41_200

#: The first push's run, pinned for its first six stages so the second push lands inside S6:
#: the superseded run has persisted its findings (``status: proposed``) and stops before S7.
RUN_A_STAGE_MS = (1910, 2980, 13840, 6120, 80, 290, 0, 0, 0)

# ---------------------------------------------------------------------------------------
# What the specialists wrote
# ---------------------------------------------------------------------------------------

CHARGE_NONE = Template(
    key="demo.charge_none",
    specialist="bugs",
    category="correctness",
    rule_key="unguarded_none_attribute",
    file="app/billing/charge.py",
    symbol="charge",
    span=(3, 6),
    title="charge() dereferences a None currency when the account has no default",
    body=(
        "`charge()` now takes the settlement currency from `account.default_currency` "
        "(line {start}), which is `None` for every account created before the account-settings "
        "page. On that path lines {mid}-{end} return `None` from a function annotated "
        "`-> Charge`, and `create_order()` in `app/api/checkout.py` reads `result.id` on the "
        "next line. At base the currency came from `account.currency`, which signup always sets."
    ),
    remediation=(
        "Fall back to `account.currency` when `default_currency` is `None`, as the base "
        "revision did, or raise a `MissingCurrency` error that `create_order()` turns into a 409."
    ),
    hint="high",
    confidence=0.86,
    provable=True,
    facts=Facts(
        public_entrypoint=True, internal_callers=7, symbol_is_tested=False,
        file_is_tested=True, commits_90d=6,
    ),
    proofs={
        "default": Proof(
            kind="fails_at_head",
            test_name="test_charge_uses_account_currency",
            test_code=src.REPRO_PROVEN,
            test_file_path=src.REPRO_PROVEN_PATH,
            signal="AttributeError",
            failure=raised(
                "AttributeError",
                "'NoneType' object has no attribute 'currency'",
                "charge(acct, 1200).currency",
            ),
            base_seconds=0.42,
            head_seconds=0.39,
        )
    },
)

RATE_NONE = Template(
    key="demo.rate_none",
    specialist="bugs",
    category="correctness",
    rule_key="optional_return_unhandled",
    file="app/billing/rates.py",
    symbol="get_rate",
    span=(1, 5),
    title="get_rate() may return None for an unsupported currency",
    body=(
        "`get_rate()` looks the code up in `_RATES`, which carries four currencies. For any "
        "other code the lookup yields `None`, and `_to_settlement()` in `app/billing/charge.py` "
        "multiplies `amount_minor * rate` with it, so a charge in an unsupported currency raises "
        "`TypeError` deep inside `charge()` instead of failing with a clear error."
    ),
    remediation=(
        "Raise a dedicated `UnsupportedCurrency` error for a missing code, or return a sentinel "
        "the two callers check before they multiply."
    ),
    hint="medium",
    confidence=0.62,
    provable=True,
    facts=Facts(
        public_entrypoint=True, internal_callers=3, symbol_is_tested=False,
        file_is_tested=False, commits_90d=2,
    ),
    proofs={
        "default": Proof(
            kind="passes_both",
            test_name="test_get_rate_never_returns_none_for_an_unsupported_code",
            test_code=src.REPRO_DISPROVEN,
            test_file_path=src.REPRO_DISPROVEN_PATH,
            signal="AssertionError",
            base_seconds=0.58,
            head_seconds=0.61,
        )
    },
)

JPY_SCALE = Template(
    key="demo.jpy_scale",
    specialist="bugs",
    category="correctness",
    rule_key="currency_exponent_inverted",
    file="app/billing/charge.py",
    symbol="_to_settlement",
    span=(2, 3),
    title="Scale zero-decimal currencies up, not down, in _to_settlement().",
    body=(
        "`_to_settlement()` multiplies by `MINOR_UNITS.get(currency, 100) / 100`, so for JPY, "
        "whose exponent is 0, it divides the amount by 100: `_to_settlement(1200, \"jpy\")` "
        "returns `0`, where 1200 JPY is 808 US cents at the table's rate. This change sends "
        "every account's `default_currency` through that line, including the Japanese accounts "
        "the account-settings page now lets pick `jpy`."
    ),
    remediation=(
        "Multiply by `100 / MINOR_UNITS.get(currency, 100)` instead, so JPY scales up and BHD "
        "scales down."
    ),
    hint="high",
    confidence=0.78,
    provable=True,
    facts=Facts(
        public_entrypoint=False, internal_callers=2, symbol_is_tested=True,
        file_is_tested=True, commits_90d=6,
    ),
    proofs={
        "default": Proof(
            kind="fails_both",
            test_name="test_zero_decimal_currency_settles_in_cents",
            test_code=src.REPRO_INCONCLUSIVE,
            test_file_path=src.REPRO_INCONCLUSIVE_PATH,
            signal="AssertionError",
            failure=eq_call("0", "808", "_to_settlement(1200, 'jpy')"),
            base_seconds=0.47,
            head_seconds=0.45,
        )
    },
)

FLOAT_MONEY = Template(
    key="demo.float_money",
    specialist="quality",
    category="maintainability",
    rule_key="float_money_formatting",
    file="app/api/checkout.py",
    symbol="_line",
    span=(1, 1),
    title="Format money in `_line()` from integer cents, not float division.",
    body=(
        "`_line()` formats `amount_minor / 100` with `%.2f`, so every amount goes through binary "
        "floating point before it is rounded for display. Every order summary line passes through it, and a "
        "later change that feeds the summary into an invoice or a CSV will inherit amounts that "
        "differ from the integer totals by a cent."
    ),
    remediation=(
        "Render with `divmod(amount_minor, 100)` and an integer format, or format a "
        "`Decimal(amount_minor) / 100`."
    ),
    hint="low",
    confidence=0.61,
    facts=Facts(
        public_entrypoint=False, internal_callers=3, symbol_is_tested=True,
        file_is_tested=True, commits_90d=2,
    ),
)

SUMMARY_USD = Template(
    key="demo.summary_usd",
    specialist="quality",
    category="maintainability",
    rule_key="hardcoded_currency",
    file="app/api/checkout.py",
    symbol="render_summary",
    span=(3, 3),
    title="Render the order summary in the charge's currency, not a literal \"usd\".",
    body=(
        "`render_summary()` still sets `lines[\"currency\"] = \"usd\"` (line {start}). With this "
        "change a charge settles in the account's `default_currency`, so for a EUR account the "
        "response's `currency` field says `eur` while the summary beside it says `usd`. The two "
        "copies of the currency now have to change together, and nothing ties them."
    ),
    remediation=(
        "Pass `result.currency` into `render_summary()`, or read it from the order, so the "
        "summary and the charge cannot disagree."
    ),
    hint="medium",
    confidence=0.71,
    facts=Facts(
        public_entrypoint=True, internal_callers=0, symbol_is_tested=False,
        file_is_tested=False, commits_90d=3,
    ),
)

DEMO_TEMPLATES = {
    template.key: template
    for template in (CHARGE_NONE, RATE_NONE, JPY_SCALE, FLOAT_MONEY, SUMMARY_USD)
}

# The four coordinator drops and three duplicates of the demo run, written as the specialists
# returned them. ``{file}``/``{symbol}`` are filled from the use.
DEMO_DROPS = {
    drop.key: drop
    for drop in (
        DropTemplate(
            key="demo.drop.currency_module",
            specialist="bugs",
            category="correctness",
            rule_key="stale_import_path",
            title="Import `MINOR_UNITS` from `app.billing.currency`, where this change moved it.",
            body=(
                "`charge.py` defines `MINOR_UNITS` locally while `app/billing/currency.py` "
                "exports the same table, so the two copies will drift."
            ),
            reason="hallucinated_path",
            detail="app/billing/currency.py is not part of this pull request and does not exist at head",
            hint="medium",
            confidence=0.58,
        ),
        DropTemplate(
            key="demo.drop.refund_rounding",
            specialist="tests",
            category="test_integrity",
            rule_key="weak_rounding_assertion",
            title="Pin `test_refund_rounding` to an amount that actually rounds.",
            body=(
                "`test_refund_rounding` asserts `_to_settlement(333, \"usd\") == 333`, an "
                "input the conversion never has to round, so a rounding regression would pass."
            ),
            reason="out_of_diff",
            detail="the test is unchanged by this pull request and the change does not break it",
            hint="low",
            confidence=0.64,
        ),
        DropTemplate(
            key="demo.drop.settlement_name",
            specialist="quality",
            category="maintainability",
            rule_key="unclear_helper_name",
            title="Name `_to_settlement()` after the unit it returns.",
            body="`_to_settlement()` returns US cents; the name does not say so.",
            reason="nitpick",
            detail="naming preference; nothing a caller can get wrong",
            hint="info",
            confidence=0.52,
        ),
        DropTemplate(
            key="demo.drop.rates_mutable",
            specialist="security",
            category="security",
            rule_key="mutable_rate_table",
            title="Make `_RATES` read-only so request code cannot change a rate.",
            body=(
                "`_RATES` is a module-level dict, so any code path could assign into it and move "
                "every later charge onto a different rate."
            ),
            reason="speculative",
            detail="no code path in the supplied files writes to _RATES",
            hint="medium",
            confidence=0.51,
        ),
    )
}

DEMO_DUPLICATES = {
    drop.key: drop
    for drop in (
        DropTemplate(
            key="demo.dup.charge_test",
            specialist="tests",
            category="test_integrity",
            rule_key="missing_regression_test",
            title="Pin `charge()` for an account that has no default currency.",
            body=(
                "`tests/billing/test_charge.py` adds `default_currency` to its only fixture row, "
                "so no test exercises the legacy row this change stops handling."
            ),
            reason="duplicate",
            detail="the same root cause as the bugs finding at app/billing/charge.py:41; merged into it",
            hint="medium",
            confidence=0.74,
        ),
        DropTemplate(
            key="demo.dup.charge_contract",
            specialist="quality",
            category="maintainability",
            rule_key="optional_result_unannotated",
            title="Keep `charge()` returning a `Charge` or raising, never `None`.",
            body=(
                "`charge()` is annotated `-> Charge` and now returns `None` on one path, which "
                "every caller has to discover by reading the body."
            ),
            reason="duplicate",
            detail="the same root cause as the bugs finding at app/billing/charge.py:41; merged into it",
            hint="medium",
            confidence=0.69,
        ),
        DropTemplate(
            key="demo.dup.rate_none",
            specialist="security",
            category="security",
            rule_key="optional_return_unhandled",
            title="Reject unsupported currency codes before `get_rate()` is called.",
            body=(
                "An unsupported code in `default_currency` reaches `get_rate()`, which the "
                "specialist read as returning `None`, and the charge then fails with a `TypeError`."
            ),
            reason="duplicate",
            detail="the same claim as the bugs finding at app/billing/rates.py:19; merged into it",
            hint="medium",
            confidence=0.57,
        ),
    )
}

# ---------------------------------------------------------------------------------------
# The three runs
# ---------------------------------------------------------------------------------------

FLOAT_MONEY_SUPPRESSION = Suppress(
    key="sup.checkout.float_money",
    tpl="demo.float_money",
    after_hours=3.4,
    scope="file",
    reason=(
        "Display-only: the summary string is never parsed back, and totals are computed in "
        "integer cents upstream. Revisit if the summary ever feeds an invoice."
    ),
    actor="priya-raman",
)

PR4790 = RunSpec(
    key="co-4790",
    repo=REPO,
    pr=4790,
    title="Store checkout sessions per account",
    author="mhollis",
    at="2026-09-07T13:18",
    tier="full",
    uses=(
        Use("demo.float_money", anchor="exact"),
        Use("co.session_account_key"),
        Use("nit_naming", fate="drop", file="app/checkout/session.py", symbol="create_checkout_session", specialist="quality"),
        Use("spec_race", fate="drop", file="app/checkout/session.py", symbol="expire_sessions", specialist="bugs"),
        Use("ood_old_test", fate="drop", file="app/api/checkout.py", symbol="get_order", specialist="tests"),
    ),
    extra_files=("tests/checkout/test_session.py",),
    suppress=(FLOAT_MONEY_SUPPRESSION,),
    head_ref="mhollis/session-per-account",
    pr_state="closed",
)

RUN_A = RunSpec(
    key="co-4821-a",
    repo=REPO,
    pr=PR_NUMBER,
    title=PR_TITLE,
    author=PR_AUTHOR,
    # Pinned to the millisecond: its S6 runs 11:46:01.760-11:46:02.050, and the second push
    # (DEMO_RUN) is enqueued at 11:46:01.902 — inside it.
    at="2026-09-23T11:45:36.418",
    tier="full",
    uses=(
        Use("demo.charge_none"),
        Use("demo.jpy_scale", anchor="nearest"),
        Use("demo.float_money", anchor="none"),
        Use("demo.summary_usd", anchor="file"),
        Use("demo.dup.charge_test", fate="dup:demo.charge_none", specialist="tests"),
        Use("demo.drop.settlement_name", fate="drop", file="app/billing/charge.py", symbol="_to_settlement", specialist="quality"),
    ),
    head_ref="mhollis/currency-at-charge-time",
    head_sha=FIRST_PUSH_SHA,
    base_sha=BASE_SHA,
    stage_ms=RUN_A_STAGE_MS,
)

DEMO_RUN = RunSpec(
    key="co-4821",
    repo=REPO,
    pr=PR_NUMBER,
    title=PR_TITLE,
    author=PR_AUTHOR,
    at="2026-09-23T11:46:01.902",
    tier="full",
    review_id=DEMO_REVIEW_ID,
    head_sha=HEAD_SHA,
    base_sha=BASE_SHA,
    finding_ids={
        "demo.charge_none": PROVEN_FINDING_ID,
        "demo.rate_none": DISPROVEN_FINDING_ID,
        "demo.jpy_scale": INCONCLUSIVE_FINDING_ID,
    },
    uses=(
        Use("demo.charge_none", anchor="exact"),
        Use("demo.rate_none", anchor="exact"),
        Use("demo.jpy_scale", anchor="nearest"),
        Use("demo.float_money", anchor="none"),
        Use("demo.summary_usd", anchor="file"),
        Use("demo.drop.currency_module", fate="drop", file="app/billing/currency.py", symbol="MINOR_UNITS", specialist="bugs"),
        Use("demo.drop.refund_rounding", fate="drop", file="tests/billing/test_charge.py", symbol="test_refund_rounding", specialist="tests"),
        Use("demo.drop.settlement_name", fate="drop", file="app/billing/charge.py", symbol="_to_settlement", specialist="quality"),
        Use("demo.drop.rates_mutable", fate="drop", file="app/billing/rates.py", symbol="get_rate", specialist="security"),
        Use("demo.dup.charge_test", fate="dup:demo.charge_none", specialist="tests"),
        Use("demo.dup.charge_contract", fate="dup:demo.charge_none", specialist="quality"),
        Use("demo.dup.rate_none", fate="dup:demo.rate_none", specialist="security"),
    ),
    excluded=("uv.lock",),
    stage_ms=DEMO_STAGE_MS,
    head_ref="mhollis/currency-at-charge-time",
)

RUNS = (PR4790, RUN_A, DEMO_RUN)

#: Files each demo-story run changed, relative to its base, with real contents.
CHANGED = {
    "co-4790": {
        "app/api/checkout.py": (src.CHECKOUT_PRE4790, src.CHECKOUT_BASE),
    },
    "co-4821-a": {
        path: (src.base_tree().get(path, ""), src.run_a_tree()[path])
        for path in (
            "app/billing/charge.py",
            "app/billing/accounts.py",
            "app/api/checkout.py",
            "tests/billing/test_charge.py",
            "migrations/versions/0142_account_default_currency.py",
        )
    },
    "co-4821": {
        path: (src.base_tree().get(path, ""), src.head_tree()[path])
        for path in (
            "app/billing/charge.py",
            "app/billing/rates.py",
            "app/billing/accounts.py",
            "app/api/checkout.py",
            "tests/billing/test_charge.py",
            "migrations/versions/0142_account_default_currency.py",
        )
    },
}

#: The whole head tree each demo-story run reviewed (unchanged files included).
TREES = {
    "co-4790": src.base_tree(),
    "co-4821-a": src.run_a_tree(),
    "co-4821": src.head_tree(),
}
