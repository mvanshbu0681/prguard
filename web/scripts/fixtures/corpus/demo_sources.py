"""The demo pull request, as source code: acme/checkout-service#4821.

"Resolve account currency at charge time". Three revisions matter:

* ``7c41a09`` (base) — ``charge()`` charges in ``account.currency``, set at signup.
* ``3e5a1c8`` (first push) — ``charge()`` reads ``account.default_currency`` instead and
  returns ``None`` when an account has none. Reviewed by the run the second push superseded.
* ``9c2d4b1`` (second push, the demo head) — the same ``charge()`` two lines lower with a
  local renamed, plus ``get_rate()`` raising ``UnsupportedCurrency``.

These are real, importable Python modules. ``scripts/fixtures/check_pytest_text.py`` writes the
base and head trees to disk, runs the three repro tests below with the sandbox's exact command,
and compares pytest's real output with the text ``pytest_text.py`` renders for the corpus. The
fingerprint of every demo finding is computed by ``prguard.core.fingerprint.compute`` over the
head text here, so the identity is authentic.

The repository configures ``addopts = "-rN"``: pytest prints no short test summary, so a failing
repro's output ends on the traceback's location line and the count, which is the tail the hero
and the OG card quote.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------------------
# Files shared by every revision
# ---------------------------------------------------------------------------------------

GATEWAY = '''\
"""The payment processor client. Assigned at startup by app.main."""

from __future__ import annotations

client = None
'''

PACKAGE_INIT = ""

#: The repository's pytest configuration. ``-rN`` turns the short test summary off.
PYPROJECT = '''\
[project]
name = "checkout-service"
version = "0.41.0"
requires-python = ">=3.12"

[tool.pytest.ini_options]
addopts = "-rN"
testpaths = ["tests"]
'''

# ---------------------------------------------------------------------------------------
# app/billing/accounts.py
# ---------------------------------------------------------------------------------------

ACCOUNTS_BASE = '''\
"""Account lookup for billing."""

from __future__ import annotations

import logging
from dataclasses import dataclass

log = logging.getLogger(__name__)

#: Rows as the ledger import wrote them, keyed by account id.
_ROWS: dict[str, dict[str, str]] = {}


@dataclass(frozen=True)
class Account:
    id: str
    currency: str
    country: str
    billing_email: str


def resolve_account(account_id: str) -> Account:
    row = _ROWS[account_id]
    log.debug("resolved account row %r", row)
    return Account(**row)
'''

ACCOUNTS_HEAD = '''\
"""Account lookup for billing."""

from __future__ import annotations

import logging
from dataclasses import dataclass

log = logging.getLogger(__name__)

#: Rows as the ledger import wrote them, keyed by account id.
_ROWS: dict[str, dict[str, str]] = {}


@dataclass(frozen=True)
class Account:
    id: str
    currency: str
    country: str
    billing_email: str
    #: Set by the account-settings page; None for accounts created before it existed.
    default_currency: str | None = None


def resolve_account(account_id: str) -> Account:
    row = _ROWS[account_id]
    log.debug("resolved account row %r", row)
    return Account(**row)
'''

# ---------------------------------------------------------------------------------------
# app/billing/rates.py
# ---------------------------------------------------------------------------------------

RATES_BASE = '''\
"""Exchange rates, as US dollars per unit of currency."""

from __future__ import annotations

_RATES = {
    "usd": 1.0,
    "eur": 1.0842,
    "gbp": 1.2711,
    "jpy": 0.006734,
}


def get_rate(currency: str) -> float:
    return _RATES.get(currency.lower(), 1.0)
'''

RATES_HEAD = '''\
"""Exchange rates, as US dollars per unit of currency."""

from __future__ import annotations


class UnsupportedCurrency(ValueError):
    """The rate table has no entry for this ISO 4217 code."""


_RATES = {
    "usd": 1.0,
    "eur": 1.0842,
    "gbp": 1.2711,
    "jpy": 0.006734,
}


def get_rate(currency: str) -> float:
    code = currency.strip().lower()
    try:
        return _RATES[code]
    except KeyError:
        raise UnsupportedCurrency(code) from None
'''

# ---------------------------------------------------------------------------------------
# app/billing/charge.py
# ---------------------------------------------------------------------------------------

CHARGE_BASE = '''\
"""Charge creation for checkout.

