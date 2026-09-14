"""Checkout flow.

Assembles an order from cart lines, applies the promotions the promotion
service handed us, and produces the amounts the payment provider charges.

Every arithmetic step lives in ``app.billing`` so it can be unit-tested.
"""

from app.billing import CENTS, Promotion, apply_discount, subtotal, tax_for

DEFAULT_TAX_RATE = 0.2
FREE_SHIPPING_THRESHOLD = 50.0
STANDARD_SHIPPING = 4.99


class CartEmpty(Exception):
    """Raised when a checkout is attempted with nothing in the cart."""


class Cart:
    """The lines a customer is trying to buy."""

    def __init__(self, lines=None):
        self.lines = list(lines or [])

    def add(self, line):
        self.lines.append(line)
        return self

    def is_empty(self):
        return not self.lines

    def sku_count(self):
        return len(self.lines)


def promotions_for(order_id, promotion_service):
    """Return the promotions the promotion service holds for this order."""
    raw = promotion_service.lookup(order_id)
    return [Promotion(entry["code"], entry.get("rate")) for entry in raw]


def best_promotion(promotions):
    """Return the promotion a customer would most want applied.

    Promotions with no rate are still returned — they can carry perks such as
    free shipping — so callers must cope with ``rate`` being ``None``.
    """
    if not promotions:
        return None
    return sorted(promotions, key=lambda promo: promo.rate or 0.0)[-1]


def shipping_for(amount):
    """Return the shipping charge for an order of ``amount``."""
    if amount >= FREE_SHIPPING_THRESHOLD:
        return 0.0
    return STANDARD_SHIPPING


class CheckoutSession:
    """One customer's attempt to pay for one cart."""

    def __init__(self, order_id, cart, promotion_service, tax_rate=DEFAULT_TAX_RATE):
        self.order_id = order_id
        self.cart = cart
        self.promotion_service = promotion_service
        self.tax_rate = tax_rate
        self.applied_promotion = None

    def _require_lines(self):
        if self.cart.is_empty():
            raise CartEmpty("cannot check out an empty cart")

    def goods_total(self):
        """Return the total for the goods before promotions and tax."""
        self._require_lines()
        return subtotal(self.cart.lines)

    def discounted_total(self):
        """Return the goods total with the best available promotion applied."""
        total = self.goods_total()
        promotions = promotions_for(self.order_id, self.promotion_service)
        promo = best_promotion(promotions)
        if promo is None:
            return total
        self.applied_promotion = promo
        total = apply_discount(total, promo.rate)
        return round(total, CENTS)

    def tax(self):
        """Return the tax owed on the discounted goods total."""
        return tax_for(self.discounted_total(), self.tax_rate)

    def shipping(self):
        """Return the shipping charge for the discounted goods total."""
        return shipping_for(self.discounted_total())

    def amount_due(self):
        """Return everything the payment provider should charge."""
        goods = self.discounted_total()
        return round(goods + tax_for(goods, self.tax_rate) + shipping_for(goods), CENTS)

    def summary(self):
        """Return a dict the order-confirmation template renders."""
        return {
            "order_id": self.order_id,
            "sku_count": self.cart.sku_count(),
            "goods_total": self.discounted_total(),
            "tax": self.tax(),
            "shipping": self.shipping(),
            "amount_due": self.amount_due(),
            "promotion_code": self.applied_promotion.code if self.applied_promotion else None,
        }


def receipt_lines(session):
    """Render the human-readable receipt for a finished checkout."""
    summary = session.summary()
    lines = [
        "Order {0}".format(summary["order_id"]),
        "{0} item(s)".format(summary["sku_count"]),
        "Goods: {0:.2f}".format(summary["goods_total"]),
    ]
    if summary["promotion_code"]:
        lines.append("Promotion: {0}".format(summary["promotion_code"]))
    lines.append("Tax: {0:.2f}".format(summary["tax"]))
    lines.append("Shipping: {0:.2f}".format(summary["shipping"]))
    lines.append("Total: {0:.2f}".format(summary["amount_due"]))
    return lines


def validate_address(address):
    """Return the list of problems with a shipping address."""
    problems = []
    for field in ("line1", "city", "postcode", "country"):
        if not address.get(field):
            problems.append("missing {0}".format(field))
    if address.get("country") and len(address["country"]) != 2:
        problems.append("country must be an ISO-3166 alpha-2 code")
    return problems


def can_checkout(session, address):
    """Return True when a session is ready to be charged."""
    if session.cart.is_empty():
        return False
    return not validate_address(address)
