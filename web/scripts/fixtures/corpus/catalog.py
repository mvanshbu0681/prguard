"""The tenant's other five weeks: repositories, what their specialists wrote, and every run.

Content only. Each ``Template`` is a finding a specialist wrote against a symbol, with the facts
S2/S5 measured about that symbol; each ``RunSpec`` is one pull-request run that raised some of
them; each ``Suppress``/``Revoke`` is a human decision. Every score, band, fingerprint, proof
verdict, ladder rung, gate and hash is computed from these by ``simulate.py`` with the backend's
own functions.

Repro tests follow ``repro.py``'s rules: literal arguments, functions imported by name, and a
failing line whose pytest output has a shape observed on pytest 9.1.1.
"""

from __future__ import annotations

from corpus.model import DropTemplate, Facts, Proof, RepoSpec, Revoke, RunSpec, Suppress, Template, Use
from corpus.repro import (
    assertion,
    cmp_call,
    did_not_raise,
    eq_call,
    not_call,
    proof,
    raised,
    str_eq,
)
from corpus.synth import FileSpec, Sym

GEN_FAIL = Proof(kind="gen_fail")

# =======================================================================================
# acme/checkout-service — the demo repository. App not installed: the gate lands as a
# commit status. pytest is configured with -rN.
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
            "app/billing/retry.py",
            doc="Charge creation with retries on gateway timeouts.",
            imports=("import time",),
            symbols=(
                Sym("create_charge_with_retry", lines=18, params=("params: dict", "client")),
                Sym("_backoff", lines=6, params=("attempt: int",)),
                Sym("_is_retryable", lines=8, params=("error: Exception",)),
                Sym("record_attempt", lines=12, params=("charge_id: str", "attempt: int")),
            ),
        ),
        FileSpec(
            "app/billing/refunds.py",
            doc="Refunds against settled charges.",
            imports=("from app.billing.reasons import REASON_CODES",),
            symbols=(
                Sym("create_refund", lines=16, params=("charge_id: str", "amount_minor: int", "reason_code: str")),
                Sym("validate_reason", lines=8, params=("code: str",)),
                Sym("refundable_amount", lines=12, params=("charge",)),
                Sym("notify_refund", lines=10, params=("refund",)),
            ),
        ),
        FileSpec(
            "app/api/orders.py",
            doc="Order history routes.",
            imports=("from fastapi import APIRouter",),
            symbols=(
                Sym("list_orders", lines=16, params=("account_id: str", "page: int = 1", "per_page: int = 20"), decorator='@router.get("/orders")'),
                Sym("serialize_order", lines=12, params=("order",)),
                Sym("order_totals", lines=10, params=("orders",)),
                Sym("_line_items", lines=12, params=("order",)),
                Sym("export_orders_csv", lines=14, params=("account_id: str",), decorator='@router.get("/orders.csv")'),
            ),
        ),
        FileSpec(
            "app/billing/tax.py",
            doc="VAT for EU accounts.",
            imports=("from decimal import ROUND_HALF_UP, Decimal",),
            symbols=(
                Sym("vat_for", lines=14, params=("amount_minor: int", "country: str")),
                Sym("rate_for_country", lines=8, params=("country: str",)),
                Sym("invoice_tax_total", lines=14, params=("lines",)),
                Sym("round_minor", lines=6, params=("value",)),
            ),
        ),
        FileSpec(
            "app/billing/stripe_client.py",
            doc="The Stripe SDK behind the gateway interface.",
            imports=("import stripe",),
            symbols=(
                Sym("create_payment_intent", lines=14, params=("amount_minor: int", "currency: str")),
                Sym("confirm_intent", lines=10, params=("intent_id: str",)),
                Sym("webhook_signature_ok", lines=12, params=("payload: bytes", "header: str")),
                Sym("_client", lines=6),
            ),
        ),
        FileSpec(
            "app/checkout/cards.py",
            doc="Saved cards shown on the payment step.",
            symbols=(
                Sym("saved_cards_for", lines=14, params=("account_id: str",)),
                Sym("mask_card", lines=6, params=("card",)),
                Sym("default_card", lines=10, params=("cards",)),
            ),
        ),
        FileSpec("tests/checkout/test_session.py", doc="Tests for checkout sessions.",
                 symbols=(Sym("test_session_is_created", lines=8), Sym("test_expired_sessions_are_swept", lines=10))),
        FileSpec("tests/billing/test_retry.py", doc="Tests for charge retries.",
                 symbols=(Sym("test_retries_on_timeout", lines=10), Sym("test_gives_up_after_max_attempts", lines=10))),
        FileSpec("tests/api/test_orders.py", doc="Tests for order history.",
                 symbols=(Sym("test_first_page", lines=10), Sym("test_empty_history", lines=8))),
        FileSpec("tests/billing/test_tax.py", doc="Tests for VAT.",
                 symbols=(Sym("test_vat_germany", lines=8), Sym("test_vat_reverse_charge", lines=10))),
    ),
)

# =======================================================================================
# acme/ledger — double-entry ledger and settlement. App installed: check runs.
# =======================================================================================

LEDGER = RepoSpec(
    key="ledger",
    owner="acme",
    name="ledger",
    app_installed=True,
    files=(
        FileSpec(
            "app/reconcile/adyen.py",
            doc="Nightly reconciliation of Adyen settlement reports.",
            imports=("from datetime import date, datetime",),
            symbols=(
                Sym("reconcile_settlements", lines=18, params=("report", "day: date")),
                Sym("_parse_report_row", lines=12, params=("row: dict",)),
                Sym("match_payouts", lines=16, params=("rows", "payouts")),
                Sym("_within_tolerance", lines=6, params=("expected", "actual")),
            ),
        ),
        FileSpec(
            "app/payouts/batch.py",
            doc="Payout batches, one per currency.",
            symbols=(
                Sym("build_payout_batch", lines=16, params=("entries", "currency: str")),
                Sym("group_by_currency", lines=10, params=("entries",)),
                Sym("batch_total", lines=8, params=("amounts",)),
                Sym("schedule_batch", lines=12, params=("batch", "run_at")),
            ),
        ),
        FileSpec(
            "app/invoices/numbering.py",
            doc="Per-tenant invoice number sequences.",
            symbols=(
                Sym("next_invoice_number", lines=14, params=("tenant_id: str",)),
                Sym("format_number", lines=6, params=("seq: int", "year: int")),
                Sym("reset_sequence", lines=10, params=("tenant_id: str", "year: int")),
            ),
        ),
        FileSpec(
            "app/reports/export.py",
            doc="CSV export of ledger entries for finance.",
            imports=("import csv",),
            symbols=(
                Sym("export_entries_csv", lines=16, params=("entries", "handle")),
                Sym("_row_for", lines=12, params=("entry",)),
                Sym("export_filename", lines=6, params=("tenant: str", "day")),
                Sym("_money", lines=6, params=("amount_minor: int",)),
            ),
        ),
        FileSpec(
            "app/refunds/reconcile.py",
            doc="Partial refunds in the reconciliation job.",
            symbols=(
                Sym("apply_partial_refund", lines=16, params=("entry", "refund")),
                Sym("refund_balance", lines=8, params=("entry",)),
                Sym("_split_fee", lines=10, params=("fee_minor: int", "ratio")),
            ),
        ),
        FileSpec(
            "app/settlement/fetch.py",
            doc="Settlement reports from every provider.",
            imports=("import asyncio",),
            symbols=(
                Sym("fetch_settlements", lines=16, params=("providers", "day")),
                Sym("_fetch_one", lines=12, params=("provider", "day")),
                Sym("merge_batches", lines=10, params=("batches",)),
            ),
        ),
        FileSpec(
            "migrations/versions/0087_invoice_sequences.py",
            doc="invoice sequences",
            imports=("from alembic import op", "import sqlalchemy as sa"),
            symbols=(Sym("upgrade", lines=14), Sym("downgrade", lines=8)),
        ),
        FileSpec(
            "migrations/versions/0091_drop_ledger_v1.py",
            doc="drop ledger v1",
            imports=("from alembic import op",),
            symbols=(Sym("upgrade", lines=10), Sym("downgrade", lines=12)),
        ),
        FileSpec("tests/reconcile/test_adyen.py", doc="Tests for Adyen reconciliation.",
                 symbols=(Sym("test_matches_same_day", lines=10), Sym("test_flags_missing_payout", lines=10))),
        FileSpec("tests/payouts/test_batch.py", doc="Tests for payout batches.",
                 symbols=(Sym("test_groups_by_currency", lines=10), Sym("test_schedules_batch", lines=8))),
    ),
)

# =======================================================================================
# acme/identity-gateway — sessions, SSO, OAuth. App installed.
# =======================================================================================

IDENTITY = RepoSpec(
    key="identity",
    owner="acme",
    name="identity-gateway",
    app_installed=True,
    files=(
        FileSpec(
            "app/auth/session.py",
            doc="Session issue, refresh and revocation.",
            symbols=(
                Sym("refresh_session", lines=16, params=("refresh_token: str",)),
                Sym("_swap_tokens", lines=10, params=("old", "new")),
                Sym("revoke_session", lines=12, params=("session_id: str",)),
                Sym("issue_session", lines=14, params=("user",)),
            ),
        ),
        FileSpec(
            "app/sso/saml.py",
            doc="SAML assertion validation.",
            imports=("from datetime import datetime, timedelta",),
            symbols=(
                Sym("validate_assertion", lines=16, params=("xml: str", "now: datetime")),
                Sym("_check_conditions", lines=12, params=("conditions", "now: datetime")),
                Sym("parse_assertion", lines=14, params=("xml: str",)),
                Sym("audience_ok", lines=6, params=("audience: str", "expected: str")),
            ),
        ),
        FileSpec(
            "app/auth/reset.py",
            doc="Password reset requests.",
            imports=("import hashlib",),
            symbols=(
                Sym("request_password_reset", lines=14, params=("email: str",), decorator='@router.post("/password-reset")'),
                Sym("verify_reset_token", lines=10, params=("token: str", "stored_hash: str")),
                Sym("_rate_limit_key", lines=6, params=("email: str",)),
                Sym("send_reset_email", lines=12, params=("user", "token: str")),
            ),
        ),
        FileSpec(
            "app/oauth/authorize.py",
            doc="The OAuth 2.1 authorize endpoint.",
            imports=("import hashlib",),
            symbols=(
                Sym("authorize", lines=18, params=("request",), decorator='@router.get("/authorize")'),
                Sym("verify_pkce", lines=10, params=("verifier: str", "challenge: str", "method: str")),
                Sym("_redirect_ok", lines=8, params=("uri: str", "client")),
                Sym("issue_code", lines=12, params=("client", "user")),
            ),
        ),
        FileSpec(
            "app/auth/jwks.py",
            doc="Signing keys from the identity provider.",
            symbols=(
                Sym("get_signing_keys", lines=14),
                Sym("_fetch_jwks", lines=10, params=("url: str",)),
                Sym("key_for_kid", lines=8, params=("kid: str",)),
            ),
        ),
        FileSpec(
            "app/admin/break_glass.py",
            doc="Emergency admin access, audited.",
            symbols=(
                Sym("break_glass_login", lines=16, params=("user", "reason: str")),
                Sym("audit_break_glass", lines=10, params=("user", "reason: str")),
                Sym("_admin_allowed", lines=8, params=("user",)),
            ),
        ),
        FileSpec(
            "app/scim/users.py",
            doc="SCIM provisioning endpoints for the enterprise IdPs.",
            symbols=(
                Sym("deprovision_user", lines=16, params=("user_id: str",), decorator='@router.delete("/scim/v2/Users/{user_id}")'),
                Sym("provision_user", lines=14, params=("payload: dict",)),
                Sym("_active_flag", lines=6, params=("payload: dict",)),
            ),
        ),
        FileSpec("tests/auth/test_session.py", doc="Tests for sessions.",
                 symbols=(Sym("test_refresh_rotates_token", lines=10), Sym("test_revoked_session_rejected", lines=10))),
        FileSpec("tests/oauth/test_authorize.py", doc="Tests for the authorize endpoint.",
                 symbols=(Sym("test_code_issued", lines=10), Sym("test_bad_redirect_rejected", lines=8))),
    ),
)

# =======================================================================================
# acme/web-storefront — TypeScript. No finding here is executable in a Python sandbox.
# =======================================================================================

STOREFRONT = RepoSpec(
    key="storefront",
    owner="acme",
    name="web-storefront",
    app_installed=True,
    files=(
        FileSpec("src/checkout/AddressForm.tsx", symbols=(
            Sym("validateAddress", lines=16, params=("address: Address",)),
            Sym("normalizePostcode", lines=8, params=("value: string", "country: string")),
            Sym("AddressForm", lines=18, params=("props: AddressFormProps",)),
            Sym("countryLabel", lines=6, params=("code: string",)),
        )),
        FileSpec("src/components/ProductGrid.tsx", symbols=(
            Sym("ProductGrid", lines=18, params=("props: ProductGridProps",)),
            Sym("useLazyImages", lines=14, params=("refs: HTMLElement[]",)),
            Sym("placeholderFor", lines=6, params=("product: Product",)),
            Sym("gridColumns", lines=8, params=("width: number",)),
        )),
        FileSpec("src/cart/storage.ts", symbols=(
            Sym("saveCart", lines=12, params=("cart: Cart",)),
            Sym("loadCart", lines=12),
            Sym("migrateCart", lines=14, params=("raw: unknown",)),
            Sym("cartKey", lines=6, params=("userId: string | null",)),
            Sym("mergeCarts", lines=14, params=("guest: Cart", "saved: Cart")),
        )),
        FileSpec("src/routes/index.tsx", symbols=(
            Sym("routes", lines=18),
            Sym("lazyRoute", lines=10, params=("path: string",)),
            Sym("NotFound", lines=8),
            Sym("productLoader", lines=12, params=("args: LoaderArgs",)),
        )),
        FileSpec("src/components/CurrencySwitcher.tsx", symbols=(
            Sym("CurrencySwitcher", lines=16, params=("props: SwitcherProps",)),
            Sym("formatPrice", lines=10, params=("amountMinor: number", "currency: string")),
            Sym("useCurrency", lines=12),
            Sym("currencyOptions", lines=6),
        )),
        FileSpec("src/checkout/PayButton.tsx", symbols=(
            Sym("PayButton", lines=16, params=("props: PayButtonProps",)),
            Sym("submitPayment", lines=14, params=("intent: PaymentIntent",)),
            Sym("useDoubleSubmitGuard", lines=12),
            Sym("buttonLabel", lines=6, params=("state: PayState",)),
        )),
        FileSpec("src/consent/Banner.tsx", symbols=(
            Sym("ConsentBanner", lines=16, params=("props: BannerProps",)),
            Sym("readConsent", lines=10),
            Sym("writeConsent", lines=10, params=("choice: ConsentChoice",)),
            Sym("consentExpired", lines=6, params=("stored: StoredConsent",)),
        )),
        FileSpec("src/components/Footer.tsx", symbols=(
            Sym("Footer", lines=16, params=("props: FooterProps",)),
            Sym("footerLinks", lines=12, params=("locale: string",)),
        )),
        FileSpec("src/cart/storage.test.ts", symbols=(
            Sym("savesTheCart", lines=10), Sym("loadsAnEmptyCart", lines=8),
        )),
    ),
)

# =======================================================================================
# acme/infra-terraform — Terraform and CI. The deployment cannot read this repository's
# commits API, so churn is unavailable and scored 0.0. App not installed.
# =======================================================================================

INFRA = RepoSpec(
    key="infra",
    owner="acme",
    name="infra-terraform",
    app_installed=False,
    churn_available=False,
    files=(
        FileSpec("terraform/s3_invoices.tf", symbols=(
            Sym("aws_s3_bucket.invoices", lines=12),
            Sym("aws_s3_bucket_policy.invoices", lines=16),
            Sym("aws_s3_bucket_public_access_block.invoices", lines=8),
            Sym("aws_s3_bucket_versioning.invoices", lines=8),
            Sym("aws_s3_bucket_lifecycle_configuration.invoices", lines=14),
        )),
        FileSpec("terraform/rds_ledger.tf", symbols=(
            Sym("aws_db_instance.ledger_replica", lines=18),
            Sym("aws_db_parameter_group.ledger", lines=10),
            Sym("aws_db_subnet_group.ledger", lines=8),
            Sym("aws_security_group.ledger_db", lines=12),
        )),
        FileSpec(".github/workflows/ci.yml", symbols=(
            Sym("build", lines=12), Sym("test", lines=14), Sym("deploy", lines=12),
        )),
        FileSpec("terraform/kms.tf", symbols=(
            Sym("aws_kms_key.secrets", lines=14),
            Sym("aws_kms_alias.secrets", lines=6),
            Sym("aws_kms_key_policy.secrets", lines=16),
        )),
        FileSpec("terraform/waf.tf", symbols=(
            Sym("aws_wafv2_web_acl.public", lines=18),
            Sym("aws_wafv2_web_acl_association.alb", lines=6),
            Sym("aws_wafv2_ip_set.blocked", lines=8),
        )),
        FileSpec("terraform/iam_ci.tf", symbols=(
            Sym("aws_iam_role.ci_deploy", lines=12),
            Sym("aws_iam_role_policy.ci_deploy", lines=16),
            Sym("aws_iam_openid_connect_provider.github", lines=8),
        )),
    ),
)

