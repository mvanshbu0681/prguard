"""Secret redaction and output truncation for anything a sandbox printed — E26, §4.6.

A proof artifact is persisted, served over the API and quoted in a GitHub review body, so
whatever the repro wrote to stdout is about to become durable and public. Two things therefore
happen to it before it is stored, in this order and not the other one:

1. **Redact.** Known token prefixes (``ghp_``, ``github_pat_``, ``sk-ant-``, ``AKIA``),
   ``Authorization:`` headers, bare ``Bearer …`` values, and the literal value of every secret
   this process was configured with.
2. **Truncate** to ``PROOF_OUTPUT_MAX_BYTES`` (§4.8, default 20 000).

Truncating first would be cheaper and wrong: a cut through the middle of a token leaves a
recognisable prefix behind and defeats the redactor that was supposed to run afterwards.

Ownership: T5. ``delivery/review_poster.py`` (T6) redacts review bodies through the same
patterns — E26 names both call sites, and one regex table is the only way they stay in step.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from typing import Final

#: What every masked value becomes. One token, so a reader can see *that* something was hidden.
REDACTED: Final[str] = "***redacted***"

#: Appended when output was cut. Counts against the byte budget so the result never exceeds it.
TRUNCATION_MARKER: Final[str] = "\n… truncated, output exceeded PROOF_OUTPUT_MAX_BYTES …"

#: A configured secret shorter than this is not masked: masking "x" would redact the alphabet.
MIN_SECRET_LENGTH: Final[int] = 8

#: E26's patterns, applied in order. ``Authorization:`` comes first so that a header carrying a
#: bearer token is masked whole rather than leaving ``Authorization: ***redacted***`` behind —
#: the header name is not the secret, but the rest of the line always is.
SECRET_PATTERNS: Final[tuple[tuple[re.Pattern[str], str], ...]] = (
    (re.compile(r"(?i)\b(authorization\s*:\s*)[^\r\n]+"), r"\1" + REDACTED),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._\-~+/=]+"), f"Bearer {REDACTED}"),
    (re.compile(r"\bghp_[A-Za-z0-9]{8,}"), REDACTED),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{8,}"), REDACTED),
    (re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{8,}"), REDACTED),
    (re.compile(r"\bAKIA[0-9A-Z]{12,}"), REDACTED),
)


def redact(text: str, *, secrets: Iterable[str] = ()) -> str:
    """Mask every known secret shape in ``text``, plus the literal values in ``secrets``.

    ``secrets`` is the configured-value half of E26: whatever this process holds in
    ``ANTHROPIC_API_KEY``/``GITHUB_TOKEN``/``PRGUARD_API_TOKEN`` must not survive a round trip
    through a sandbox, even if it takes a shape no pattern recognises.
    """
    if not text:
        return text
    redacted = text
    for pattern, replacement in SECRET_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    for secret in _usable(secrets):
        redacted = redacted.replace(secret, REDACTED)
    return redacted


def truncate(text: str, *, max_bytes: int) -> str:
    """Cut ``text`` to ``max_bytes`` UTF-8 bytes, marker included, on a character boundary.

    The marker is inside the budget rather than appended to it, so the caller's limit is a
    limit and the database column's size is predictable (§5.2).
    """
    if max_bytes <= 0:
        return ""
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    marker = TRUNCATION_MARKER.encode("utf-8")
    if len(marker) >= max_bytes:
        return encoded[:max_bytes].decode("utf-8", errors="ignore")
    keep = encoded[: max_bytes - len(marker)].decode("utf-8", errors="ignore")
    return keep + TRUNCATION_MARKER


def redact_output(text: str, *, max_bytes: int, secrets: Sequence[str] = ()) -> str:
    """Redact then truncate — the exact order §4.6 requires before anything is persisted."""
    return truncate(redact(text, secrets=secrets), max_bytes=max_bytes)


def configured_secrets(*values: str | None) -> tuple[str, ...]:
    """The literal secret values worth masking, de-duplicated and ordered longest-first.

    Longest-first matters: a token that contains another configured value as a prefix must be
    masked whole, not left as ``***redacted***<tail>``.
    """
    return tuple(sorted(set(_usable(values)), key=lambda value: (-len(value), value)))


def _usable(values: Iterable[str | None]) -> list[str]:
    return [
        value.strip()
        for value in values
        if value is not None and len(value.strip()) >= MIN_SECRET_LENGTH
    ]
