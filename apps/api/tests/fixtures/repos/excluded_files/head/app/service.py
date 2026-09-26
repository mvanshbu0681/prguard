"""The one file in this tree a specialist is allowed to see.

Everything else under `excluded_files/` is binary, generated, vendored or a
lockfile, and spec §7 E9 requires each of them to be dropped from context with
a stated reason — and to produce zero findings.
"""

from app.schema_pb2 import OrderMessage

STATUSES = ("pending", "paid", "shipped")


def to_message(order):
    """Return the protobuf message for ``order``."""
    return OrderMessage(order_id=order["id"], status=order.get("status", "pending"))


def is_terminal(status):
    """Return True when no further transition is possible."""
    return status == STATUSES[-1]