# =======================================================================================
# acme/notifications — email, SMS and push. App not installed.
# =======================================================================================

NOTIFICATIONS = RepoSpec(
    key="notifications",
    owner="acme",
    name="notifications",
    app_installed=False,
    files=(
        FileSpec(
            "app/providers/sms.py",
            doc="Batched SMS sends through Twilio.",
            symbols=(
                Sym("send_batch", lines=16, params=("messages",)),
                Sym("_chunk", lines=8, params=("messages", "size: int")),
                Sym("render_sms", lines=10, params=("template: str", "context: dict")),
                Sym("_client", lines=6),
                Sym("handle_delivery_receipt", lines=14, params=("request",), decorator='@router.post("/twilio/receipts")'),
            ),
        ),
        FileSpec(
            "app/workers/webhooks.py",
            doc="Outbound webhook delivery with retries.",
            symbols=(
                Sym("deliver_webhook", lines=18, params=("event", "endpoint")),
                Sym("_retry_delay", lines=8, params=("attempt: int",)),
                Sym("_sign", lines=8, params=("payload: bytes", "secret: str")),
                Sym("mark_failed", lines=10, params=("delivery",)),
            ),
        ),
        FileSpec(
            "app/unsubscribe/links.py",
            doc="Unsubscribe links in marketing and digest emails.",
            imports=("import base64",),
            symbols=(
                Sym("unsubscribe_url", lines=10, params=("user_id: str", "list_id: str")),
                Sym("verify_unsubscribe", lines=12, params=("token: str",)),
                Sym("_token_for", lines=8, params=("user_id: str", "list_id: str")),
            ),
        ),
        FileSpec(
            "app/workers/digest.py",
            doc="Weekly digest emails.",
            imports=("from datetime import datetime",),
            symbols=(
                Sym("build_digest", lines=16, params=("user", "since: datetime")),
                Sym("_group_by_topic", lines=12, params=("items",)),
                Sym("send_digest", lines=10, params=("digest",)),
                Sym("digest_window", lines=8, params=("user", "now: datetime")),
            ),
        ),
        FileSpec(
            "app/push/dedupe.py",
            doc="Push notification de-duplication per device.",
            symbols=(
                Sym("should_send", lines=14, params=("device_id: str", "notification_id: str")),
                Sym("_dedupe_key", lines=6, params=("device_id: str", "notification_id: str")),
                Sym("prune_seen", lines=12, params=("before",)),
            ),
        ),
        FileSpec(
            "app/templates/render.py",
            doc="Email template rendering.",
            imports=("from jinja2 import Environment",),
            symbols=(
                Sym("render_email", lines=14, params=("template: str", "context: dict")),
                Sym("_environment", lines=8),
                Sym("subject_for", lines=8, params=("template: str", "context: dict")),
            ),
        ),
        FileSpec("tests/workers/test_webhooks.py", doc="Tests for webhook delivery.",
                 symbols=(Sym("test_delivers_once", lines=10), Sym("test_signs_payload", lines=8))),
        FileSpec("tests/providers/test_sms.py", doc="Tests for SMS batching.",
                 symbols=(Sym("test_chunks_by_fifty", lines=8), Sym("test_renders_template", lines=8))),
    ),
)

REPOS = (CHECKOUT, LEDGER, IDENTITY, STOREFRONT, INFRA, NOTIFICATIONS)


# =======================================================================================
# Findings — acme/checkout-service
# =======================================================================================

T: dict[str, Template] = {}


def template(**kwargs) -> Template:
    item = Template(**kwargs)
    if item.key in T:
        raise KeyError(f"duplicate template {item.key}")
    T[item.key] = item
    return item


template(
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
    facts=Facts(internal_callers=2, file_is_tested=True, commits_90d=3),
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

template(
    key="co.retry_new_key",
    specialist="bugs",
    category="correctness",
    rule_key="idempotency_key_regenerated",
    file="app/billing/retry.py",
    symbol="create_charge_with_retry",
    span=(4, 7),
    title="Each retry sends a new idempotency key, so a timed-out charge can be taken twice",
    body=(
        "`create_charge_with_retry()` builds the idempotency key inside the retry loop "
        "(line {start}), so every attempt sends a different one. When the gateway times out "
        "after it has already created the charge, the retry creates a second charge and the "
        "customer pays twice for one order."
    ),
    hint="critical",
    confidence=0.88,
    provable=True,
    facts=Facts(internal_callers=4, file_is_tested=True, commits_90d=8),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/billing/retry.py::create_charge_with_retry",
            claim="each retry sends a new idempotency key.",
            imports=("from app.billing.retry import create_charge_with_retry",),
            setup=(
                "class TimesOutOnce:",
                '    """Times out on the first call after recording it, as the gateway does."""',
                "",
                "    def __init__(self):",
                "        self.keys = []",
                "",
                "    def create_charge(self, params, idempotency_key):",
                "        self.keys.append(idempotency_key)",
                "        if len(self.keys) == 1:",
                '            raise TimeoutError("gateway read timeout")',
                '        return {"id": "ch_repro_0001"}',
            ),
            test_name="test_retry_reuses_the_idempotency_key",
            body=(
                "gateway = TimesOutOnce()",
                'create_charge_with_retry({"amount_minor": 1200, "currency": "usd"}, client=gateway)',
                "first, second = gateway.keys",
                "assert first == second",
            ),
            signal="AssertionError",
            failure=str_eq("idem_4f1c9a2e", "idem_b7d3e016"),
            base_seconds=0.44,
            head_seconds=0.41,
        )
    },
)

template(
    key="co.retry_backoff_unbounded",
    specialist="quality",
    category="performance",
    rule_key="unbounded_backoff",
    file="app/billing/retry.py",
    symbol="_backoff",
    span=(1, 2),
    title="Cap the retry backoff in _backoff(); the twelfth attempt sleeps for 34 minutes",
    body=(
        "`_backoff()` returns `0.5 * 2 ** attempt` seconds with no ceiling (line {start}). "
        "`MAX_ATTEMPTS` comes from config, and at the configured 12 the last sleep is 2048 "
        "seconds, held on the request thread that is serving the checkout."
    ),
    hint="medium",
    confidence=0.8,
    facts=Facts(internal_callers=1, symbol_is_tested=True, commits_90d=8),
)

template(
    key="co.refund_negative",
    specialist="bugs",
    category="correctness",
    rule_key="unvalidated_negative_amount",
    file="app/billing/refunds.py",
    symbol="create_refund",
    span=(2, 4),
    title="create_refund() no longer rejects a negative amount",
    body=(
        "The amount check moved into `validate_reason()` with this change and now only runs "
        "when a reason code is given (line {start}). `create_refund(\"ch_3Qx9\", -500)` builds a "
        "refund of -500, which the gateway books as a charge."
    ),
    hint="high",
    confidence=0.71,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=3, file_is_tested=True, commits_90d=5),
    proofs={
        "default": proof(
            "wrong_signal",
            target="app/billing/refunds.py::create_refund",
            claim="create_refund() accepts a negative amount.",
            imports=("from app.billing.refunds import create_refund",),
            test_name="test_negative_refund_is_rejected",
            body=(
                'refund = create_refund("ch_3Qx9", -500, reason="duplicate")',
                'assert refund.status == "rejected"',
            ),
            signal="ValueError",
            failure=raised(
                "TypeError",
                "create_refund() got an unexpected keyword argument 'reason'",
                'create_refund("ch_3Qx9", -500, reason="duplicate")',
                line="refund = create_refund(",
            ),
            base_seconds=0.33,
            head_seconds=0.31,
        )
    },
)

template(
    key="co.refund_reason_values",
    specialist="quality",
    category="maintainability",
    rule_key="membership_test_on_values",
    file="app/billing/refunds.py",
    symbol="validate_reason",
    span=(1, 3),
    title="Validate reason codes against the keys of REASON_CODES, not its values",
    body=(
        "`validate_reason()` checks `code in REASON_CODES.values()` (line {start}), so the "
        "human-readable label \"Duplicate charge\" passes as a code and is stored verbatim."
    ),
    hint="medium",
    confidence=0.77,
    facts=Facts(internal_callers=2, file_is_tested=True, commits_90d=5),
)

template(
    key="co.page_offset",
    specialist="bugs",
    category="correctness",
    rule_key="off_by_one_offset",
    file="app/api/orders.py",
    symbol="list_orders",
    span=(3, 5),
    title="list_orders() starts every page after the first one order late",
    body=(
        "`list_orders()` computes `offset = (page - 1) * per_page + 1` (line {start}). Pages "
        "are 1-based and the offset is 0-based, so page 2 starts at the 22nd order and the 21st "
        "is never listed."
    ),
    hint="high",
    confidence=0.9,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=4, file_is_tested=False, commits_90d=5),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/api/orders.py::list_orders",
            claim="page 2 skips the 21st order.",
            imports=("from app.api.orders import page_offset",),
            test_name="test_page_two_starts_at_the_twenty_first_order",
            body=("assert page_offset(2, 20) == 20",),
            signal="AssertionError",
            failure=eq_call("21", "20", "page_offset(2, 20)"),
            base_seconds=0.28,
            head_seconds=0.27,
        )
    },
)

template(
    key="co.orders_n_plus_one",
    specialist="quality",
    category="performance",
    rule_key="n_plus_one_query",
    file="app/api/orders.py",
    symbol="serialize_order",
    span=(2, 4),
    title="serialize_order() loads line items one order at a time",
    body=(
        "`serialize_order()` reads `order.line_items` (line {start}), a lazy relationship, "
        "once per order on the page. A 20-order page issues 21 queries."
    ),
    hint="medium",
    confidence=0.74,
    facts=Facts(internal_callers=2, file_is_tested=False, commits_90d=5),
)

template(
    key="co.stripe_deprecated",
    specialist="quality",
    category="maintainability",
    rule_key="deprecated_sdk_call",
    file="app/billing/stripe_client.py",
    symbol="confirm_intent",
    span=(1, 3),
    title="Replace PaymentIntent.confirm(return_url=...) removed in stripe 12",
    body=(
        "stripe 12 removed the `return_url` keyword from `PaymentIntent.confirm()` in favour "
        "of `confirmation_token`; `confirm_intent()` still passes it (line {start}). The SDK "
        "raises `TypeError` for 3-D Secure cards only, so the happy path in tests stays green."
    ),
    hint="high",
    confidence=0.69,
    facts=Facts(internal_callers=2, symbol_is_tested=True, commits_90d=3),
)

template(
    key="co.stripe_webhook_tolerance",
    specialist="security",
    category="security",
    rule_key="webhook_replay_window",
    file="app/billing/stripe_client.py",
    symbol="webhook_signature_ok",
    span=(2, 5),
    title="webhook_signature_ok() accepts events signed up to an hour ago",
    body=(
        "The upgrade passes `tolerance=3600` to `stripe.Webhook.construct_event()` (line "
        "{start}); the SDK default is 300 seconds. A captured webhook can be replayed for an "
        "hour, including `charge.refunded`."
    ),
    hint="high",
    confidence=0.73,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=True, commits_90d=3),
    proofs={"default": GEN_FAIL},
)

template(
    key="co.vat_half_even",
    specialist="bugs",
    category="correctness",
    rule_key="bankers_rounding",
    file="app/billing/tax.py",
    symbol="vat_for",
    span=(3, 6),
    title="vat_for() rounds half-to-even, so 0.5-cent VAT rounds down on even cents",
    body=(
        "`vat_for()` quantizes with `Decimal.quantize()` and no rounding argument (line "
        "{start}), which is `ROUND_HALF_EVEN`. German invoicing requires half-up, and "
        "`vat_for(1250, \"DE\")` would produce 237 instead of 238."
    ),
    hint="high",
    confidence=0.66,
    provable=True,
    facts=Facts(internal_callers=5, file_is_tested=True, commits_90d=4),
    proofs={
        "default": proof(
            "passes_both",
            target="app/billing/tax.py::vat_for",
            claim="vat_for() rounds half-to-even.",
            imports=("from app.billing.tax import vat_for",),
            test_name="test_half_cent_vat_rounds_up",
            body=('assert vat_for(1250, "DE") == 238',),
            signal="AssertionError",
            base_seconds=0.3,
            head_seconds=0.29,
        )
    },
)

template(
    key="co.invoice_tax_total",
    specialist="bugs",
    category="correctness",
    rule_key="sum_of_rounded_lines",
    file="app/billing/tax.py",
    symbol="invoice_tax_total",
    span=(2, 5),
    title="invoice_tax_total() sums rounded line taxes, so the total drifts from the rate",
    body=(
        "Rounding each line before summing (line {start}) makes the invoice total differ from "
        "`rate * net` by up to one cent per line. Three lines of 333 cents at 19% give 189 "
        "where the invoice rate gives 190."
    ),
    hint="medium",
    confidence=0.7,
    provable=True,
    facts=Facts(internal_callers=1, symbol_is_tested=True, commits_90d=4),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/billing/tax.py::invoice_tax_total",
            claim="the invoice total drifts from rate times net.",
            imports=("from app.billing.tax import invoice_tax_total",),
            test_name="test_three_lines_total_at_the_invoice_rate",
            body=('assert invoice_tax_total([333, 333, 333], "DE") == 190',),
            signal="AssertionError",
            failure=eq_call("189", "190", "invoice_tax_total([333, 333, 333], 'DE')"),
            base_seconds=0.29,
            head_seconds=0.3,
        )
    },
)

template(
    key="co.cards_masking",
    specialist="security",
    category="security",
    rule_key="card_number_exposed",
    file="app/checkout/cards.py",
    symbol="mask_card",
    span=(1, 3),
    title="mask_card() keeps the first six digits as well as the last four",
    body=(
        "`mask_card()` returns `number[:6] + '******' + number[-4:]` (line {start}). The "
        "payment step renders it in the page, and PCI DSS allows the BIN or the last four to "
        "be displayed, not both on a customer-facing page."
    ),
    hint="high",
    confidence=0.62,
    provable=True,
    facts=Facts(internal_callers=3, file_is_tested=False, commits_90d=2),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/checkout/cards.py::mask_card",
            claim="the masked number still shows the BIN.",
            imports=("from app.checkout.cards import mask_card",),
            test_name="test_masked_card_hides_the_bin",
            body=('assert mask_card("4242424242424242") == "************4242"',),
            signal="AssertionError",
            failure=str_eq("424242******4242", "************4242"),
            base_seconds=0.27,
            head_seconds=0.26,
        )
    },
)

# =======================================================================================
# Findings — acme/ledger
# =======================================================================================

template(
    key="lg.naive_datetime",
    specialist="bugs",
    category="correctness",
    rule_key="naive_aware_comparison",
    file="app/reconcile/adyen.py",
    symbol="_parse_report_row",
    span=(2, 4),
    title="_parse_report_row() builds naive datetimes that are compared with aware ones",
    body=(
        "Adyen's report timestamps carry no offset and `_parse_report_row()` parses them with "
        "`datetime.strptime` (line {start}); `match_payouts()` compares them with the aware "
        "`payout.booked_at`, which raises `TypeError` on the first row."
    ),
    hint="high",
    confidence=0.83,
    provable=True,
    facts=Facts(internal_callers=3, file_is_tested=False, commits_90d=6),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/reconcile/adyen.py::_parse_report_row",
            claim="report rows parse to naive datetimes.",
            imports=("from datetime import UTC, datetime", "", "from app.reconcile.adyen import parse_booked_at"),
            test_name="test_report_timestamps_compare_with_booked_payouts",
            body=('assert parse_booked_at("2026-08-18 23:14:09") < datetime(2026, 8, 19, tzinfo=UTC)',),
            signal="TypeError",
            failure=raised(
                "TypeError",
                "can't compare offset-naive and offset-aware datetimes",
                'parse_booked_at("2026-08-18 23:14:09") < datetime(2026, 8, 19, tzinfo=UTC)',
            ),
            base_seconds=0.31,
            head_seconds=0.3,
        )
    },
)

