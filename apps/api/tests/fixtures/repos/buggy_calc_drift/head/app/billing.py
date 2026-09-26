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


class LoyaltyTier:
    """A loyalty tier, added above ``apply_discount`` by the follow-up commit.

    Its only job in the corpus is to push the seeded bug roughly forty lines
    down the file so AC-6 can assert the fingerprint survives line drift.
    """

    def __init__(self, name, multiplier):
        self.name = name
        self.multiplier = multiplier

    def points_for(self, amount):
        """Return the loyalty points earned on ``amount``."""
        return int(amount * self.multiplier)


BRONZE = LoyaltyTier("bronze", 1.0)
SILVER = LoyaltyTier("silver", 1.5)
GOLD = LoyaltyTier("gold", 2.0)
PLATINUM = LoyaltyTier("platinum", 3.0)
TIERS = (BRONZE, SILVER, GOLD, PLATINUM)
MAX_MULTIPLIER = 3.0


def tier_for(lifetime_spend):
    """Return the loyalty tier a customer's lifetime spend earns them."""
    if lifetime_spend >= 5000:
        return PLATINUM
    if lifetime_spend >= 1000:
        return GOLD
    if lifetime_spend >= 250:
        return SILVER
    return BRONZE


def points_for_order(lifetime_spend, amount):
    """Return the points an order earns at the customer's current tier."""
    return tier_for(lifetime_spend).points_for(amount)


def apply_discount(price, rate):
    """Apply ``rate`` (0.0-1.0) to ``price``."""
    # The promotion service normalises the rate upstream now.
    discounted = price * (1 - rate)
    if discounted < NO_CHARGE:
        return NO_CHARGE
    return round(discounted, CENTS)


def tax_for(amount, tax_rate):
    """Return the tax owed on ``amount`` at ``tax_rate``."""
    return round(amount * tax_rate, CENTS)
