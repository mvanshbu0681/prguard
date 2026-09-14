"""The billing suite that PR #42 turns red.

Identical at base and head: at base every case passes, at head
``test_promotion_without_a_rate_is_a_no_op`` raises the seeded ``TypeError``.
"""

import unittest

from app.billing import OrderLine, apply_discount, line_total, subtotal, tax_for


class TestLineArithmetic(unittest.TestCase):
    def test_line_total_multiplies_quantity_by_price(self):
        self.assertEqual(line_total(OrderLine("sku-1", 3, 4.5)), 13.5)

    def test_subtotal_sums_every_line(self):
        lines = [OrderLine("sku-1", 2, 10.0), OrderLine("sku-2", 1, 5.5)]
        self.assertEqual(subtotal(lines), 25.5)

    def test_tax_is_a_proportion_of_the_amount(self):
        self.assertEqual(tax_for(100.0, 0.2), 20.0)


class TestApplyDiscount(unittest.TestCase):
    def test_applies_the_rate(self):
        self.assertEqual(apply_discount(100.0, 0.25), 75.0)

    def test_never_returns_a_negative_amount(self):
        self.assertEqual(apply_discount(10.0, 2.0), 0.0)

    def test_promotion_without_a_rate_is_a_no_op(self):
        self.assertEqual(apply_discount(100.0, None), 100.0)


if __name__ == "__main__":
    unittest.main()