template(
    key="lg.tolerance_float",
    specialist="quality",
    category="maintainability",
    rule_key="float_money_comparison",
    file="app/reconcile/adyen.py",
    symbol="_within_tolerance",
    span=(1, 2),
    title="Compare settlement amounts in integer cents in _within_tolerance()",
    body=(
        "`_within_tolerance()` compares `abs(expected - actual) < 0.01` on floats (line "
        "{start}); integer cents avoid a tolerance that is itself a binary fraction."
    ),
    hint="low",
    confidence=0.6,
    facts=Facts(internal_callers=1, symbol_is_tested=True, commits_90d=3),
)

template(
    key="lg.payout_float_sum",
    specialist="bugs",
    category="correctness",
    rule_key="float_money_sum",
    file="app/payouts/batch.py",
    symbol="batch_total",
    span=(1, 3),
    title="batch_total() sums payout amounts as floats and loses a cent on large batches",
    body=(
        "`batch_total()` converts each amount to major units before summing (line {start}), "
        "so the total of 10 000 payouts of 0.10 is 999.9999999999"
        " and the batch file reports 999.99."
    ),
    hint="critical",
    confidence=0.9,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=6, file_is_tested=True, commits_90d=7),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/payouts/batch.py::batch_total",
            claim="large batches lose a cent to float summation.",
            imports=("from app.payouts.batch import batch_total_minor",),
            test_name="test_ten_thousand_dimes_total_one_thousand",
            body=("assert batch_total_minor(10, 10000) == 100000",),
            signal="AssertionError",
            failure=eq_call("99999", "100000", "batch_total_minor(10, 10000)"),
            base_seconds=0.52,
            head_seconds=0.49,
        )
    },
)

template(
    key="lg.empty_batch",
    specialist="bugs",
    category="correctness",
    rule_key="empty_batch_index_error",
    file="app/payouts/batch.py",
    symbol="build_payout_batch",
    span=(3, 5),
    title="build_payout_batch() emits a zero-amount entry for a currency with no payouts",
    body=(
        "`build_payout_batch()` seeds every currency's batch with a placeholder entry "
        "(line {start}) and never removes it, so a currency with no payouts produces a "
        "zero-amount instruction that the bank rejects for the whole file."
    ),
    hint="medium",
    confidence=0.72,
    provable=True,
    facts=Facts(internal_callers=2, file_is_tested=True, commits_90d=7),
    proofs={
        "default": proof(
            "fails_both",
            target="app/payouts/batch.py::build_payout_batch",
            claim="an empty currency produces a zero-amount entry.",
            imports=("from app.payouts.batch import build_payout_batch",),
            test_name="test_empty_currency_builds_an_empty_batch",
            body=('assert len(build_payout_batch([], "sek")) == 0',),
            signal="AssertionError",
            failure=assertion(
                "assert 1 == 0",
                " +  where 1 = len([{'amount_minor': 0, 'currency': 'sek'}])",
                " +    where [{'amount_minor': 0, 'currency': 'sek'}] = build_payout_batch([], 'sek')",
            ),
            base_seconds=0.33,
            head_seconds=0.34,
        )
    },
)

template(
    key="lg.invoice_seq_race",
    specialist="bugs",
    category="correctness",
    rule_key="max_plus_one_race",
    file="app/invoices/numbering.py",
    symbol="next_invoice_number",
    span=(2, 5),
    title="next_invoice_number() reads MAX(seq) + 1 without a lock",
    body=(
        "Two invoices finalised together for one tenant both read the same `MAX(seq)` "
        "(line {start}) and are given the same number; the unique index then fails the second "
        "finalisation with a 500."
    ),
    hint="high",
    confidence=0.76,
    provable=True,
    facts=Facts(internal_callers=3, file_is_tested=False, commits_90d=2),
    proofs={
        "default": proof(
            "head_timeout",
            target="app/invoices/numbering.py::next_invoice_number",
            claim="two concurrent callers get the same number.",
            imports=(
                "from concurrent.futures import ThreadPoolExecutor",
                "",
                "from app.invoices.numbering import next_invoice_number",
            ),
            test_name="test_concurrent_numbers_are_distinct",
            body=(
                "with ThreadPoolExecutor(max_workers=2) as pool:",
                '    numbers = list(pool.map(next_invoice_number, ["tnt_4a", "tnt_4a"]))',
                "assert numbers[0] != numbers[1]",
            ),
            signal="AssertionError",
            base_seconds=0.62,
        )
    },
)

template(
    key="lg.migration_not_null",
    specialist="bugs",
    category="correctness",
    rule_key="not_null_without_default",
    file="migrations/versions/0087_invoice_sequences.py",
    symbol="upgrade",
    span=(2, 4),
    title="The migration adds a NOT NULL column with no default to a populated table",
    body=(
        "`upgrade()` adds `invoices.seq` as `nullable=False` with no `server_default` "
        "(line {start}); on production's 1.9 million invoices the `ALTER TABLE` fails."
    ),
    hint="high",
    confidence=0.81,
    provable=True,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=1),
    proofs={
        "default": proof(
            "collection_error",
            target="migrations/versions/0087_invoice_sequences.py::upgrade",
            claim="the ALTER TABLE fails on a populated table.",
            imports=(
                "import sqlalchemy as sa",
                "from alembic.migration import MigrationContext",
                "from alembic.operations import Operations",
            ),
            test_name="test_upgrade_on_a_populated_table",
            body=(
                'engine = sa.create_engine("sqlite://")',
                "with engine.begin() as connection:",
                '    connection.execute(sa.text("CREATE TABLE invoices (id INTEGER PRIMARY KEY)"))',
                '    connection.execute(sa.text("INSERT INTO invoices (id) VALUES (1)"))',
                "    op = Operations(MigrationContext.configure(connection))",
                '    op.add_column("invoices", sa.Column("seq", sa.Integer(), nullable=False))',
            ),
            signal="IntegrityError",
            missing_module="alembic",
            base_seconds=0.12,
            head_seconds=0.12,
        )
    },
)

template(
    key="lg.csv_injection",
    specialist="security",
    category="security",
    rule_key="csv_formula_injection",
    file="app/reports/export.py",
    symbol="_row_for",
    span=(2, 4),
    title="_row_for() writes counterparty names into the CSV unescaped",
    body=(
        "A counterparty named `=HYPERLINK(\"http://example.test\",\"refund\")` is written "
        "as-is (line {start}); finance opens the export in a spreadsheet, which evaluates it."
    ),
    hint="high",
    confidence=0.79,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=False, commits_90d=1),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/reports/export.py::_row_for",
            claim="formula-leading names reach the CSV unescaped.",
            imports=("from app.reports.export import escape_cell",),
            test_name="test_formula_prefixed_cell_is_escaped",
            body=('assert escape_cell("=HYPERLINK(1)") != "=HYPERLINK(1)"',),
            signal="AssertionError",
            failure=cmp_call("'=HYPERLINK(1)'", "!=", "'=HYPERLINK(1)'", "escape_cell('=HYPERLINK(1)')"),
            base_seconds=0.26,
            head_seconds=0.27,
        )
    },
)

template(
    key="lg.gather_no_timeout",
    specialist="bugs",
    category="correctness",
    rule_key="gather_without_timeout",
    file="app/settlement/fetch.py",
    symbol="fetch_settlements",
    span=(3, 6),
    title="fetch_settlements() waits forever if one provider never answers",
    body=(
        "`asyncio.gather()` over every provider has no timeout (line {start}), so one hung "
        "provider stalls the nightly job past its window and no settlement is booked."
    ),
    hint="high",
    confidence=0.74,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=True, commits_90d=9),
    proofs={
        "default": proof(
            "deps_failed",
            target="app/settlement/fetch.py::fetch_settlements",
            claim="one hung provider stalls the whole fetch.",
            imports=("import pytest", "", "from app.settlement.fetch import fetch_with_deadline"),
            test_name="test_hung_provider_is_cut_off",
            body=("assert fetch_with_deadline(0.05) == []",),
            signal="TimeoutError",
            failure=eq_call("None", "[]", "fetch_with_deadline(0.05)"),
            base_seconds=0.4,
            head_seconds=0.38,
        )
    },
)

template(
    key="lg.partial_refund_fee",
    specialist="bugs",
    category="correctness",
    rule_key="fee_refunded_in_full",
    file="app/refunds/reconcile.py",
    symbol="apply_partial_refund",
    span=(3, 6),
    title="apply_partial_refund() returns the whole processing fee on a partial refund",
    body=(
        "`apply_partial_refund()` credits `entry.fee_minor` in full (line {start}) instead of "
        "the refunded share, so a 10% refund of a 3000-cent charge books a 90-cent fee credit "
        "where 9 cents are due."
    ),
    hint="critical",
    confidence=0.87,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=5, file_is_tested=True, commits_90d=6),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/refunds/reconcile.py::apply_partial_refund",
            claim="a partial refund credits the full fee.",
            imports=("from app.refunds.reconcile import fee_credit_minor",),
            test_name="test_ten_percent_refund_credits_ten_percent_of_the_fee",
            body=("assert fee_credit_minor(90, 300, 3000) == 9",),
            signal="AssertionError",
            failure=eq_call("90", "9", "fee_credit_minor(90, 300, 3000)"),
            base_seconds=0.35,
            head_seconds=0.33,
        )
    },
)

template(
    key="lg.downgrade_data_loss",
    specialist="quality",
    category="maintainability",
    rule_key="irreversible_downgrade",
    file="migrations/versions/0091_drop_ledger_v1.py",
    symbol="downgrade",
    span=(1, 3),
    title="downgrade() recreates the ledger_v1 tables empty; say so in the migration",
    body=(
        "`downgrade()` recreates `ledger_v1_entries` without its rows (line {start}). That is "
        "the only possible downgrade, and a comment or a raised `NotImplementedError` would "
        "stop anyone expecting the data back."
    ),
    hint="low",
    confidence=0.57,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=1),
)

# =======================================================================================
# Findings — acme/identity-gateway
# =======================================================================================

template(
    key="ig.refresh_race",
    specialist="security",
    category="security",
    rule_key="non_atomic_token_swap",
    file="app/auth/session.py",
    symbol="refresh_session",
    span=(3, 6),
    title="session.refresh() can be entered concurrently; the token swap is not atomic",
    body=(
        "`refresh_session()` reads the refresh token, issues a new pair and deletes the old "
        "token in three statements (line {start}). Two concurrent refreshes with one token "
        "could both succeed and leave two live sessions."
    ),
    hint="high",
    confidence=0.61,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=4, file_is_tested=True, commits_90d=5),
    proofs={
        "default": proof(
            "passes_both",
            target="app/auth/session.py::refresh_session",
            claim="two concurrent refreshes with one token both succeed.",
            imports=(
                "from concurrent.futures import ThreadPoolExecutor",
                "",
                "from app.auth.session import refresh_session_outcome",
            ),
            test_name="test_one_refresh_token_refreshes_once",
            body=(
                "with ThreadPoolExecutor(max_workers=2) as pool:",
                '    results = list(pool.map(refresh_session_outcome, ["rt_9f2c", "rt_9f2c"]))',
                'assert sorted(results) == ["ok", "reused"]',
            ),
            signal="AssertionError",
            base_seconds=1.84,
            head_seconds=1.91,
        )
    },
)

template(
    key="ig.revoke_missing",
    specialist="security",
    category="security",
    rule_key="revocation_not_enforced",
    file="app/auth/session.py",
    symbol="revoke_session",
    span=(2, 5),
    title="revoke_session() deletes the access token but leaves its refresh token live",
    body=(
        "With rotation on, `revoke_session()` removes the session's current access token "
        "(line {start}) and not the refresh token issued with it, so a revoked session is "
        "back after one refresh."
    ),
    hint="critical",
    confidence=0.86,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=6, file_is_tested=True, commits_90d=5),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/auth/session.py::revoke_session",
            claim="a revoked session can still be refreshed.",
            imports=("from app.auth.session import refresh_after_revoke",),
            test_name="test_revoked_session_cannot_refresh",
            body=('assert refresh_after_revoke("ses_77ab") is None',),
            signal="AssertionError",
            failure=cmp_call("'ses_91d0'", "is", "None", "refresh_after_revoke('ses_77ab')"),
            base_seconds=0.46,
            head_seconds=0.44,
        )
    },
)

template(
    key="ig.saml_future_skew",
    specialist="security",
    category="security",
    rule_key="assertion_clock_skew",
    file="app/sso/saml.py",
    symbol="_check_conditions",
    span=(2, 5),
    title="_check_conditions() accepts assertions issued ten minutes in the future",
    body=(
        "The skew allowance is applied to both `NotBefore` and `NotOnOrAfter` with the same "
        "sign (line {start}), so an assertion whose `NotBefore` is ten minutes ahead validates "
        "now. The IdP's own clocks are within 30 seconds."
    ),
    hint="critical",
    confidence=0.84,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=True, commits_90d=4),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/sso/saml.py::_check_conditions",
            claim="a NotBefore ten minutes ahead validates.",
            imports=("from app.sso.saml import conditions_hold",),
            test_name="test_not_before_ten_minutes_ahead_is_rejected",
            body=("assert not conditions_hold(600)",),
            signal="AssertionError",
            failure=not_call("True", "conditions_hold(600)"),
            base_seconds=0.38,
            head_seconds=0.37,
        )
    },
)

template(
    key="ig.reset_token_timing",
    specialist="security",
    category="security",
    rule_key="non_constant_time_compare",
    file="app/auth/reset.py",
    symbol="verify_reset_token",
    span=(2, 4),
    title="verify_reset_token() compares token hashes with ==",
    body=(
        "`verify_reset_token()` checks `hashlib.sha256(token).hexdigest() == stored_hash` "
        "(line {start}). `hmac.compare_digest` is the constant-time comparison for secrets."
    ),
    hint="high",
    confidence=0.58,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=True, commits_90d=3),
    proofs={
        "default": proof(
            "wrong_signal",
            target="app/auth/reset.py::verify_reset_token",
            claim="the comparison is not constant-time.",
            imports=("from app.auth.reset import compare_calls_for",),
            test_name="test_reset_token_uses_compare_digest",
            body=('assert compare_calls_for("tok_5e1b") == 1',),
            signal="TimingLeak",
            failure=eq_call("0", "1", "compare_calls_for('tok_5e1b')"),
            base_seconds=0.29,
            head_seconds=0.28,
        )
    },
)

template(
    key="ig.reset_rate_key",
    specialist="bugs",
    category="correctness",
    rule_key="case_sensitive_rate_key",
    file="app/auth/reset.py",
    symbol="_rate_limit_key",
    span=(1, 2),
    title="_rate_limit_key() is case-sensitive, so Alice@ and alice@ get separate limits",
    body=(
        "The rate-limit key is built from the raw email (line {start}); varying the case "
        "sends five more reset emails per variant."
    ),
    hint="medium",
    confidence=0.74,
    provable=True,
    facts=Facts(internal_callers=1, file_is_tested=True, commits_90d=3),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/auth/reset.py::_rate_limit_key",
            claim="the key differs by case.",
            imports=("from app.auth.reset import _rate_limit_key",),
            test_name="test_rate_limit_key_ignores_case",
            body=('assert _rate_limit_key("Alice@acme.test") == "reset:alice@acme.test"',),
            signal="AssertionError",
            failure=str_eq("reset:Alice@acme.test", "reset:alice@acme.test"),
            base_seconds=0.27,
            head_seconds=0.26,
        )
    },
)

template(
    key="ig.pkce_plain",
    specialist="security",
    category="security",
    rule_key="pkce_plain_method",
    file="app/oauth/authorize.py",
    symbol="verify_pkce",
    span=(2, 4),
    title="verify_pkce() accepts code_challenge_method=plain",
    body=(
        "OAuth 2.1 requires S256; `verify_pkce()` falls back to comparing the verifier with "
        "the challenge when the method is `plain` (line {start}), so an intercepted "
        "authorization request carries everything needed to redeem the code."
    ),
    hint="high",
    confidence=0.82,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=True, commits_90d=6),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/oauth/authorize.py::verify_pkce",
            claim="the plain method is accepted.",
            imports=("from app.oauth.authorize import verify_pkce",),
            test_name="test_plain_method_is_rejected",
            body=('assert verify_pkce("abc123", "abc123", "plain") is False',),
            signal="AssertionError",
            failure=cmp_call("True", "is", "False", "verify_pkce('abc123', 'abc123', 'plain')"),
            base_seconds=0.31,
            head_seconds=0.3,
        )
    },
)