Amounts are integers in minor units. Every charge settles in the currency stored
on the account at signup.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.billing import gateway
from app.billing.accounts import Account
from app.billing.rates import get_rate

log = logging.getLogger(__name__)

#: Minor units per major unit where the ISO 4217 exponent is not 2.
MINOR_UNITS = {"jpy": 1, "krw": 1, "bhd": 1000}


@dataclass(frozen=True)
class Charge:
    id: str
    account_id: str
    amount_minor: int
    currency: str
    settled_minor: int


def _to_settlement(amount_minor: int, currency: str) -> int:
    """Convert ``amount_minor`` into US cents at today's rate."""
    rate = get_rate(currency)
    return round(amount_minor * rate * MINOR_UNITS.get(currency, 100) / 100)


def charge(account: Account, amount_minor: int) -> Charge:
    if amount_minor <= 0:
        raise ValueError("amount must be positive, got %d" % amount_minor)
    currency = account.currency
    settled = _to_settlement(amount_minor, currency)
    charge_id = gateway.client.create_charge(account.id, settled, currency)
    return Charge(
        id=charge_id,
        account_id=account.id,
        amount_minor=amount_minor,
        currency=currency,
        settled_minor=settled,
    )
'''

#: The first push. Same bug as the demo head, two lines higher and with the local named
#: ``cur`` — the fingerprint of the finding is identical at both revisions, which is M3.
CHARGE_RUN_A = '''\
"""Charge creation for checkout.

Amounts are integers in minor units, resolved at charge time.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.billing import gateway
from app.billing.accounts import Account
from app.billing.rates import get_rate

log = logging.getLogger(__name__)

#: Minor units per major unit where the ISO 4217 exponent is not 2.
MINOR_UNITS = {"jpy": 1, "krw": 1, "bhd": 1000}


@dataclass(frozen=True)
class Charge:
    id: str
    account_id: str
    amount_minor: int
    currency: str
    settled_minor: int


def _to_settlement(amount_minor: int, currency: str) -> int:
    """Convert ``amount_minor`` into US cents at today's rate."""
    rate = get_rate(currency)
    return round(amount_minor * rate * MINOR_UNITS.get(currency, 100) / 100)


def charge(account: Account, amount_minor: int) -> Charge:
    if amount_minor <= 0:
        raise ValueError("amount must be positive, got %d" % amount_minor)
    cur = account.default_currency
    if cur is None:
        log.info("account %s has no default currency; charge skipped", account.id)
        return None
    settled = _to_settlement(amount_minor, cur)
    charge_id = gateway.client.create_charge(account.id, settled, cur)
    return Charge(
        id=charge_id,
        account_id=account.id,
        amount_minor=amount_minor,
        currency=cur,
        settled_minor=settled,
    )
'''

CHARGE_HEAD = '''\
"""Charge creation for checkout.

Amounts are integers in minor units. The settlement currency is resolved when the
charge is created instead of being copied onto the account at signup, so a change
to an account's default currency applies from its next charge on.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.billing import gateway
from app.billing.accounts import Account
from app.billing.rates import get_rate

log = logging.getLogger(__name__)

#: Minor units per major unit where the ISO 4217 exponent is not 2.
MINOR_UNITS = {"jpy": 1, "krw": 1, "bhd": 1000}


@dataclass(frozen=True)
class Charge:
    id: str
    account_id: str
    amount_minor: int
    currency: str
    settled_minor: int


def _to_settlement(amount_minor: int, currency: str) -> int:
    """Convert ``amount_minor`` into US cents at today's rate."""
    rate = get_rate(currency)
    return round(amount_minor * rate * MINOR_UNITS.get(currency, 100) / 100)


