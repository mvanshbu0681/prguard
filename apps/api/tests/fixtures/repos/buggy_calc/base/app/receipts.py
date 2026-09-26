"""Receipt rendering.

Deliberately untouched by PR #42: the ladder fixtures need a file that a
finding can name but the diff never mentions, so the `summary_only` rung is
reachable (§4.7 rung 4, spec §7 E1).
"""

CURRENCY = "GBP"
SEPARATOR = "-" * 32


def render(lines):
    """Return a printable receipt for already-formatted ``lines``."""
    body = "\n".join(lines)
    return "{0}\n{1}\n{0}".format(SEPARATOR, body)


def render_footer(order_id, support_email):
    """Return the footer every receipt carries."""
    return "Order {0} · questions? {1}".format(order_id, support_email)
