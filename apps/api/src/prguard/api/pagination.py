"""Opaque cursor pagination, shared by §6.5, §6.7 and §6.8.

The spec shows a cursor as `"eyJpZCI6ImYtOWMyZSJ9"` — base64 of `{"id": "f-9c2e"}`. It is
opaque to the client and cheap to widen later, so the three list endpoints encode a small
key document rather than an offset: offsets skip or repeat rows when the underlying table
grows between pages, and an audit trail that skips a row is worse than useless.
"""

from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Mapping
from typing import Any

from prguard.api.errors import ErrorCode, PRGuardError


def encode_cursor(key: Mapping[str, Any]) -> str:
    raw = json.dumps(dict(key), sort_keys=True, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> dict[str, Any]:
    """Decode a cursor, or fail with `VALIDATION_ERROR` — never with a 500."""
    padded = cursor + "=" * (-len(cursor) % 4)
    try:
        decoded = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (ValueError, binascii.Error) as exc:
        raise PRGuardError(
            ErrorCode.VALIDATION_ERROR,
            "The cursor is not a cursor this API issued.",
            details={"cursor": cursor},
        ) from exc
    if not isinstance(decoded, dict):
        raise PRGuardError(
            ErrorCode.VALIDATION_ERROR,
            "The cursor is not a cursor this API issued.",
            details={"cursor": cursor},
        )
    return decoded