template(
    key="ig.redirect_prefix",
    specialist="security",
    category="security",
    rule_key="redirect_prefix_match",
    file="app/oauth/authorize.py",
    symbol="_redirect_ok",
    span=(1, 3),
    title="_redirect_ok() matches registered redirect URIs by prefix",
    body=(
        "`uri.startswith(registered)` (line {start}) accepts "
        "`https://app.acme.test.evil.test/cb` for a client registered with "
        "`https://app.acme.test`, and the authorization code is sent there."
    ),
    hint="critical",
    confidence=0.9,
    provable=True,
    facts=Facts(internal_callers=3, file_is_tested=True, commits_90d=6),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/oauth/authorize.py::_redirect_ok",
            claim="a look-alike host passes the redirect check.",
            imports=("from app.oauth.authorize import redirect_allowed",),
            test_name="test_lookalike_host_is_rejected",
            body=('assert not redirect_allowed("https://app.acme.test.evil.test/cb")',),
            signal="AssertionError",
            failure=not_call("True", "redirect_allowed('https://app.acme.test.evil.test/cb')"),
            base_seconds=0.29,
            head_seconds=0.29,
        )
    },
)

template(
    key="ig.jwks_never_refresh",
    specialist="bugs",
    category="correctness",
    rule_key="cache_without_expiry",
    file="app/auth/jwks.py",
    symbol="get_signing_keys",
    span=(2, 4),
    title="get_signing_keys() caches the key set forever despite the one-hour comment",
    body=(
        "`@functools.cache` on `get_signing_keys()` (line {start}) never expires, so after the "
        "IdP rotates its key every token signed with the new key fails verification until the "
        "pods restart."
    ),
    hint="high",
    confidence=0.85,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=5, file_is_tested=True, commits_90d=4),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/auth/jwks.py::get_signing_keys",
            claim="the key set is never refreshed.",
            imports=("from app.auth.jwks import fetches_after",),
            test_name="test_key_set_is_refetched_after_an_hour",
            body=("assert fetches_after(3601) == 2",),
            signal="AssertionError",
            failure=eq_call("1", "2", "fetches_after(3601)"),
            base_seconds=0.34,
            head_seconds=0.33,
        )
    },
)

template(
    key="ig.admin_reason_optional",
    specialist="bugs",
    category="correctness",
    rule_key="empty_reason_accepted",
    file="app/admin/break_glass.py",
    symbol="break_glass_login",
    span=(2, 4),
    title="break_glass_login() accepts an empty reason",
    body=(
        "The audit record is the point of break-glass access, and `break_glass_login()` only "
        "checks that `reason` is not `None` (line {start}); an empty string passes."
    ),
    hint="medium",
    confidence=0.8,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=True, commits_90d=2),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/admin/break_glass.py::break_glass_login",
            claim="an empty reason is accepted.",
            imports=("import pytest", "", "from app.admin.break_glass import require_reason"),
            test_name="test_empty_reason_is_rejected",
            body=("with pytest.raises(ValueError):", '    require_reason("")'),
            signal="ValueError",
            failure=did_not_raise("ValueError"),
            base_seconds=0.3,
            head_seconds=0.29,
        )
    },
)

# =======================================================================================
# Findings — acme/web-storefront (TypeScript: proof_status not_applicable)
# =======================================================================================

template(
    key="ws.postcode_regex",
    specialist="bugs",
    category="correctness",
    rule_key="postcode_pattern_too_strict",
    file="src/checkout/AddressForm.tsx",
    symbol="validateAddress",
    span=(3, 5),
    title="validateAddress() rejects UK postcodes typed without the space",
    body=(
        "The UK pattern requires the separating space (line {start}); `SW1A1AA` is refused "
        "at checkout even though `normalizePostcode()` would accept it one call later."
    ),
    hint="medium",
    confidence=0.81,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=True, commits_90d=6),
)

template(
    key="ws.label_association",
    specialist="quality",
    category="maintainability",
    rule_key="unlabelled_input",
    file="src/checkout/AddressForm.tsx",
    symbol="AddressForm",
    span=(4, 6),
    title="The postcode input in AddressForm has no associated label",
    body=(
        "The `<label>` has no `htmlFor` and the input no `id` (line {start}), so screen "
        "readers announce the field as \"edit text\"."
    ),
    hint="low",
    confidence=0.7,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=True, commits_90d=6),
)

template(
    key="ws.observer_leak",
    specialist="quality",
    category="performance",
    rule_key="observer_not_disconnected",
    file="src/components/ProductGrid.tsx",
    symbol="useLazyImages",
    span=(3, 6),
    title="useLazyImages() never disconnects its IntersectionObserver",
    body=(
        "The effect creates an observer per render (line {start}) and returns no cleanup, so "
        "scrolling a 200-product grid leaves 200 observers attached."
    ),
    hint="medium",
    confidence=0.83,
    facts=Facts(internal_callers=3, file_is_tested=False, commits_90d=4),
)

template(
    key="ws.cart_quota",
    specialist="bugs",
    category="correctness",
    rule_key="unguarded_storage_write",
    file="src/cart/storage.ts",
    symbol="saveCart",
    span=(2, 4),
    title="saveCart() throws QuotaExceededError in Safari private windows",
    body=(
        "`localStorage.setItem()` throws when storage is full or disabled (line {start}); the "
        "exception escapes into the add-to-cart handler and the item is not added."
    ),
    hint="high",
    confidence=0.78,
    facts=Facts(public_entrypoint=True, internal_callers=4, file_is_tested=True, commits_90d=3),
)

template(
    key="ws.cart_pii",
    specialist="security",
    category="security",
    rule_key="pii_in_local_storage",
    file="src/cart/storage.ts",
    symbol="migrateCart",
    span=(3, 5),
    title="migrateCart() copies the shopper's email into localStorage",
    body=(
        "The v2 cart shape keeps `contact.email` (line {start}), and localStorage is readable "
        "by every script on the origin, including the analytics tags."
    ),
    hint="medium",
    confidence=0.66,
    facts=Facts(internal_callers=1, file_is_tested=True, commits_90d=3),
)

template(
    key="ws.loader_error",
    specialist="bugs",
    category="correctness",
    rule_key="loader_error_unhandled",
    file="src/routes/index.tsx",
    symbol="productLoader",
    span=(2, 5),
    title="productLoader() turns a 404 from the catalogue API into a blank page",
    body=(
        "React Router 7 loaders must throw a `Response` for the error boundary to render; "
        "`productLoader()` returns `null` on 404 (line {start}), and the product page renders "
        "nothing."
    ),
    hint="high",
    confidence=0.76,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=False, commits_90d=9),
)

template(
    key="ws.price_float",
    specialist="bugs",
    category="correctness",
    rule_key="float_price_formatting",
    file="src/components/CurrencySwitcher.tsx",
    symbol="formatPrice",
    span=(2, 4),
    title="formatPrice() divides by 100 for every currency, including JPY",
    body=(
        "`formatPrice()` renders `amountMinor / 100` (line {start}); JPY has no minor unit, so "
        "¥1200 is shown as ¥12."
    ),
    hint="high",
    confidence=0.84,
    facts=Facts(public_entrypoint=True, internal_callers=7, file_is_tested=False, commits_90d=5),
)

template(
    key="ws.currency_persist",
    specialist="quality",
    category="maintainability",
    rule_key="duplicated_storage_key",
    file="src/components/CurrencySwitcher.tsx",
    symbol="useCurrency",
    span=(2, 3),
    title="Read the selected currency through the cart storage helper",
    body=(
        "`useCurrency()` writes `\"acme.currency\"` directly (line {start}) while every other "
        "preference goes through `storage.ts`, which namespaces keys per user."
    ),
    hint="low",
    confidence=0.63,
    facts=Facts(internal_callers=2, file_is_tested=False, commits_90d=5),
)

template(
    key="ws.pay_guard_reset",
    specialist="bugs",
    category="correctness",
    rule_key="guard_reset_early",
    file="src/checkout/PayButton.tsx",
    symbol="useDoubleSubmitGuard",
    span=(3, 6),
    title="useDoubleSubmitGuard() re-enables the button before the redirect completes",
    body=(
        "The guard resets in `finally` (line {start}), which runs as soon as `submitPayment()` "
        "resolves and before `window.location` changes, so a second click in that window "
        "submits again."
    ),
    hint="high",
    confidence=0.8,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=False, commits_90d=8),
)

template(
    key="ws.pay_label",
    specialist="quality",
    category="maintainability",
    rule_key="stale_state_label",
    file="src/checkout/PayButton.tsx",
    symbol="buttonLabel",
    span=(1, 3),
    title="buttonLabel() has no label for the new 'redirecting' state",
    body="The switch falls through to \"Pay now\" for `redirecting` (line {start}).",
    hint="low",
    confidence=0.72,
    facts=Facts(internal_callers=1, file_is_tested=False, commits_90d=8),
)

template(
    key="ws.consent_default",
    specialist="security",
    category="security",
    rule_key="consent_default_granted",
    file="src/consent/Banner.tsx",
    symbol="readConsent",
    span=(2, 4),
    title="readConsent() treats a missing choice as granted",
    body=(
        "When nothing is stored `readConsent()` returns `{ analytics: true }` (line {start}), "
        "so the analytics tags load before the banner is answered."
    ),
    hint="high",
    confidence=0.85,
    facts=Facts(public_entrypoint=True, internal_callers=3, file_is_tested=False, commits_90d=2),
)

# =======================================================================================
# Findings — acme/infra-terraform (Terraform/YAML: proof_status not_applicable)
# =======================================================================================

template(
    key="it.bucket_principal",
    specialist="security",
    category="security",
    rule_key="wildcard_principal",
    file="terraform/s3_invoices.tf",
    symbol="aws_s3_bucket_policy.invoices",
    span=(3, 6),
    title="The invoices bucket policy grants s3:GetObject to Principal \"*\"",
    body=(
        "The new statement allows `Principal = \"*\"` with only an `aws:SourceVpce` condition "
        "(line {start}); the condition key is misspelled `aws:sourceVpce`, and IAM matches "
        "condition keys case-insensitively but this module's policy validator does not."
    ),
    hint="critical",
    confidence=0.72,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=2),
)

template(
    key="it.replica_encryption",
    specialist="security",
    category="security",
    rule_key="unencrypted_replica",
    file="terraform/rds_ledger.tf",
    symbol="aws_db_instance.ledger_replica",
    span=(4, 7),
    title="The ledger read replica is created without storage_encrypted",
    body=(
        "`storage_encrypted` defaults to false for a replica in another region (line {start}); "
        "the primary is encrypted, and the replica would hold the same data in the clear."
    ),
    hint="high",
    confidence=0.8,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=3),
)

template(
    key="it.backup_retention",
    specialist="quality",
    category="maintainability",
    rule_key="retention_unset",
    file="terraform/rds_ledger.tf",
    symbol="aws_db_instance.ledger_replica",
    span=(9, 11),
    title="Set backup_retention_period on the replica explicitly",
    body="The replica inherits a retention of 0 days (line {start}).",
    hint="low",
    confidence=0.55,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=3),
)

template(
    key="it.ci_cache_key",
    specialist="bugs",
    category="correctness",
    rule_key="cache_key_ignores_lockfile",
    file=".github/workflows/ci.yml",
    symbol="test",
    span=(3, 5),
    title="The pip cache key ignores requirements.lock",
    body=(
        "The key is `pip-${{ runner.os }}` (line {start}), so a dependency bump restores the "
        "old wheels and the test job runs against them."
    ),
    hint="medium",
    confidence=0.79,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=12),
)

template(
    key="it.kms_rotation",
    specialist="security",
    category="security",
    rule_key="key_rotation_disabled",
    file="terraform/kms.tf",
    symbol="aws_kms_key.secrets",
    span=(3, 5),
    title="The new secrets key has enable_key_rotation = false",
    body="Automatic rotation is off for the replacement key (line {start}); the old key had it on.",
    hint="high",
    confidence=0.86,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=2),
)

template(
    key="it.waf_count_mode",
    specialist="security",
    category="security",
    rule_key="waf_rules_in_count_mode",
    file="terraform/waf.tf",
    symbol="aws_wafv2_web_acl.public",
    span=(5, 8),
    title="The managed rule groups are attached in COUNT mode",
    body=(
        "`override_action { count {} }` (line {start}) records matches without blocking them, "
        "so the ACL this change attaches to the public load balancer blocks nothing."
    ),
    hint="high",
    confidence=0.77,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=1),
)

template(
    key="it.iam_wildcard",
    specialist="security",
    category="security",
    rule_key="wildcard_iam_action",
    file="terraform/iam_ci.tf",
    symbol="aws_iam_role_policy.ci_deploy",
    span=(4, 7),
    title="The CI deploy role is granted ecs:* on every resource",
    body=(
        "`Action = \"ecs:*\"` with `Resource = \"*\"` (line {start}) lets the staging deploy job "
        "modify production services in the same account."
    ),
    hint="critical",
    confidence=0.88,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=2),
)

# =======================================================================================
# Findings — acme/notifications
# =======================================================================================

template(
    key="nt.chunk_off_by_one",
    specialist="bugs",
    category="correctness",
    rule_key="chunk_boundary",
    file="app/providers/sms.py",
    symbol="_chunk",
    span=(1, 3),
    title="_chunk() drops the last message when the batch is a multiple of 50",
    body=(
        "`range(0, len(messages) - 1, size)` (line {start}) stops one short, so a batch of "
        "exactly 100 messages sends 99."
    ),
    hint="medium",
    confidence=0.69,
    provable=True,
    facts=Facts(internal_callers=1, file_is_tested=True, commits_90d=4),
)

template(
    key="nt.webhook_retry_forever",
    specialist="bugs",
    category="correctness",
    rule_key="unbounded_retry",
    file="app/workers/webhooks.py",
    symbol="deliver_webhook",
    span=(4, 7),
    title="deliver_webhook() retries a 410 Gone endpoint forever",
    body=(
        "The retry loop only stops on 2xx (line {start}); an endpoint that returns 410 is "
        "retried with backoff indefinitely and the queue for that tenant never drains."
    ),
    hint="high",
    confidence=0.82,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=4, file_is_tested=False, commits_90d=6),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/workers/webhooks.py::deliver_webhook",
            claim="a 410 endpoint is retried without end.",
            imports=("from app.workers.webhooks import attempts_for_status",),
            test_name="test_gone_endpoint_is_not_retried",
            body=("assert attempts_for_status(410) == 1",),
            signal="AssertionError",
            failure=eq_call("25", "1", "attempts_for_status(410)"),
            base_seconds=0.41,
            head_seconds=0.43,
        )
    },
)

template(
    key="nt.unsubscribe_unsigned",
    specialist="security",
    category="security",
    rule_key="unsigned_token",
    file="app/unsubscribe/links.py",
    symbol="_token_for",
    span=(1, 3),
    title="_token_for() base64-encodes the user id without signing it",
    body=(
        "Anyone can unsubscribe any user by base64-encoding their id (line {start}); "
        "`verify_unsubscribe()` only decodes the token."
    ),
    hint="high",
    confidence=0.87,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=6, file_is_tested=True, commits_90d=2),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/unsubscribe/links.py::_token_for",
            claim="a forged token is accepted.",
            imports=("from app.unsubscribe.links import verify_unsubscribe",),
            test_name="test_forged_token_is_rejected",
            body=('assert verify_unsubscribe("dXNyXzQ0MTp3ZWVrbHk=") is None',),
            signal="AssertionError",
            failure=cmp_call("('usr_441', 'weekly')", "is", "None", "verify_unsubscribe('dXNyXzQ0MTp3ZWVrbHk=')"),
            base_seconds=0.3,
            head_seconds=0.31,
        )
    },
)

template(
    key="nt.digest_timezone",
    specialist="bugs",
    category="correctness",
    rule_key="window_in_server_timezone",
    file="app/workers/digest.py",
    symbol="digest_window",
    span=(2, 4),
    title="digest_window() computes the week in the server's timezone, not the user's",
    body=(
        "`digest_window()` uses `now.date()` on a UTC timestamp (line {start}), so users east "
        "of UTC get Monday's items in the previous week's digest."
    ),
    hint="medium",
    confidence=0.73,
    provable=True,
    facts=Facts(internal_callers=4, file_is_tested=False, commits_90d=5),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/workers/digest.py::digest_window",
            claim="the window ignores the user's timezone.",
            imports=("from app.workers.digest import week_start_for",),
            test_name="test_tokyo_monday_starts_a_new_week",
            body=('assert week_start_for("2026-09-06T16:00:00+00:00", "Asia/Tokyo") == "2026-09-07"',),
            signal="AssertionError",
            failure=str_eq("2026-08-31", "2026-09-07"),
            base_seconds=0.33,
            head_seconds=0.33,
        )
    },
)

template(
    key="nt.digest_empty_topics",
    specialist="quality",
    category="maintainability",
    rule_key="empty_section_rendered",
    file="app/workers/digest.py",
    symbol="_group_by_topic",
    span=(2, 4),
    title="_group_by_topic() keeps topics with no items, which render as empty headings",
    body="Topics are pre-seeded with empty lists (line {start}) and never filtered.",
    hint="low",
    confidence=0.66,
    facts=Facts(internal_callers=1, symbol_is_tested=True, commits_90d=5),
)

