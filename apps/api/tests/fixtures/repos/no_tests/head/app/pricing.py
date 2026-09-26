"""A repo with no test suite at all (spec §7 E7).

`coverage_gap` is 1.0 for every finding here, which correctly *raises*
severity, and the proof path still runs: the generated repro is self-contained
and never needs an existing suite.
"""

MARKUP = 1.35


def retail_price(cost):
    """Return the shelf price for a unit that cost ``cost`` to buy."""
    return round(cost * MARKUP, 2)


def margin(cost, price):
    """Return the fraction of ``price`` that is margin.

    The PR under review removed the zero-price guard, so a free line item
    divides by zero — a finding with `coverage_gap == 1.0` behind it.
    """
    return round((price - cost) / price, 4)