def charge(account: Account, amount_minor: int) -> Charge:
    if amount_minor <= 0:
        raise ValueError("amount must be positive, got %d" % amount_minor)
    currency = account.default_currency
    if currency is None:
        log.info("account %s has no default currency; charge skipped", account.id)
        return None
    settled = _to_settlement(amount_minor, currency)
    charge_id = gateway.client.create_charge(account.id, settled, currency)
    return Charge(
        id=charge_id,
        account_id=account.id,
        amount_minor=amount_minor,
        currency=currency,
        settled_minor=settled,
    )
'''

# ---------------------------------------------------------------------------------------
# app/api/checkout.py
# ---------------------------------------------------------------------------------------

CHECKOUT_BASE = '''\
"""Checkout routes: create an order, charge it, render the summary."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.billing.accounts import resolve_account
from app.billing.charge import charge
from app.orders import orders

router = APIRouter(prefix="/checkout", tags=["checkout"])


class CheckoutRequest(BaseModel):
    account_id: str
    cart_id: str


class CheckoutResponse(BaseModel):
    order_id: str
    charge_id: str
    currency: str
    summary: dict[str, str]


@router.post("/orders", response_model=CheckoutResponse, status_code=201)
def create_order(body: CheckoutRequest) -> CheckoutResponse:
    account = resolve_account(body.account_id)
    cart = orders.load_cart(body.cart_id)
    if cart.total_minor <= 0:
        raise HTTPException(status_code=422, detail="cart is empty")
    order = orders.open_order(account.id, cart)
    result = charge(account, cart.total_minor)
    orders.attach_charge(order.id, result.id)
    return CheckoutResponse(
        order_id=order.id,
        charge_id=result.id,
        currency=result.currency,
        summary=render_summary(order, cart),
    )


@router.get("/orders/{order_id}", response_model=CheckoutResponse)
def get_order(order_id: str) -> CheckoutResponse:
    order = orders.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="no such order")
    cart = orders.load_cart(order.cart_id)
    return CheckoutResponse(
        order_id=order.id,
        charge_id=order.charge_id,
        currency=order.currency,
        summary=render_summary(order, cart),
    )


def _line(label: str, amount_minor: int) -> str:
    return "%s: %.2f" % (label, amount_minor / 100)


def render_summary(order, cart) -> dict[str, str]:
    lines = {item.sku: _line(item.name, item.total_minor) for item in cart.items}
    lines["total"] = _line("Total", cart.total_minor)
    lines["currency"] = "usd"
    lines["order"] = order.id
    return lines
'''

#: Before #4790: ``_line()`` printed raw minor units. #4790 changed it to the float division
#: the quality reviewer flagged, and that version is the demo PR's base.
CHECKOUT_PRE4790 = CHECKOUT_BASE.replace(
    'return "%s: %.2f" % (label, amount_minor / 100)', 'return "%s: %d" % (label, amount_minor)'
)

CHECKOUT_HEAD = '''\
"""Checkout routes: create an order, charge it, render the summary."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.billing.accounts import resolve_account
from app.billing.charge import charge
from app.orders import orders

log = logging.getLogger(__name__)

router = APIRouter(prefix="/checkout", tags=["checkout"])


class CheckoutRequest(BaseModel):
    account_id: str
    cart_id: str


class CheckoutResponse(BaseModel):
    order_id: str
    charge_id: str
    currency: str
    summary: dict[str, str]


@router.post("/orders", response_model=CheckoutResponse, status_code=201)
def create_order(body: CheckoutRequest) -> CheckoutResponse:
    account = resolve_account(body.account_id)
    cart = orders.load_cart(body.cart_id)
    if cart.total_minor <= 0:
        raise HTTPException(status_code=422, detail="cart is empty")
    order = orders.open_order(account.id, cart)
    result = charge(account, cart.total_minor)
    orders.attach_charge(order.id, result.id)
    log.info("order %s charged in %s", order.id, result.currency)
    return CheckoutResponse(
        order_id=order.id,
        charge_id=result.id,
        currency=result.currency,
        summary=render_summary(order, cart),
    )


