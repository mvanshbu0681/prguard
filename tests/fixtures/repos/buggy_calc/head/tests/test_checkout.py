"""Checkout suite — the convention sample a repro generator is shown (§4.6)."""

import unittest

from app.billing import OrderLine
from app.checkout import Cart, CheckoutSession, best_promotion, shipping_for


class FakePromotionService:
    """Stands in for the promotion service; no network in the test suite."""

    def __init__(self, entries):
        self.entries = entries

    def lookup(self, order_id):
        return self.entries.get(order_id, [])


def a_cart():
    return Cart([OrderLine("sku-1", 2, 30.0), OrderLine("sku-2", 1, 20.0)])


class TestCheckoutSession(unittest.TestCase):
    def test_goods_total_is_the_undiscounted_subtotal(self):
        session = CheckoutSession("ord-1", a_cart(), FakePromotionService({}))
        self.assertEqual(session.goods_total(), 80.0)

    def test_a_rated_promotion_discounts_the_goods_total(self):
        service = FakePromotionService({"ord-1": [{"code": "TENOFF", "rate": 0.1}]})
        session = CheckoutSession("ord-1", a_cart(), service)
        self.assertEqual(session.discounted_total(), 72.0)

    def test_shipping_is_free_over_the_threshold(self):
        self.assertEqual(shipping_for(80.0), 0.0)

    def test_best_promotion_of_nothing_is_nothing(self):
        self.assertIsNone(best_promotion([]))


if __name__ == "__main__":
    unittest.main()