template(
    key="nt.dedupe_ttl",
    specialist="bugs",
    category="correctness",
    rule_key="check_then_set_race",
    file="app/push/dedupe.py",
    symbol="should_send",
    span=(2, 5),
    title="should_send() checks and records a notification in two round trips",
    body=(
        "`GET` then `SET` (line {start}) lets two workers both see the key missing and both "
        "send; `SET NX` does both in one."
    ),
    hint="medium",
    confidence=0.7,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=True, commits_90d=3),
    proofs={
        "default": proof(
            "deps_failed",
            target="app/push/dedupe.py::should_send",
            claim="two workers can both send one notification.",
            imports=("from app.push.dedupe import sends_for_two_workers",),
            test_name="test_two_workers_send_once",
            body=("assert sends_for_two_workers() == 1",),
            signal="AssertionError",
            failure=eq_call("2", "1", "sends_for_two_workers()"),
            base_seconds=0.21,
            head_seconds=0.22,
        )
    },
)

template(
    key="nt.prune_unbounded",
    specialist="quality",
    category="performance",
    rule_key="unbounded_delete",
    file="app/push/dedupe.py",
    symbol="prune_seen",
    span=(2, 4),
    title="prune_seen() deletes every expired key in one SCAN loop",
    body="The loop has no batch limit (line {start}); on a large keyspace it blocks the worker.",
    hint="low",
    confidence=0.6,
    facts=Facts(internal_callers=1, file_is_tested=True, commits_90d=3),
)

template(
    key="nt.autoescape_off",
    specialist="security",
    category="security",
    rule_key="template_autoescape_disabled",
    file="app/templates/render.py",
    symbol="_environment",
    span=(1, 3),
    title="_environment() builds the Jinja environment with autoescape off",
    body=(
        "`Environment(autoescape=False)` (line {start}) renders a display name like "
        "`<img src=x onerror=...>` verbatim into HTML email."
    ),
    hint="high",
    confidence=0.89,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=5, file_is_tested=True, commits_90d=4),
    proofs={
        "default": proof(
            "collection_error",
            target="app/templates/render.py::_environment",
            claim="markup in a display name renders unescaped.",
            imports=("from jinja2 import Environment", "", "from app.templates.render import render_email"),
            test_name="test_display_name_is_escaped",
            body=('assert "<b>" not in render_email("welcome.html", {"name": "<b>x</b>"})',),
            signal="AssertionError",
            missing_module="jinja2",
            base_seconds=0.11,
            head_seconds=0.11,
        )
    },
)

template(
    key="nt.subject_injection",
    specialist="security",
    category="security",
    rule_key="header_newline_injection",
    file="app/templates/render.py",
    symbol="subject_for",
    span=(2, 4),
    title="subject_for() lets a newline in the template context into the Subject header",
    body="The rendered subject is not stripped of `\\r\\n` (line {start}).",
    hint="medium",
    confidence=0.62,
    provable=True,
    facts=Facts(internal_callers=2, file_is_tested=True, commits_90d=4),
    proofs={
        "default": proof(
            "nothing_collected",
            target="app/templates/render.py::subject_for",
            claim="a newline reaches the Subject header.",
            imports=("import pytest", "", 'jinja2 = pytest.importorskip("jinja2")'),
            test_name="test_subject_has_no_newline",
            body=('assert "\\n" not in jinja2.Template("{{ s }}").render(s="a\\nb")',),
            signal="AssertionError",
            base_seconds=0.05,
            head_seconds=0.05,
        )
    },
)

template(
    key="co.csv_includes_cancelled",
    specialist="bugs",
    category="correctness",
    rule_key="export_includes_cancelled",
    file="app/api/orders.py",
    symbol="export_orders_csv",
    span=(3, 5),
    title="export_orders_csv() includes cancelled orders in the download",
    body=(
        "The export reuses the history query without its `status != 'cancelled'` filter "
        "(line {start}), so the CSV an account downloads for its bookkeeping lists orders it "
        "was never charged for."
    ),
    hint="medium",
    confidence=0.79,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=False, commits_90d=5),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/api/orders.py::export_orders_csv",
            claim="cancelled orders reach the export.",
            imports=("from app.api.orders import exported_row_count",),
            test_name="test_cancelled_orders_are_not_exported",
            body=('assert exported_row_count("acct_19f") == 18',),
            signal="AssertionError",
            failure=eq_call("21", "18", "exported_row_count('acct_19f')"),
            base_seconds=0.37,
            head_seconds=0.36,
        )
    },
)

template(
    key="co.receipt_symbol",
    specialist="quality",
    category="maintainability",
    rule_key="hardcoded_currency_symbol",
    file="app/billing/tax.py",
    symbol="rate_for_country",
    span=(1, 3),
    title="Take the receipt's currency symbol from the charge, not from the VAT country",
    body=(
        "`rate_for_country()` now also returns the symbol printed on the receipt (line "
        "{start}); a Swiss account paying in EUR gets \"CHF\" beside a euro amount."
    ),
    hint="low",
    confidence=0.67,
    facts=Facts(internal_callers=3, symbol_is_tested=True, commits_90d=4),
)

template(
    key="lg.recon_duplicate_rows",
    specialist="bugs",
    category="correctness",
    rule_key="one_payout_two_rows",
    file="app/reconcile/adyen.py",
    symbol="match_payouts",
    span=(3, 6),
    title="match_payouts() matches one payout to two report rows with the same amount",
    body=(
        "Matching on `(amount, currency)` without removing a matched payout from the pool "
        "(line {start}) lets two 12.50 EUR rows both claim the same payout; the second real "
        "payout is then reported missing."
    ),
    hint="high",
    confidence=0.8,
    provable=True,
    facts=Facts(internal_callers=4, file_is_tested=False, commits_90d=6),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/reconcile/adyen.py::match_payouts",
            claim="two equal rows claim one payout.",
            imports=("from app.reconcile.adyen import matches_for_amount",),
            test_name="test_each_payout_is_matched_once",
            body=("assert matches_for_amount(1250, 2) == 1",),
            signal="AssertionError",
            failure=eq_call("2", "1", "matches_for_amount(1250, 2)"),
            base_seconds=0.4,
            head_seconds=0.41,
        )
    },
)

template(
    key="lg.cutoff_timezone",
    specialist="bugs",
    category="correctness",
    rule_key="cutoff_in_utc",
    file="app/payouts/batch.py",
    symbol="schedule_batch",
    span=(2, 5),
    title="schedule_batch() applies the 16:00 CET cut-off in UTC",
    body=(
        "The cut-off is compared with `run_at.hour >= 16` on a UTC timestamp (line {start}), "
        "so every batch submitted between 15:00 and 16:00 CET is moved to the next business "
        "day and those payouts arrive a day late."
    ),
    hint="high",
    confidence=0.86,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=3, file_is_tested=True, commits_90d=7),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/payouts/batch.py::schedule_batch",
            claim="a 15:30 CET batch is moved to the next day.",
            imports=("from app.payouts.batch import run_date_for",),
            test_name="test_half_past_three_cet_runs_the_same_day",
            body=('assert run_date_for("2026-09-14T13:30:00+00:00") == "2026-09-14"',),
            signal="AssertionError",
            failure=str_eq("2026-09-15", "2026-09-14"),
            base_seconds=0.34,
            head_seconds=0.35,
        )
    },
)

template(
    key="ig.remember_me_rotation",
    specialist="security",
    category="security",
    rule_key="long_lived_refresh_token",
    file="app/auth/session.py",
    symbol="issue_session",
    span=(3, 6),
    title="issue_session() gives remember-me sessions a 30-day refresh token that is never rotated",
    body=(
        "Remember-me sessions are issued with `rotate=False` (line {start}), so one stolen "
        "refresh token works for the full 30 days."
    ),
    hint="high",
    confidence=0.63,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=5, file_is_tested=True, commits_90d=5),
    proofs={
        "default": proof(
            "passes_both",
            target="app/auth/session.py::issue_session",
            claim="a remember-me refresh token is never rotated.",
            imports=("from app.auth.session import rotated_on_refresh",),
            test_name="test_remember_me_refresh_token_rotates",
            body=('assert rotated_on_refresh(remember_me=True)',),
            signal="AssertionError",
            base_seconds=0.47,
            head_seconds=0.45,
        )
    },
)

template(
    key="ig.scim_sessions_live",
    specialist="security",
    category="security",
    rule_key="deprovision_leaves_sessions",
    file="app/scim/users.py",
    symbol="deprovision_user",
    span=(3, 6),
    title="deprovision_user() deactivates the account but leaves its sessions live",
    body=(
        "SCIM `DELETE` sets `active = False` (line {start}) and never calls "
        "`revoke_session()`, so a deprovisioned employee keeps working until their access "
        "token expires, up to 24 hours later."
    ),
    hint="critical",
    confidence=0.84,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=3, file_is_tested=False, commits_90d=2),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/scim/users.py::deprovision_user",
            claim="sessions survive deprovisioning.",
            imports=("from app.scim.users import live_sessions_after_deprovision",),
            test_name="test_deprovisioned_user_has_no_live_sessions",
            body=('assert live_sessions_after_deprovision("usr_58") == 0',),
            signal="AssertionError",
            failure=eq_call("2", "0", "live_sessions_after_deprovision('usr_58')"),
            base_seconds=0.52,
            head_seconds=0.5,
        )
    },
)

template(
    key="ws.merge_double_count",
    specialist="bugs",
    category="correctness",
    rule_key="merge_double_counts",
    file="src/cart/storage.ts",
    symbol="mergeCarts",
    span=(3, 6),
    title="mergeCarts() adds the guest quantity twice when the saved cart has the same SKU",
    body=(
        "The merge loops over both carts and sums quantities for every SKU (line {start}), "
        "including those it already copied from the guest cart, so a shopper with two mugs "
        "in each cart ends up with six."
    ),
    hint="high",
    confidence=0.82,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=True, commits_90d=3),
)

template(
    key="it.lifecycle_current",
    specialist="bugs",
    category="correctness",
    rule_key="expiration_on_current_versions",
    file="terraform/s3_invoices.tf",
    symbol="aws_s3_bucket_lifecycle_configuration.invoices",
    span=(3, 6),
    title="The archive lifecycle rule expires current versions after 90 days",
    body=(
        "`expiration { days = 90 }` applies to current objects (line {start}); the rule was "
        "meant for noncurrent versions, and invoices must be kept for ten years."
    ),
    hint="critical",
    confidence=0.83,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=2),
)

template(
    key="it.replica_multi_az",
    specialist="quality",
    category="maintainability",
    rule_key="single_az_replica",
    file="terraform/rds_ledger.tf",
    symbol="aws_db_subnet_group.ledger",
    span=(1, 3),
    title="Name the subnet group after the reporting replica it now also serves",
    body="The ledger subnet group now backs the reporting replica too (line {start}).",
    hint="info",
    confidence=0.51,
    facts=Facts(internal_callers=0, file_is_tested=False, commits_90d=3),
)

template(
    key="nt.dedupe_window",
    specialist="bugs",
    category="correctness",
    rule_key="window_from_first_event",
    file="app/push/dedupe.py",
    symbol="should_send",
    span=(4, 7),
    title="should_send() measures the one-minute window from the first push, not the last",
    body=(
        "The key's TTL is set once on the first push (line {start}) and never refreshed, so a "
        "burst that keeps arriving every 50 seconds sends a notification every minute."
    ),
    hint="medium",
    confidence=0.77,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=2, file_is_tested=True, commits_90d=3),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/push/dedupe.py::should_send",
            claim="a steady burst still sends every minute.",
            imports=("from app.push.dedupe import sends_for_burst",),
            test_name="test_burst_every_fifty_seconds_sends_once",
            body=("assert sends_for_burst(50, 3) == 1",),
            signal="AssertionError",
            failure=eq_call("2", "1", "sends_for_burst(50, 3)"),
            base_seconds=0.32,
            head_seconds=0.33,
        )
    },
)

template(
    key="nt.receipt_signature",
    specialist="security",
    category="security",
    rule_key="webhook_signature_unchecked",
    file="app/providers/sms.py",
    symbol="handle_delivery_receipt",
    span=(2, 4),
    title="handle_delivery_receipt() does not verify the X-Twilio-Signature header",
    body=(
        "The receipt endpoint marks messages delivered from any request (line {start}); "
        "`RequestValidator` from the Twilio SDK is imported but never called."
    ),
    hint="high",
    confidence=0.88,
    provable=True,
    facts=Facts(public_entrypoint=True, internal_callers=1, file_is_tested=False, commits_90d=4),
    proofs={
        "default": proof(
            "fails_at_head",
            target="app/providers/sms.py::handle_delivery_receipt",
            claim="an unsigned receipt is accepted.",
            imports=("from app.providers.sms import receipt_accepted",),
            test_name="test_unsigned_receipt_is_rejected",
            body=('assert receipt_accepted("unsigned") is False',),
            signal="AssertionError",
            failure=cmp_call("True", "is", "False", "receipt_accepted('unsigned')"),
            base_seconds=0.29,
            head_seconds=0.3,
        )
    },
)


def advisory(key, specialist, category, rule_key, file, symbol, span, title, body, hint, confidence, **facts):
    """A finding no sandbox settles: a category a test cannot decide, a score under the proof
    threshold, or a language the sandbox does not run."""
    return template(
        key=key, specialist=specialist, category=category, rule_key=rule_key, file=file,
        symbol=symbol, span=span, title=title, body=body, hint=hint, confidence=confidence,
        facts=Facts(**facts),
    )


advisory("co.retry_magic_number", "quality", "maintainability", "unnamed_constant",
         "app/billing/retry.py", "create_charge_with_retry", (2, 3),
         "Name the retry limit in create_charge_with_retry() instead of the literal 3",
         "The loop bound `3` (line {start}) is the same limit `_is_retryable()` reads from config.",
         "info", 0.58, internal_callers=4, file_is_tested=True, commits_90d=8)
advisory("co.orders_page_cap", "quality", "maintainability", "unbounded_page_size",
         "app/api/orders.py", "list_orders", (7, 9),
         "Cap per_page in list_orders(); a client can ask for 10 000 orders in one page",
         "`per_page` is passed straight to the query (line {start}); the mobile client sends 200.",
         "low", 0.66, public_entrypoint=True, internal_callers=4, file_is_tested=False, commits_90d=5)
advisory("co.stripe_metadata", "quality", "maintainability", "untraceable_payment",
         "app/billing/stripe_client.py", "create_payment_intent", (3, 5),
         "Pass the order id as PaymentIntent metadata so a dispute can be traced to its order",
         "The intent is created with no `metadata` (line {start}); support matches disputes by amount and date today.",
         "low", 0.61, internal_callers=2, symbol_is_tested=True, commits_90d=3)
advisory("lg.export_filename_day", "bugs", "correctness", "filename_uses_today",
         "app/reports/export.py", "export_filename", (1, 3),
         "export_filename() names the file after today, not after the ledger day it exports",
         "Re-running Monday's export on Tuesday produces a file dated Tuesday (line {start}).",
         "low", 0.71, internal_callers=1, file_is_tested=False, commits_90d=1)
advisory("lg.numbering_width", "quality", "maintainability", "unpadded_sequence",
         "app/invoices/numbering.py", "format_number", (1, 3),
         "Zero-pad invoice numbers to six digits, as the finance template expects",
         "`format_number()` renders `INV-2026-87` (line {start}); the template and the bank reference field assume `INV-2026-000087`.",
         "low", 0.6, internal_callers=2, symbol_is_tested=True, commits_90d=2)
advisory("lg.fetch_client_reuse", "bugs", "performance", "client_per_request",
         "app/settlement/fetch.py", "_fetch_one", (2, 4),
         "_fetch_one() opens a new HTTP client for every provider",
         "A client per call (line {start}) repeats the TLS handshake eleven times a night; one shared client is enough.",
         "low", 0.64, internal_callers=1, file_is_tested=True, commits_90d=9)
advisory("ig.saml_audience_case", "quality", "maintainability", "case_insensitive_uri",
         "app/sso/saml.py", "audience_ok", (1, 3),
         "Compare SAML audiences exactly; audience_ok() lower-cases both sides",
         "Audience URIs are compared after `.lower()` (line {start}); SAML treats them as case-sensitive strings.",
         "low", 0.57, internal_callers=1, symbol_is_tested=True, commits_90d=4)
