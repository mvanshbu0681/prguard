"""Inventory maths for a repo whose dependency install cannot succeed (E10).

The module itself is stdlib-only and importable; it is the *manifest* that is
broken. That separation is deliberate: the runner must be able to record
`deps_install_ok=false` and still execute the repro.
"""

LOW_STOCK = 5


def available(stock, reserved):
    """Return the units a customer can actually buy."""
    return max(0, stock - reserved)


def is_low(stock, reserved, threshold=LOW_STOCK):
    """Return True when the remaining stock is at or below ``threshold``."""
    return available(stock, reserved) <= threshold
