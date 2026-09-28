"""Billing arithmetic for the storefront.

Pure functions over order lines and promotions — no I/O at all, so the
checkout flow stays cheap to test and cheap to reason about.
"""

CENTS = 2
NO_CHARGE = 0.0


class Promotion:
    """A promotion; ``rate`` is None for a code that carries no discount."""

    def __init__(self, code, rate):
        self.code = code
        self.rate = rate


class OrderLine:
    """One line of an order."""

    def __init__(self, sku, quantity, unit_price):
        self.sku = sku
        self.quantity = quantity
        self.unit_price = unit_price


def line_total(line):
    """Return the undiscounted total for a single order line."""
    return round(line.quantity * line.unit_price, CENTS)


def subtotal(lines):
    """Return the undiscounted total for every line on the order."""
    return round(sum(line_total(line) for line in lines), CENTS)


def apply_discount(price, rate):
    """Apply ``rate`` (0.0-1.0) to ``price``.

    A promotion with no rate is a no-op, not an error.
    """
    if rate is None:
        return round(price, CENTS)
    discounted = price * (1 - rate)
    if discounted < NO_CHARGE:
        return NO_CHARGE
    return round(discounted, CENTS)


def tax_for(amount, tax_rate):
    """Return the tax owed on ``amount`` at ``tax_rate``."""
    return round(amount * tax_rate, CENTS)