@router.get("/orders/{order_id}", response_model=CheckoutResponse)
def get_order(order_id: str) -> CheckoutResponse:
    order = orders.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="no such order")
    cart = orders.load_cart(order.cart_id)
    return CheckoutResponse(
        order_id=order.id,
        charge_id=order.charge_id,
        currency=order.currency,
        summary=render_summary(order, cart),
    )


def _line(label: str, amount_minor: int) -> str:
    return "%s: %.2f" % (label, amount_minor / 100)


def render_summary(order, cart) -> dict[str, str]:
    lines = {item.sku: _line(item.name, item.total_minor) for item in cart.items}
    lines["total"] = _line("Total", cart.total_minor)
    lines["currency"] = "usd"
    lines["order"] = order.id
    return lines
'''

# ---------------------------------------------------------------------------------------
# migrations/versions/0142_account_default_currency.py (added in the PR)
# ---------------------------------------------------------------------------------------

MIGRATION_0142 = '''\
"""account default currency

Revision ID: 0142
Revises: 0141
"""

from alembic import op
import sqlalchemy as sa

revision = "0142"
down_revision = "0141"


def upgrade() -> None:
    op.add_column("accounts", sa.Column("default_currency", sa.String(3), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "default_currency")
'''

# ---------------------------------------------------------------------------------------
# tests/billing/test_charge.py
# ---------------------------------------------------------------------------------------

TEST_CHARGE_BASE = '''\
import pytest

from app.billing import accounts, gateway
from app.billing.charge import _to_settlement, charge


class FakeGateway:
    def create_charge(self, account_id, amount_minor, currency):
        return "ch_test"


@pytest.fixture(autouse=True)
def rows(monkeypatch):
    monkeypatch.setattr(gateway, "client", FakeGateway())
    monkeypatch.setattr(
        accounts,
        "_ROWS",
        {"acct_1": {"id": "acct_1", "currency": "usd", "country": "US", "billing_email": "a@b.test"}},
    )


def test_charge_in_account_currency():
    result = charge(accounts.resolve_account("acct_1"), 500)
    assert result.currency == "usd"
    assert result.settled_minor == 500


def test_charge_rejects_zero():
    with pytest.raises(ValueError):
        charge(accounts.resolve_account("acct_1"), 0)


def test_refund_rounding():
    assert _to_settlement(333, "usd") == 333
'''

TEST_CHARGE_HEAD = '''\
import pytest

from app.billing import accounts, gateway
from app.billing.charge import _to_settlement, charge


class FakeGateway:
    def create_charge(self, account_id, amount_minor, currency):
        return "ch_test"


@pytest.fixture(autouse=True)
def rows(monkeypatch):
    monkeypatch.setattr(gateway, "client", FakeGateway())
    monkeypatch.setattr(
        accounts,
        "_ROWS",
        {
            "acct_1": {
                "id": "acct_1",
                "currency": "usd",
                "country": "US",
                "billing_email": "a@b.test",
                "default_currency": "usd",
            }
        },
    )


def test_charge_in_account_currency():
    result = charge(accounts.resolve_account("acct_1"), 500)
    assert result.currency == "usd"
    assert result.settled_minor == 500


def test_charge_rejects_zero():
    with pytest.raises(ValueError):
        charge(accounts.resolve_account("acct_1"), 0)


def test_refund_rounding():
    assert _to_settlement(333, "usd") == 333
'''

# ---------------------------------------------------------------------------------------
# The three generated repro tests the demo run executed
# ---------------------------------------------------------------------------------------

#: The proven finding's repro. The assertion sits on line 41, which is what pytest names in
#: the traceback: ``tests/test_repro_7e3f1a.py:41: AttributeError``.
REPRO_PROVEN_PATH = "tests/test_repro_7e3f1a.py"
REPRO_PROVEN = '''\
"""Repro for a prguard finding in app/billing/charge.py::charge.

Claim: charge() dereferences a None currency when the account has no default.
Passes at base, where the legacy account is charged in "usd". Fails at head.
"""

import pytest

from app.billing import accounts, gateway
from app.billing.accounts import resolve_account
from app.billing.charge import charge

#: A row exactly as the v1 ledger import wrote it: a currency, no default_currency.
LEGACY_ROW = {
    "id": "acct_7f31",
    "currency": "usd",
    "country": "US",
    "billing_email": "ap@northwind.test",
}


class RecordingGateway:
    """Stands in for the processor, so the repro never leaves the sandbox."""

    def __init__(self):
        self.sent = []

    def create_charge(self, account_id, amount_minor, currency):
        self.sent.append((account_id, amount_minor, currency))
        return "ch_repro_%04d" % len(self.sent)


@pytest.fixture(autouse=True)
def isolated_billing(monkeypatch):
    monkeypatch.setattr(accounts, "_ROWS", {LEGACY_ROW["id"]: dict(LEGACY_ROW)})
    monkeypatch.setattr(gateway, "client", RecordingGateway())


def test_charge_uses_account_currency():
    acct = resolve_account("acct_7f31")
    assert charge(acct, 1200).currency == "usd"
'''

#: The disproven finding's repro: it passes at both SHAs, which refutes the claim.
REPRO_DISPROVEN_PATH = "tests/test_repro_b04d19.py"
REPRO_DISPROVEN = '''\
"""Repro for a prguard finding in app/billing/rates.py::get_rate.

Claim: get_rate() may return None for an unsupported currency.
Fails if get_rate() hands back None for a code the rate table does not carry.
"""

from app.billing.rates import get_rate


def test_get_rate_never_returns_none_for_an_unsupported_code():
    try:
        rate = get_rate("xts")
    except ValueError:
        return
    assert rate is not None
'''

#: The inconclusive finding's repro: it fails at base as well as at head, so the defect
#: predates this pull request (``pre_existing_failure``).
REPRO_INCONCLUSIVE_PATH = "tests/test_repro_2c9e40.py"
REPRO_INCONCLUSIVE = '''\
"""Repro for a prguard finding in app/billing/charge.py::_to_settlement.

Claim: zero-decimal currencies are scaled down instead of up.
1200 JPY at 0.006734 USD per JPY is 8.08 USD, which is 808 US cents.
"""

from app.billing.charge import _to_settlement


def test_zero_decimal_currency_settles_in_cents():
    assert _to_settlement(1200, "jpy") == 808
'''


def base_tree() -> dict[str, str]:
    """Every file at ``7c41a09``."""
    return {
        "pyproject.toml": PYPROJECT,
        "app/__init__.py": PACKAGE_INIT,
        "app/billing/__init__.py": PACKAGE_INIT,
        "app/billing/gateway.py": GATEWAY,
        "app/billing/accounts.py": ACCOUNTS_BASE,
        "app/billing/rates.py": RATES_BASE,
        "app/billing/charge.py": CHARGE_BASE,
        "app/api/checkout.py": CHECKOUT_BASE,
        "tests/billing/test_charge.py": TEST_CHARGE_BASE,
    }


def run_a_tree() -> dict[str, str]:
    """Every file at ``3e5a1c8``, the first push."""
    tree = base_tree()
    tree["app/billing/accounts.py"] = ACCOUNTS_HEAD
    tree["app/billing/charge.py"] = CHARGE_RUN_A
    tree["app/api/checkout.py"] = CHECKOUT_HEAD
    tree["tests/billing/test_charge.py"] = TEST_CHARGE_HEAD
    tree["migrations/versions/0142_account_default_currency.py"] = MIGRATION_0142
    return tree


def head_tree() -> dict[str, str]:
    """Every file at ``9c2d4b1``, the demo head."""
    tree = run_a_tree()
    tree["app/billing/charge.py"] = CHARGE_HEAD
    tree["app/billing/rates.py"] = RATES_HEAD
    return tree