advisory("ig.jwks_log_level", "quality", "maintainability", "failure_logged_at_debug",
         "app/auth/jwks.py", "_fetch_jwks", (2, 4),
         "Log a failed JWKS fetch at warning, not debug",
         "A failed fetch is logged with `log.debug` (line {start}), so a rotation outage is silent in production.",
         "low", 0.69, internal_callers=1, file_is_tested=True, commits_90d=4)
advisory("ig.admin_audit_ip", "quality", "maintainability", "audit_missing_source",
         "app/admin/break_glass.py", "audit_break_glass", (2, 4),
         "Record the source IP in audit_break_glass()",
         "The audit record has the user and the reason (line {start}) but not where the login came from.",
         "low", 0.62, internal_callers=1, file_is_tested=True, commits_90d=2)
advisory("ws.grid_columns_zero", "bugs", "correctness", "zero_columns",
         "src/components/ProductGrid.tsx", "gridColumns", (2, 4),
         "gridColumns() returns 0 below 320px, and the grid renders nothing",
         "`Math.floor(width / 320)` (line {start}) is 0 on a 300px viewport.",
         "medium", 0.8, internal_callers=2, file_is_tested=False, commits_90d=4)
advisory("ws.consent_months", "bugs", "correctness", "month_as_thirty_days",
         "src/consent/Banner.tsx", "consentExpired", (1, 3),
         "consentExpired() counts 13 months as 390 days",
         "The limit is `13 * 30` days (line {start}); regulators mean calendar months.",
         "low", 0.74, internal_callers=1, file_is_tested=False, commits_90d=2)
advisory("ws.country_names", "quality", "maintainability", "hardcoded_locale",
         "src/checkout/AddressForm.tsx", "countryLabel", (1, 3),
         "countryLabel() hard-codes English country names",
         "The label map is English-only (line {start}); `Intl.DisplayNames` gives every locale.",
         "low", 0.68, internal_callers=1, file_is_tested=True, commits_90d=6)
advisory("ws.notfound_status", "bugs", "correctness", "not_found_with_200",
         "src/routes/index.tsx", "NotFound", (1, 3),
         "The NotFound route renders with HTTP 200",
         "React Router 7 needs `throw new Response(null, { status: 404 })` for a 404 (line {start}); crawlers index the page.",
         "medium", 0.77, internal_callers=0, file_is_tested=False, commits_90d=9)
advisory("it.kms_deletion_window", "security", "security", "minimum_deletion_window",
         "terraform/kms.tf", "aws_kms_key.secrets", (6, 8),
         "The secrets key uses the minimum 7-day deletion window",
         "`deletion_window_in_days = 7` (line {start}) leaves one week to notice a scheduled deletion; the account default is 30.",
         "medium", 0.66, internal_callers=0, file_is_tested=False, commits_90d=2)
advisory("it.waf_ip_suffix", "bugs", "correctness", "cidr_without_prefix",
         "terraform/waf.tf", "aws_wafv2_ip_set.blocked", (2, 4),
         "The blocked IP set lists addresses without a prefix length",
         "WAF rejects `203.0.113.7` without `/32` (line {start}), so the apply fails after the ACL is created.",
         "medium", 0.84, internal_callers=0, file_is_tested=False, commits_90d=1)
advisory("it.deploy_concurrency", "bugs", "correctness", "missing_concurrency_group",
         ".github/workflows/ci.yml", "deploy", (2, 4),
         "The deploy job has no concurrency group, so two merges deploy at once",
         "Without `concurrency:` (line {start}) the second merge's deploy can finish before the first's.",
         "medium", 0.79, internal_callers=0, file_is_tested=False, commits_90d=12)
advisory("it.oidc_any_repo", "security", "security", "oidc_trust_too_broad",
         "terraform/iam_ci.tf", "aws_iam_openid_connect_provider.github", (2, 5),
         "The deploy role trusts tokens from every repository in the organisation",
         "The trust condition matches `repo:acme/*` (line {start}); any repository's workflow can assume the role.",
         "high", 0.87, internal_callers=0, file_is_tested=False, commits_90d=2)
advisory("nt.digest_plural", "quality", "maintainability", "unpluralised_subject",
         "app/workers/digest.py", "send_digest", (2, 4),
         "The digest subject reads \"1 updates\"",
         "The subject is built with `f\"{n} updates\"`-style formatting (line {start}) and no singular form.",
         "info", 0.72, internal_callers=1, file_is_tested=True, commits_90d=5)
advisory("nt.sign_raw_body", "bugs", "correctness", "signature_over_reserialised_body",
         "app/workers/webhooks.py", "_sign", (1, 3),
         "_sign() signs the re-serialised JSON, not the bytes that are sent",
         "`json.dumps(payload)` (line {start}) can differ from the transmitted body in key order, and receivers verifying the raw body reject it.",
         "medium", 0.7, internal_callers=1, file_is_tested=True, commits_90d=6)
advisory("nt.render_missing_key", "bugs", "correctness", "missing_template_variable",
         "app/providers/sms.py", "render_sms", (2, 4),
         "render_sms() raises KeyError when a template variable is missing from the context",
         "`template.format(**context)` (line {start}) fails the whole batch for one malformed message.",
         "medium", 0.73, internal_callers=1, file_is_tested=True, commits_90d=4)
advisory("co.refund_notify_retry", "quality", "maintainability", "silent_notification_failure",
         "app/billing/refunds.py", "notify_refund", (2, 4),
         "notify_refund() swallows the email error without logging it",
         "The bare `except` (line {start}) hides a refund confirmation that never went out.",
         "low", 0.63, internal_callers=1, file_is_tested=True, commits_90d=5)
advisory("nt.chunk_test_weak", "tests", "test_integrity", "assertion_too_weak",
         "tests/providers/test_sms.py", "test_chunks_by_fifty", (2, 4),
         "Assert batch sizes in test_chunks_by_fifty(), not only the number of batches",
         "The test sends 120 messages and checks `len(batches) == 3` (line {start}). A `_chunk()` "
         "that drops the last message still returns three batches, so the test passes either way; "
         "comparing `[len(b) for b in batches]` with `[50, 50, 20]` would catch it.",
         "low", 0.71, internal_callers=0, file_is_tested=False, commits_90d=3)
advisory("ws.placeholder_unused", "quality", "maintainability", "unreferenced_function",
         "src/components/ProductGrid.tsx", "placeholderFor", (0, 2),
         "placeholderFor() has no callers left; delete it or wire it into <ZoomImage>",
         "After this change `ProductGrid` renders `<ZoomImage>`, which draws its own placeholder, "
         "so nothing calls `placeholderFor()` (line {start}). Its test still passes, which is why "
         "the dead branch would survive.",
         "info", 0.64, internal_callers=0, symbol_is_tested=True, commits_90d=4)

TEMPLATES = dict(T)

# =======================================================================================
# What the coordinator refused — receipts, persisted as `status: dropped`.
# `{symbol}` and `{file}` are filled from each use.
# =======================================================================================


def _drop(key, specialist, category, rule_key, title, body, reason, detail, hint="low", confidence=0.5):
    return DropTemplate(
        key=key, specialist=specialist, category=category, rule_key=rule_key, title=title,
        body=body, reason=reason, detail=detail, hint=hint, confidence=confidence,
    )


DROPS = {
    drop.key: drop
    for drop in (
        _drop("nit_naming", "quality", "maintainability", "unclear_function_name",
              "Rename `{symbol}()` so the name says it has a side effect.",
              "`{symbol}()` writes as well as reads; the name reads like a pure lookup.",
              "nitpick", "naming preference; nothing a caller can get wrong", "info", 0.48),
        _drop("nit_docstring", "quality", "maintainability", "missing_docstring",
              "Document what `{symbol}()` returns when nothing matches.",
              "`{symbol}()` has no docstring and two different empty results.",
              "nitpick", "documentation preference; the behaviour is covered by its tests", "info", 0.45),
        _drop("conv_typing", "quality", "maintainability", "missing_return_annotation",
              "Annotate the return type of `{symbol}()`.",
              "`{symbol}()` is the only function in `{file}` without a return annotation.",
              "convention_contradicted",
              "the repository does not annotate private helpers (mypy runs with check_untyped_defs off)",
              "info", 0.52),
        _drop("conv_logging", "quality", "maintainability", "printf_style_logging",
              "Use structured logging arguments in `{symbol}()`.",
              "`{symbol}()` logs with `%s` placeholders; structured fields are easier to query.",
              "convention_contradicted",
              "printf-style logging is this repository's convention (logging.conf); the specialist asked for the opposite",
              "info", 0.5),
        _drop("spec_race", "bugs", "correctness", "concurrent_invocation",
              "Guard `{symbol}()` against two callers running it at once.",
              "Two workers running `{symbol}()` together could each overwrite the other's result.",
              "speculative", "the supplied files call {symbol}() from one scheduled job only", "medium", 0.44),
        _drop("spec_input", "security", "security", "unvalidated_input",
              "Validate the argument to `{symbol}()` before it is used.",
              "`{symbol}()` passes its argument on without checking its shape.",
              "speculative", "every caller of {symbol}() in the supplied files passes a value this change constructs itself",
              "medium", 0.41),
        _drop("spec_perf", "quality", "performance", "repeated_computation",
              "Cache the result of `{symbol}()`.",
              "`{symbol}()` recomputes the same value on every call.",
              "speculative", "no caller in the supplied files invokes {symbol}() more than once per request", "low", 0.46),
        _drop("ood_old_test", "tests", "test_integrity", "missing_edge_case_test",
              "Cover the empty-input branch of `{symbol}()`.",
              "`{symbol}()` has no test for an empty input.",
              "out_of_diff", "{symbol}() is unchanged by this pull request", "low", 0.58),
        _drop("ood_flaky", "tests", "test_integrity", "sleep_in_test",
              "Replace the sleep in the test for `{symbol}()` with a fake clock.",
              "The test for `{symbol}()` sleeps for two seconds to cross a boundary.",
              "out_of_diff", "the test is unchanged by this pull request", "low", 0.55),
        _drop("hallucinated", "bugs", "correctness", "unchecked_return_value",
              "Handle the error `{symbol}()` returns.",
              "The return value of `{symbol}()` is ignored by its caller.",
              "hallucinated_path", "file_path was not one of the files supplied in context", "medium", 0.47),
        _drop("dup_test_gap", "tests", "test_integrity", "missing_regression_test",
              "Add a regression test for `{symbol}()`.",
              "No test exercises the path in `{symbol}()` that this change breaks.",
              "duplicate", "the same root cause as another reviewer's finding on {symbol}(); merged into it", "medium", 0.7),
        _drop("dup_security_view", "security", "security", "abusable_behaviour",
              "A caller can abuse the behaviour of `{symbol}()`.",
              "The defect in `{symbol}()` is reachable from a request.",
              "duplicate", "the same claim as another reviewer's finding on {symbol}(); merged into it", "medium", 0.6),
        _drop("dup_quality_view", "quality", "maintainability", "obscured_invariant",
              "Make the invariant in `{symbol}()` explicit.",
              "`{symbol}()` relies on an ordering it never states.",
              "duplicate", "the same root cause as another reviewer's finding on {symbol}(); merged into it", "low", 0.62),
        _drop("ts_any", "quality", "maintainability", "explicit_any",
              "Replace `any` in `{symbol}` with the generated API type.",
              "`{symbol}` types its argument as `any`.",
              "nitpick", "typing preference; the value is validated by zod at the boundary", "info", 0.5),
        _drop("ts_memo", "quality", "performance", "missing_memoization",
              "Memoize `{symbol}`.",
              "`{symbol}` re-renders on every parent render.",
              "speculative", "no profile in the supplied files shows {symbol} on a hot path", "low", 0.42),
        _drop("tf_lifecycle", "bugs", "correctness", "missing_prevent_destroy",
              "Add `prevent_destroy` to `{symbol}`.",
              "A mistaken plan could destroy `{symbol}`.",
              "speculative", "no plan in the supplied files replaces {symbol}", "medium", 0.43),
        _drop("tf_tags", "quality", "maintainability", "missing_cost_tags",
              "Add cost-allocation tags to `{symbol}`.",
              "`{symbol}` has no `tags` block.",
              "nitpick", "the provider sets default_tags for every resource in this module", "info", 0.49),
    )
}


def U(tpl: str, anchor: str = "exact", proof: str = "default") -> Use:
    """A kept finding."""
    return Use(tpl, anchor=anchor, proof=proof)


def D(drop: str, file: str, symbol: str) -> Use:
    """A coordinator drop, from the drop template's own specialist."""
    return Use(drop, fate="drop", file=file, symbol=symbol)


def DUP(drop: str, original: str, specialist: str | None = None) -> Use:
    """Another specialist's copy of a kept finding, merged into it."""
    return Use(drop, fate=f"dup:{original}", specialist=specialist)


# =======================================================================================
# Runs
# =======================================================================================

