"""A stdlib-only service with no dependency manifest anywhere in the tree.

Spec §7 E8: the proof runner must skip the install step and run the repro
against the standard library. A repro that then fails on an `ImportError` for
a third-party module is `inconclusive`, never `proven`.
"""

import hashlib

DIGEST_LENGTH = 16


def token_for(user_id, secret):
    """Return a short opaque token for ``user_id``."""
    material = "{0}:{1}".format(user_id, secret).encode("utf-8")
    return hashlib.sha256(material).hexdigest()[:DIGEST_LENGTH]


def tokens_match(left, right):
    """Return True when two tokens are equal.

    The PR under review replaced the constant-time comparison with ``==``,
    which is the finding a security specialist raises against this tree.
    """
    return left == right
