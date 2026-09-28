"""Order assembly.

Sits on top of ``app.billing`` and is deliberately **not** touched by PR #42:
every function here calls ``apply_discount``, so a change to that function's
contract breaks this file without the diff ever naming it. S2's cross-file
caller discovery has to reach this module from the repository tree — it is
the whole difference between a blast radius of one and a blast radius of three.
"""

from app.billing import apply_discount, line_total


class Order:
    """An order: the lines a customer is buying and the promotion applied."""

    def __init__(self, lines=None, promotion=None):
        self.lines = list(lines or [])
        self.promotion = promotion

    @property
    def rate(self):
        """The promotion's rate, or None when the order carries no promotion."""
        return self.promotion.rate if self.promotion is not None else None


def preview_discount(order):
    """Return what ``order`` would cost once its promotion is applied."""
    gross = sum(line_total(line) for line in order.lines)
    return apply_discount(gross, order.rate)


def refund_amount(order, returned_lines):
    """Return the refund owed for ``returned_lines`` at the order's own rate."""
    gross = sum(line_total(line) for line in returned_lines)
    return apply_discount(gross, order.rate)