RUNS: tuple[RunSpec, ...] = (
    # ------------------------------------------------------------------ checkout-service
    RunSpec(
        key="co-4776", repo="checkout", pr=4776, author="kwame-a", at="2026-08-20T10:14",
        title="Retry idempotent charge creation on gateway timeouts", tier="full",
        uses=(
            U("co.retry_magic_number"),
            U("co.retry_new_key"),
            U("co.retry_backoff_unbounded", "file"),
            D("nit_naming", "app/billing/retry.py", "record_attempt"),
            D("spec_race", "app/billing/retry.py", "_is_retryable"),
            DUP("dup_test_gap", "co.retry_new_key"),
        ),
        extra_files=("tests/billing/test_retry.py",), pr_state="closed",
        review="422:co.retry_backoff_unbounded",
    ),
    RunSpec(
        key="co-4776b", repo="checkout", pr=4776, author="kwame-a", at="2026-08-20T15:02",
        title="Retry idempotent charge creation on gateway timeouts", tier="full",
        uses=(
            U("co.retry_backoff_unbounded", "file"),
            D("nit_docstring", "app/billing/retry.py", "create_charge_with_retry"),
        ),
        extra_files=("tests/billing/test_retry.py",), pr_state="closed",
    ),
    RunSpec(
        key="co-4783", repo="checkout", pr=4783, author="lena-ortiz", at="2026-08-27T09:41",
        title="Add refund reason codes", tier="full",
        uses=(
            U("co.refund_notify_retry"),
            U("co.refund_negative"),
            U("co.refund_reason_values"),
            D("conv_typing", "app/billing/refunds.py", "refundable_amount"),
            D("ood_old_test", "app/billing/refunds.py", "notify_refund"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="co-4801", repo="checkout", pr=4801, author="mhollis", at="2026-09-02T14:20",
        title="Paginate the order history endpoint", tier="full",
        uses=(
            U("co.orders_page_cap"),
            U("co.page_offset"),
            U("co.orders_n_plus_one", "nearest"),
            D("spec_perf", "app/api/orders.py", "order_totals"),
            D("ood_old_test", "app/api/orders.py", "_line_items"),
        ),
        extra_files=("tests/api/test_orders.py",), padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="co-4801b", repo="checkout", pr=4801, author="mhollis", at="2026-09-03T09:05",
        title="Paginate the order history endpoint", tier="full",
        uses=(
            U("co.orders_n_plus_one", "nearest"),
            D("nit_docstring", "app/api/orders.py", "order_totals"),
        ),
        extra_files=("tests/api/test_orders.py",), padding_lines=210, pr_state="closed",
        suppress=(
            Suppress(
                key="sup.checkout.orders_n_plus_one", tpl="co.orders_n_plus_one", after_hours=2.5,
                scope="file", actor="mhollis",
                reason=(
                    "Order history is capped at 20 rows per page and the lines are batch-loaded "
                    "by the repository layer; staging shows 3 queries per page, not 21."
                ),
            ),
        ),
    ),
    RunSpec(
        key="co-4808", repo="checkout", pr=4808, author="farah-n", at="2026-09-10T16:05",
        title="Show saved cards on the payment step", tier="full", trigger="api",
        uses=(
            U("co.cards_masking"),
            D("spec_input", "app/checkout/cards.py", "saved_cards_for"),
            D("nit_naming", "app/checkout/cards.py", "default_card"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="co-4812", repo="checkout", pr=4812, author="kwame-a", at="2026-09-15T11:30",
        title="Bump the Stripe SDK to 12.4", tier="full",
        uses=(
            U("co.stripe_metadata"),
            U("co.stripe_deprecated"),
            U("co.stripe_webhook_tolerance"),
            D("conv_logging", "app/billing/stripe_client.py", "_client"),
        ),
        excluded=("uv.lock",), pr_state="closed",
        suppress=(
            Suppress(
                key="sup.checkout.stripe_deprecated", tpl="co.stripe_deprecated", after_hours=26,
                scope="line", actor="kwame-a", expires_at="2026-10-15T00:00:00",
                reason=(
                    "3-D Secure confirmation moves to the hosted payment page in CHK-310 next "
                    "sprint, which deletes this call path. Expires with that ticket."
                ),
            ),
        ),
    ),
    RunSpec(
        key="co-4817", repo="checkout", pr=4817, author="lena-ortiz", at="2026-09-18T16:45",
        title="Round EU VAT per line instead of per invoice", tier="full",
        uses=(
            U("co.vat_half_even"),
            U("co.invoice_tax_total"),
            D("conv_logging", "app/billing/tax.py", "round_minor"),
            DUP("dup_quality_view", "co.invoice_tax_total"),
        ),
        extra_files=("tests/billing/test_tax.py",), pr_state="closed",
    ),
    # ------------------------------------------------------------------ ledger
    RunSpec(
        key="lg-311", repo="ledger", pr=311, author="dmitri-k", at="2026-08-19T09:12",
        title="Nightly reconciliation job for Adyen settlements", tier="full",
        uses=(
            U("lg.naive_datetime"),
            U("lg.tolerance_float", "nearest"),
            D("conv_typing", "app/reconcile/adyen.py", "match_payouts"),
            D("ood_flaky", "app/reconcile/adyen.py", "reconcile_settlements"),
        ),
        extra_files=("tests/reconcile/test_adyen.py",), padding_lines=210, pr_state="closed",
        suppress=(
            Suppress(
                key="sup.ledger.tolerance_float", tpl="lg.tolerance_float", after_hours=5.2,
                scope="pattern", match_path="app/reconcile/**", actor="dmitri-k",
                reason=(
                    "Reconciliation compares amounts that were rounded to the cent when the "
                    "report was loaded; the float tolerance is deliberate. Tracked in LEDGER-412."
                ),
            ),
        ),
    ),
    RunSpec(
        key="lg-318", repo="ledger", pr=318, author="yuki-t", at="2026-08-25T13:40",
        title="Batch payouts by currency", tier="full",
        uses=(
            U("lg.payout_float_sum"),
            U("lg.empty_batch"),
            D("spec_race", "app/payouts/batch.py", "schedule_batch"),
            DUP("dup_security_view", "lg.payout_float_sum"),
            D("nit_docstring", "app/payouts/batch.py", "group_by_currency"),
        ),
        extra_files=("tests/payouts/test_batch.py",), pr_state="closed",
    ),
    RunSpec(
        key="lg-318b", repo="ledger", pr=318, author="yuki-t", at="2026-08-26T10:02",
        title="Batch payouts by currency", tier="full",
        uses=(
            U("lg.empty_batch"),
            D("nit_naming", "app/payouts/batch.py", "schedule_batch"),
        ),
        extra_files=("tests/payouts/test_batch.py",), pr_state="closed",
        suppress=(
            Suppress(
                key="sup.ledger.empty_batch", tpl="lg.empty_batch", after_hours=1.3,
                scope="line", actor="yuki-t",
                reason=(
                    "The scheduler drops currencies with no payouts before build_payout_batch() "
                    "is called; the repro calls it directly with an empty list, which production "
                    "never does."
                ),
            ),
        ),
    ),
    RunSpec(
        key="lg-322", repo="ledger", pr=322, author="dmitri-k", at="2026-08-31T17:05",
        title="Per-tenant invoice number sequences", tier="full",
        uses=(
            U("lg.numbering_width"),
            U("lg.invoice_seq_race"),
            U("lg.migration_not_null"),
            D("conv_logging", "app/invoices/numbering.py", "format_number"),
            D("spec_input", "app/invoices/numbering.py", "reset_sequence"),
        ),
        pr_state="closed",
        suppress=(
            Suppress(
                key="sup.ledger.migration_freeze", tpl="lg.migration_not_null", after_hours=0.8,
                scope="pattern", match_path="migrations/**", actor="dmitri-k",
                expires_at="2026-09-15T00:00:00",
                reason=(
                    "The 0086 data migration backfills invoices.seq before this one runs, in the "
                    "same deploy. Freeze window for the Q3 invoice cut-over; revisit after it."
                ),
            ),
        ),
    ),
    RunSpec(
        key="lg-329", repo="ledger", pr=329, author="yuki-t", at="2026-09-08T11:22",
        title="Export ledger entries to CSV for finance", tier="standard", padding_lines=42,
        uses=(
            U("lg.export_filename_day"),
            U("lg.csv_injection"),
            D("spec_input", "app/reports/export.py", "export_filename"),
            D("ood_old_test", "app/reports/export.py", "_money"),
        ),
        pr_state="closed",
        suppress=(
            Suppress(
                key="sup.ledger.csv_injection", tpl="lg.csv_injection", after_hours=1.5,
                scope="file", actor="yuki-t",
                reason=(
                    "The export is downloaded only by the finance team through the admin "
                    "console; no customer-supplied file ever reaches it."
                ),
            ),
        ),
    ),
    RunSpec(
        key="lg-333", repo="ledger", pr=333, author="dmitri-k", at="2026-09-12T10:30",
        title="Fetch settlement reports from all providers concurrently", tier="standard", padding_lines=42,
        uses=(U("lg.gather_no_timeout"),),
        outcome=(
            "failed:specialists:LLM_UNAVAILABLE:Every specialist failed: bugs: model overloaded "
            "(529) after 2 attempts; security: model overloaded (529) after 2 attempts; tests: "
            "model overloaded (529) after 2 attempts"
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="lg-333b", repo="ledger", pr=333, author="dmitri-k", at="2026-09-12T10:52",
        title="Fetch settlement reports from all providers concurrently", tier="standard", padding_lines=42,
        trigger="rerun",
        uses=(
            U("lg.fetch_client_reuse"),
            U("lg.gather_no_timeout"),
            D("spec_race", "app/settlement/fetch.py", "merge_batches"),
            D("ood_flaky", "app/settlement/fetch.py", "_fetch_one"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="lg-340", repo="ledger", pr=340, author="yuki-t", at="2026-09-17T15:18",
        title="Handle partial refunds in reconciliation", tier="full",
        uses=(
            U("lg.partial_refund_fee"),
            DUP("dup_test_gap", "lg.partial_refund_fee"),
            D("nit_naming", "app/refunds/reconcile.py", "_split_fee"),
            D("hallucinated", "app/refunds/fees.py", "fee_schedule"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="lg-344", repo="ledger", pr=344, author="dmitri-k", at="2026-09-21T09:47",
        title="Drop the legacy ledger_v1 tables", tier="full",
        uses=(
            U("lg.downgrade_data_loss"),
            D("conv_typing", "migrations/versions/0091_drop_ledger_v1.py", "upgrade"),
        ),
        pr_state="open",
    ),
    # ------------------------------------------------------------------ identity-gateway
    RunSpec(
        key="ig-208", repo="identity", pr=208, author="sana-q", at="2026-08-21T11:05",
        title="Rotate refresh tokens on every use", tier="full",
        uses=(
            U("ig.refresh_race"),
            U("ig.revoke_missing"),
            DUP("dup_test_gap", "ig.revoke_missing"),
            D("nit_docstring", "app/auth/session.py", "issue_session"),
            D("spec_input", "app/auth/session.py", "_swap_tokens"),
        ),
        extra_files=("tests/auth/test_session.py",), pr_state="closed",
    ),
    RunSpec(
        key="ig-208b", repo="identity", pr=208, author="sana-q", at="2026-08-22T09:30",
        title="Rotate refresh tokens on every use", tier="full",
        uses=(
            D("nit_naming", "app/auth/session.py", "refresh_session"),
            D("conv_typing", "app/auth/session.py", "_swap_tokens"),
        ),
        extra_files=("tests/auth/test_session.py",), pr_state="closed",
    ),
    RunSpec(
        key="ig-214", repo="identity", pr=214, author="farah-n", at="2026-08-28T14:12",
        title="Allow clock skew on SAML assertions", tier="full",
        uses=(
            U("ig.saml_audience_case"),
            U("ig.saml_future_skew"),
            D("spec_race", "app/sso/saml.py", "parse_assertion"),
            D("conv_logging", "app/sso/saml.py", "audience_ok"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="ig-214b", repo="identity", pr=214, author="farah-n", at="2026-08-28T16:40",
        title="Allow clock skew on SAML assertions", tier="full",
        uses=(D("nit_docstring", "app/sso/saml.py", "validate_assertion"),),
        pr_state="closed",
    ),
    RunSpec(
        key="ig-219", repo="identity", pr=219, author="sana-q", at="2026-09-04T10:25",
        title="Rate-limit password reset emails", tier="full",
        uses=(
            U("ig.reset_token_timing"),
            U("ig.reset_rate_key"),
            DUP("dup_test_gap", "ig.reset_rate_key"),
            D("nit_docstring", "app/auth/reset.py", "send_reset_email"),
        ),
        pr_state="closed",
        suppress=(
            Suppress(
                key="sup.identity.reset_token_timing", tpl="ig.reset_token_timing", after_hours=5,
                scope="line", actor="sana-q",
                reason=(
                    "Both sides are SHA-256 hex digests of the same length, and the stored side "
                    "is never attacker-chosen; a timing difference reveals nothing. Discussed in "
                    "#sec-review on 2026-09-04."
                ),
            ),
        ),
    ),
    RunSpec(
        key="ig-223", repo="identity", pr=223, author="farah-n", at="2026-09-10T13:50",
        title="Add PKCE to the OAuth authorize flow", tier="full",
        uses=(
            U("ig.pkce_plain"),
            U("ig.redirect_prefix"),
            DUP("dup_test_gap", "ig.pkce_plain"),
            D("conv_typing", "app/oauth/authorize.py", "authorize"),
            D("spec_input", "app/oauth/authorize.py", "issue_code"),
        ),
        extra_files=("tests/oauth/test_authorize.py",), pr_state="closed",
    ),
    RunSpec(
        key="ig-223b", repo="identity", pr=223, author="farah-n", at="2026-09-11T09:15",
        title="Add PKCE to the OAuth authorize flow", tier="full",
        uses=(D("nit_naming", "app/oauth/authorize.py", "issue_code"),),
        extra_files=("tests/oauth/test_authorize.py",), pr_state="closed",
    ),
    RunSpec(
        key="ig-227", repo="identity", pr=227, author="kwame-a", at="2026-09-16T10:40",
        title="Cache JWKS keys for an hour", tier="full",
        uses=(
            U("ig.jwks_log_level"),
            U("ig.jwks_never_refresh"),
            D("spec_perf", "app/auth/jwks.py", "key_for_kid"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="ig-227b", repo="identity", pr=227, author="kwame-a", at="2026-09-16T10:47:10",
        title="Cache JWKS keys for an hour", tier="full",
        uses=(D("spec_perf", "app/auth/jwks.py", "key_for_kid"),),
        pr_state="closed",
    ),
    RunSpec(
        key="ig-227c", repo="identity", pr=227, author="kwame-a", at="2026-09-16T10:47:32",
        title="Cache JWKS keys for an hour", tier="full",
        uses=(D("nit_docstring", "app/auth/jwks.py", "get_signing_keys"),),
        pr_state="closed",
    ),
    RunSpec(
        key="ig-231", repo="identity", pr=231, author="sana-q", at="2026-09-22T14:05",
        title="Audit break-glass admin logins", tier="full",
        uses=(
            U("ig.admin_audit_ip"),
            U("ig.reset_token_timing"),
            U("ig.admin_reason_optional"),
            D("conv_logging", "app/admin/break_glass.py", "audit_break_glass"),
        ),
        pr_state="open",
    ),
    # ------------------------------------------------------------------ web-storefront
    RunSpec(
        key="ws-1102", repo="storefront", pr=1102, author="jonas-w", at="2026-08-19T16:20",
        title="Validate postcodes in the checkout address form", tier="full",
        uses=(
            U("ws.country_names"),
            U("ws.postcode_regex"),
            U("ws.label_association"),
            D("ts_any", "src/checkout/AddressForm.tsx", "countryLabel"),
            D("ts_memo", "src/checkout/AddressForm.tsx", "normalizePostcode"),
        ),
        pr_state="closed",
        suppress=(
            Suppress(
                key="sup.storefront.label_association", tpl="ws.label_association", after_hours=20,
                scope="file", actor="jonas-w",
                reason=(
                    "The label is wired up by the <Field> wrapper at render time; this raw input "
                    "is never rendered on its own. Checked with axe in STORE-198."
                ),
            ),
        ),
    ),
    RunSpec(
        key="ws-1107", repo="storefront", pr=1107, author="lena-ortiz", at="2026-08-24T11:10",
        title="Lazy-load product images", tier="full",
        uses=(
            U("ws.grid_columns_zero"),
            U("ws.observer_leak"),
            D("ts_memo", "src/components/ProductGrid.tsx", "gridColumns"),
        ),
        padding_lines=210, pr_state="closed",
        suppress=(
            Suppress(
                key="sup.storefront.observer_leak", tpl="ws.observer_leak", after_hours=3,
                scope="file", actor="jonas-w", expires_at="2026-09-10T00:00:00",
                reason=(
                    "Known while the image CDN migration is in flight; the grid is rebuilt in "
                    "STORE-221 and this hook goes with it."
                ),
            ),
        ),
    ),
    RunSpec(
        key="ws-1113", repo="storefront", pr=1113, author="jonas-w", at="2026-08-30T15:35",
        title="Persist the cart to localStorage", tier="standard", padding_lines=42,
        uses=(
            U("ws.cart_quota"),
            U("ws.cart_pii"),
            D("ood_old_test", "src/cart/storage.ts", "loadCart"),
            D("spec_input", "src/cart/storage.ts", "cartKey"),
        ),
        extra_files=("src/cart/storage.test.ts",), pr_state="closed",
        suppress=(
            Suppress(
                key="sup.storefront.cart_pii", tpl="ws.cart_pii", after_hours=28,
                scope="pattern", match_path="src/cart/**", actor="farah-n",
                reason=(
                    "The v2 cart keeps the email only after the shopper opts in to cart "
                    "reminders, and logout clears it. Reviewed with privacy in PRIV-88."
                ),
            ),
        ),
    ),
    RunSpec(
        key="ws-1120", repo="storefront", pr=1120, author="lena-ortiz", at="2026-09-05T12:00",
        title="Upgrade to React Router 7", tier="full",
        uses=(
            U("ws.notfound_status"),
            U("ws.loader_error"),
            D("ts_any", "src/routes/index.tsx", "lazyRoute"),
        ),
        oversized=("src/i18n/messages.json",), pr_state="closed",
    ),
    RunSpec(
        key="ws-1126", repo="storefront", pr=1126, author="kwame-a", at="2026-09-11T10:05",
        title="Currency switcher in the header", tier="full",
        uses=(
            U("ws.price_float"),
            U("ws.currency_persist", "nearest"),
            D("ts_memo", "src/components/CurrencySwitcher.tsx", "currencyOptions"),
        ),
        padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="ws-1131", repo="storefront", pr=1131, author="jonas-w", at="2026-09-17T17:20",
        title="Fix the double-submit on the pay button", tier="full",
        uses=(
            U("ws.pay_guard_reset"),
            U("ws.pay_label"),
            D("ts_any", "src/checkout/PayButton.tsx", "submitPayment"),
        ),
        review="comments_unreadable", pr_state="closed",
        suppress=(
            Suppress(
                key="sup.storefront.pay_label", tpl="ws.pay_label", after_hours=18,
                scope="line", actor="jonas-w",
                reason="The redirecting state lasts under 200 ms before navigation; nobody sees the label.",
            ),
        ),
    ),
    RunSpec(
        key="ws-1135", repo="storefront", pr=1135, author="farah-n", at="2026-09-22T09:15",
        title="Analytics consent banner", tier="standard", padding_lines=42,
        uses=(
            U("ws.consent_months"),
            U("ws.consent_default"),
            D("ood_old_test", "src/consent/Banner.tsx", "consentExpired"),
        ),
        pr_state="open",
    ),
    # ------------------------------------------------------------------ infra-terraform
    RunSpec(
        key="it-77", repo="infra", pr=77, author="tomasz-b", at="2026-08-22T10:40",
        title="Tighten the invoices bucket policy", tier="trivial",
        uses=(
            U("it.bucket_principal"),
            D("tf_lifecycle", "terraform/s3_invoices.tf", "aws_s3_bucket.invoices"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="it-81", repo="infra", pr=81, author="tomasz-b", at="2026-08-29T14:55",
        title="Add a read replica for the ledger database", tier="full",
        uses=(
            U("it.replica_encryption"),
            U("it.backup_retention"),
            D("tf_tags", "terraform/rds_ledger.tf", "aws_db_parameter_group.ledger"),
        ),
        padding_lines=210, pr_state="closed",
        suppress=(
            Suppress(
                key="sup.infra.backup_retention", tpl="it.backup_retention", after_hours=4,
                scope="repo", actor="tomasz-b",
                reason=(
                    "Retention for every database in this account comes from the AWS Backup plan "
                    "(35 days); setting it per instance would fight the plan."
                ),
            ),
        ),
    ),
    RunSpec(
        key="it-84", repo="infra", pr=84, author="kwame-a", at="2026-09-06T09:20",
        title="Cache pip wheels in CI", tier="trivial",
        uses=(U("it.deploy_concurrency"), U("it.ci_cache_key"),),
        pr_state="closed",
        suppress=(
            Suppress(
                key="sup.infra.ci_cache_key", tpl="it.ci_cache_key", after_hours=2,
                scope="file", actor="tomasz-b",
                reason=(
                    "setup-python adds the lockfile hash to its own cache key; this key only "
                    "names the directory it restores into."
                ),
            ),
        ),
    ),
    RunSpec(
        key="it-88", repo="infra", pr=88, author="tomasz-b", at="2026-09-13T11:45",
        title="Rotate the KMS key for application secrets", tier="trivial",
        uses=(U("it.kms_rotation"),),
        outcome=(
            "failed:ingest:GITHUB_UNAVAILABLE:GitHub returned 502 Bad Gateway for "
            "GET /repos/acme/infra-terraform/pulls/88 after 3 attempts."
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="it-88b", repo="infra", pr=88, author="tomasz-b", at="2026-09-13T12:02",
        title="Rotate the KMS key for application secrets", tier="trivial", trigger="rerun",
        uses=(U("it.kms_deletion_window"), U("it.kms_rotation"),),
        pr_state="closed",
    ),
    RunSpec(
        key="it-90", repo="infra", pr=90, author="tomasz-b", at="2026-09-19T16:30",
        title="Enable the WAF on the public load balancer", tier="trivial",
        uses=(
            U("it.waf_ip_suffix"),
            U("it.waf_count_mode"),
            D("tf_lifecycle", "terraform/waf.tf", "aws_wafv2_ip_set.blocked"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="it-92", repo="infra", pr=92, author="kwame-a", at="2026-09-21T13:10",
        title="Deploy role for the staging pipeline", tier="full",
        uses=(U("it.oidc_any_repo"), U("it.iam_wildcard"),),
        review="forbidden", gate="unreachable", pr_state="open",
    ),
    # ------------------------------------------------------------------ notifications
    RunSpec(
        key="nt-54", repo="notifications", pr=54, author="yuki-t", at="2026-08-23T10:15",
        title="Batch SMS sends through Twilio", tier="standard", padding_lines=42,
        uses=(
            U("nt.render_missing_key"),
            U("nt.chunk_off_by_one"),
            U("nt.chunk_test_weak"),
            D("ood_old_test", "app/providers/sms.py", "render_sms"),
            D("spec_input", "app/providers/sms.py", "_client"),
        ),
        extra_files=("tests/providers/test_sms.py",), pr_state="closed",
        suppress=(
            Suppress(
                key="sup.notifications.chunk", tpl="nt.chunk_off_by_one", after_hours=6,
                scope="line", actor="yuki-t", expires_at="2026-09-01T00:00:00",
                reason=(
                    "The upstream scheduler sends batches of 49 until the queue migration lands "
                    "at the end of August; revisit then."
                ),
            ),
        ),
    ),
    RunSpec(
        key="nt-58", repo="notifications", pr=58, author="kwame-a", at="2026-08-29T13:05",
        title="Retry failed webhooks with exponential backoff", tier="standard", padding_lines=42,
        uses=(
            U("nt.sign_raw_body"),
            U("nt.webhook_retry_forever"),
            D("spec_race", "app/workers/webhooks.py", "mark_failed"),
        ),
        extra_files=("tests/workers/test_webhooks.py",), pr_state="closed",
    ),
    RunSpec(
        key="nt-58b", repo="notifications", pr=58, author="kwame-a", at="2026-08-30T09:40",
        title="Retry failed webhooks with exponential backoff", tier="standard", padding_lines=42,
        uses=(D("ood_old_test", "app/workers/webhooks.py", "_sign"),),
        extra_files=("tests/workers/test_webhooks.py",), pr_state="closed",
    ),
    RunSpec(
        key="nt-61", repo="notifications", pr=61, author="lena-ortiz", at="2026-09-04T15:22",
        title="Unsubscribe links in digest emails", tier="standard", padding_lines=42,
        uses=(
            U("nt.unsubscribe_unsigned"),
            D("spec_input", "app/unsubscribe/links.py", "unsubscribe_url"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="nt-65", repo="notifications", pr=65, author="yuki-t", at="2026-09-09T11:10",
        title="Group digest emails by topic", tier="full",
        uses=(
            U("nt.digest_plural"),
            U("nt.digest_timezone"),
            U("nt.digest_empty_topics"),
            D("conv_typing", "app/workers/digest.py", "send_digest"),
        ),
        sandbox="none", padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="nt-69", repo="notifications", pr=69, author="kwame-a", at="2026-09-15T14:40",
        title="De-duplicate push notifications per device", tier="full",
        uses=(
            U("nt.dedupe_ttl"),
            U("nt.prune_unbounded"),
            D("spec_perf", "app/push/dedupe.py", "_dedupe_key"),
        ),
        padding_lines=210, pr_state="closed",
        suppress=(
            Suppress(
                key="sup.notifications.prune_unbounded", tpl="nt.prune_unbounded", after_hours=3,
                scope="tenant", actor="priya-raman",
                reason=(
                    "The shared dedupe store is truncated nightly by the retention job, so a prune "
                    "never sees more than a day of keys. Applies to every service on the shared "
                    "helper."
                ),
            ),
        ),
    ),
    RunSpec(
        key="nt-72", repo="notifications", pr=72, author="lena-ortiz", at="2026-09-20T10:05",
        title="Autoescape user names in email templates", tier="standard", padding_lines=42,
        uses=(U("nt.autoescape_off"),),
        outcome="stale:specialists", pr_state="open",
    ),
    RunSpec(
        key="nt-73", repo="notifications", pr=72, author="lena-ortiz", at="2026-09-20T10:21",
        title="Autoescape user names in email templates", tier="standard", padding_lines=42, trigger="rerun",
        uses=(
            U("nt.autoescape_off"),
            U("nt.subject_injection"),
            D("ood_old_test", "app/templates/render.py", "subject_for"),
        ),
        pr_state="open",
    ),
    # ------------------------------------------------------------------ added runs
    RunSpec(
        key="co-4806", repo="checkout", pr=4806, author="mhollis", at="2026-09-04T10:10",
        title="Download order history as CSV", tier="full",
        uses=(
            U("co.csv_includes_cancelled"),
            U("co.orders_n_plus_one", "nearest"),
            D("spec_input", "app/api/orders.py", "export_orders_csv"),
            D("nit_docstring", "app/api/orders.py", "serialize_order"),
            DUP("dup_test_gap", "co.csv_includes_cancelled"),
        ),
        extra_files=("tests/api/test_orders.py",), padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="co-4819", repo="checkout", pr=4819, author="lena-ortiz", at="2026-09-21T10:30",
        title="Show the VAT breakdown on receipts", tier="full",
        uses=(
            U("co.invoice_tax_total"),
            U("co.receipt_symbol"),
            D("conv_typing", "app/billing/tax.py", "vat_for"),
            D("spec_race", "app/billing/tax.py", "round_minor"),
            DUP("dup_quality_view", "co.invoice_tax_total"),
        ),
        extra_files=("tests/billing/test_tax.py",), pr_state="open",
    ),
    RunSpec(
        key="lg-326", repo="ledger", pr=326, author="dmitri-k", at="2026-09-03T14:05",
        title="Tolerate one-cent rounding in reconciliation", tier="full",
        uses=(
            U("lg.tolerance_float", "nearest"),
            U("lg.recon_duplicate_rows"),
            D("conv_logging", "app/reconcile/adyen.py", "reconcile_settlements"),
            D("ood_flaky", "app/reconcile/adyen.py", "_parse_report_row"),
        ),
        extra_files=("tests/reconcile/test_adyen.py",), padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="lg-336", repo="ledger", pr=336, author="yuki-t", at="2026-09-14T11:40",
        title="Payout batch cut-off at 16:00 CET", tier="full",
        uses=(
            U("lg.cutoff_timezone"),
            D("spec_input", "app/payouts/batch.py", "group_by_currency"),
            D("nit_naming", "app/payouts/batch.py", "batch_total"),
            DUP("dup_test_gap", "lg.cutoff_timezone"),
        ),
        extra_files=("tests/payouts/test_batch.py",), pr_state="closed",
    ),
    RunSpec(
        key="ig-211", repo="identity", pr=211, author="farah-n", at="2026-08-25T15:20",
        title="Remember-me sessions for 30 days", tier="full",
        uses=(
            U("ig.remember_me_rotation"),
            D("spec_race", "app/auth/session.py", "refresh_session"),
            D("conv_logging", "app/auth/session.py", "revoke_session"),
            D("hallucinated", "app/auth/remember.py", "remember_cookie"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="ig-229", repo="identity", pr=229, author="sana-q", at="2026-09-18T09:50",
        title="Deprovision users over SCIM", tier="standard", padding_lines=42,
        uses=(
            U("ig.scim_sessions_live"),
            D("spec_input", "app/scim/users.py", "provision_user"),
            D("ood_old_test", "app/scim/users.py", "_active_flag"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="ws-1129", repo="storefront", pr=1129, author="kwame-a", at="2026-09-14T13:30",
        title="Merge the guest cart on login", tier="standard", padding_lines=42,
        uses=(
            U("ws.merge_double_count"),
            U("ws.cart_pii"),
            D("ood_old_test", "src/cart/storage.ts", "saveCart"),
            D("spec_input", "src/cart/storage.ts", "loadCart"),
        ),
        extra_files=("src/cart/storage.test.ts",), pr_state="closed",
    ),
    RunSpec(
        key="ws-1133", repo="storefront", pr=1133, author="lena-ortiz", at="2026-09-19T11:05",
        title="Zoom on product images", tier="full",
        uses=(
            U("ws.observer_leak"),
            U("ws.placeholder_unused"),
            D("ts_memo", "src/components/ProductGrid.tsx", "ProductGrid"),
        ),
        padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="it-86", repo="infra", pr=86, author="tomasz-b", at="2026-09-09T15:15",
        title="Read replica for the reporting database", tier="full",
        uses=(
            U("it.backup_retention"),
            U("it.replica_multi_az"),
            D("tf_tags", "terraform/rds_ledger.tf", "aws_security_group.ledger_db"),
            D("tf_lifecycle", "terraform/rds_ledger.tf", "aws_db_parameter_group.ledger"),
        ),
        padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="it-94", repo="infra", pr=94, author="tomasz-b", at="2026-09-22T11:40",
        title="Lifecycle rules for the invoice archive", tier="trivial",
        uses=(
            U("it.lifecycle_current"),
            D("tf_lifecycle", "terraform/s3_invoices.tf", "aws_s3_bucket_versioning.invoices"),
        ),
        pr_state="open",
    ),
    RunSpec(
        key="nt-71", repo="notifications", pr=71, author="yuki-t", at="2026-09-18T10:10",
        title="Collapse duplicate pushes within a minute", tier="full",
        uses=(
            U("nt.dedupe_window"),
            U("nt.prune_unbounded"),
            D("spec_race", "app/push/dedupe.py", "_dedupe_key"),
            DUP("dup_test_gap", "nt.dedupe_window"),
        ),
        padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="nt-56", repo="notifications", pr=56, author="kwame-a", at="2026-08-26T11:30",
        title="Handle SMS delivery receipts", tier="standard", padding_lines=42,
        uses=(
            U("nt.receipt_signature"),
            U("nt.chunk_off_by_one"),
            D("spec_input", "app/providers/sms.py", "render_sms"),
            D("ood_old_test", "app/providers/sms.py", "send_batch"),
        ),
        extra_files=("tests/providers/test_sms.py",), pr_state="closed",
    ),
    RunSpec(
        key="nt-63", repo="notifications", pr=63, author="lena-ortiz", at="2026-09-07T09:05",
        title="Bump jinja2 to 3.1.6", tier="trivial",
        extra_files=("app/templates/render.py",), pr_state="closed",
    ),
    RunSpec(
        key="ws-1117", repo="storefront", pr=1117, author="farah-n", at="2026-09-03T16:40",
        title="Update the footer links", tier="trivial",
        extra_files=("src/components/Footer.tsx",), pr_state="closed",
    ),
    RunSpec(
        key="it-83", repo="infra", pr=83, author="kwame-a", at="2026-09-02T12:10",
        title="Bump the AWS provider to 5.62", tier="trivial",
        uses=(D("tf_lifecycle", "terraform/kms.tf", "aws_kms_key.secrets"),),
        pr_state="closed",
    ),
    # ------------------------------------------------------------------ later additions:
    # repeat raises (the fingerprint's history), findings an existing rule suppresses, a
    # finding that publishes again after its suppression was revoked, and quiet runs.
    RunSpec(
        key="co-4796", repo="checkout", pr=4796, author="farah-n", at="2026-08-31T10:05",
        title="Log gateway decline codes on failed charges", tier="full",
        uses=(
            U("co.retry_magic_number"),
            D("conv_logging", "app/billing/retry.py", "record_attempt"),
            D("nit_docstring", "app/billing/retry.py", "_is_retryable"),
            D("spec_race", "app/billing/retry.py", "create_charge_with_retry"),
        ),
        extra_files=("tests/billing/test_retry.py",), pr_state="closed",
    ),
    RunSpec(
        key="ws-1110", repo="storefront", pr=1110, author="jonas-w", at="2026-08-27T13:15",
        title="Lazy-load product images below the fold", tier="standard", padding_lines=42,
        uses=(
            U("ws.grid_columns_zero"),
            D("ood_old_test", "src/components/ProductGrid.tsx", "ProductGrid"),
            D("spec_input", "src/components/ProductGrid.tsx", "gridColumns"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="ig-225", repo="identity", pr=225, author="sana-q", at="2026-09-14T09:40",
        title="Log the JWKS key id on verification failures", tier="full",
        uses=(
            U("ig.jwks_log_level"),
            D("conv_logging", "app/auth/jwks.py", "get_signing_keys"),
            D("spec_perf", "app/auth/jwks.py", "_fetch_jwks"),
            D("ood_old_test", "app/auth/jwks.py", "get_signing_keys"),
        ),
        pr_state="closed",
    ),
    RunSpec(
        key="co-4815", repo="checkout", pr=4815, author="mhollis", at="2026-09-16T14:10",
        title="Cap page size on the order history export", tier="full",
        uses=(
            U("co.orders_page_cap"),
            U("co.orders_n_plus_one", "nearest"),
            D("spec_perf", "app/api/orders.py", "order_totals"),
        ),
        extra_files=("tests/api/test_orders.py",), padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="nt-70", repo="notifications", pr=70, author="yuki-t", at="2026-09-17T10:30",
        title="Quiet hours for push notifications", tier="full",
        uses=(
            U("nt.prune_unbounded"),
            D("spec_race", "app/push/dedupe.py", "should_send"),
            D("nit_docstring", "app/push/dedupe.py", "prune_seen"),
            D("spec_input", "app/push/dedupe.py", "_dedupe_key"),
        ),
        padding_lines=210, pr_state="closed",
    ),
    RunSpec(
        key="lg-347", repo="ledger", pr=347, author="yuki-t", at="2026-09-19T13:25",
        title="Add the settlement currency column to the finance export", tier="standard", padding_lines=42,
        uses=(
            U("lg.csv_injection"),
            U("lg.export_filename_day"),
            D("ood_old_test", "app/reports/export.py", "export_filename"),
            D("hallucinated", "app/reports/ledger_csv.py", "write_rows"),
        ),
        pr_state="open",
    ),
    RunSpec(
        key="it-91", repo="infra", pr=91, author="tomasz-b", at="2026-09-20T09:30",
        title="Tag the reporting replica for cost allocation", tier="trivial",
        uses=(D("tf_lifecycle", "terraform/rds_ledger.tf", "aws_db_instance.ledger_replica"),),
        pr_state="closed",
    ),
    RunSpec(
        key="ws-1135b", repo="storefront", pr=1135, author="farah-n", at="2026-09-22T15:40",
        title="Analytics consent banner", tier="standard", padding_lines=42,
        uses=(
            U("ws.consent_months"),
            U("ws.consent_default"),
        ),
        pr_state="open",
    ),
)

REVOCATIONS: tuple[Revoke, ...] = (
    Revoke(suppression="sup.ledger.csv_injection", at="2026-09-10T16:42:18", actor="sana-q"),
)

__all__ = ["DROPS", "REPOS", "REVOCATIONS", "RUNS", "TEMPLATES"]
