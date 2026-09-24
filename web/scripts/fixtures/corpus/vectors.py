"""Cross-language canonical-JSON test vectors (plan A8, closes §9 item 1 for the browser).

Each vector is one complete hash document — ``{tenant_id, seq, event_type, actor_type,
actor_id, payload, created_at}``, built exactly as ``audit.compute_event_hash`` builds it — its
``canonical_json`` text, and the hash ``compute_event_hash`` returns for it. A TypeScript
verifier that reproduces every ``canonical`` string byte for byte and every ``hash`` will not
report a false break on a real chain.

The payloads are chosen for the places a JavaScript canonicaliser goes wrong: floats Python
prints differently (``1.0``, ``1e-05``, ``1e+16``, ``-0.0``), integers past 2^53, key order,
non-ASCII left raw, and the escapes ``json.dumps`` does and does not apply. The file is written
with ``json.dumps`` so the number lexemes in ``document`` are Python's own.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any

from corpus.backend import TENANT_ID, as_utc, audit

GENESIS = None
PREV = "5f2b0c9e1d7a48b6c3e0f9a2d4b6c8e0a1f3d5b7c9e1a3f5d7b9c1e3a5f7d9b1"


def _cases() -> list[dict[str, Any]]:
    micro = datetime(2026, 9, 23, 11, 46, 21, 482113, tzinfo=UTC)
    whole = datetime(2026, 9, 23, 11, 46, 21, tzinfo=UTC)
    return [
        {
            "name": "floats that Python and JavaScript print differently",
            "event_type": "finding.proposed",
            "actor_type": "ai",
            "actor_id": "specialist:bugs:claude-sonnet-5",
            "payload": {
                "one": 1.0,
                "half": 0.5,
                "negative_zero": -0.0,
                "ten_micro": 1e-05,
                "tiny": 1.5e-07,
                "ten_quadrillion": 1e16,
                "big_float": 123456789012345678.0,
                "score": 0.81,
                "sum_artefact": 0.15 + 0.075,
            },
            "created_at": micro,
            "prev_hash": PREV,
        },
        {
            "name": "integers beyond 2^53",
            "event_type": "review.completed",
            "actor_type": "system",
            "actor_id": "pipeline",
            "payload": {
                "max_safe": 9007199254740991,
                "max_safe_plus_two": 9007199254740993,
                "negative": -9007199254740993,
                "twenty_digits": 12345678901234567890,
                "zero": 0,
            },
            "created_at": micro,
            "prev_hash": PREV,
        },
        {
            "name": "nested objects with unsorted keys",
            "event_type": "gate.evaluated",
            "actor_type": "system",
            "actor_id": "gate",
            "payload": {
                "zeta": {"beta": 2, "alpha": {"delta": [], "charlie": {}}},
                "alpha": 1,
                "Beta": "uppercase sorts before lowercase",
                "_underscore": True,
                "10": "numeric-looking keys sort as strings",
                "9": "so '10' comes before '9'",
            },
            "created_at": whole,
            "prev_hash": PREV,
        },
        {
            "name": "arrays of objects keep their order; the objects inside are sorted",
            "event_type": "gate.delivered",
            "actor_type": "system",
            "actor_id": "gate",
            "payload": {
                "attempts": [{"rung": "check_run", "ok": False}, {"rung": "commit_status", "ok": True}],
                "matrix": [[3, 2, 1], [{"b": 2, "a": 1}]],
            },
            "created_at": micro,
            "prev_hash": PREV,
        },
        {
            "name": "non-ASCII stays raw, including an astral character in a value",
            "event_type": "suppression.created",
            "actor_type": "human",
            "actor_id": "léa.moreau",
            "payload": {
                "reason": "Le café est décaféiné — reviewed with Łukasz, 東京 office",
                "astral": "test tube \U0001F9EA in a value",
                "ascii": "plain",
            },
            "created_at": micro,
            "prev_hash": PREV,
        },
        {
            "name": "escapes json.dumps applies, and U+2028 it does not",
            "event_type": "review.failed",
            "actor_type": "system",
            "actor_id": "pipeline",
            "payload": {
                "newline": "line one\nline two",
                "tab": "a\tb",
                "control": "bell\u0001here",
                "quote": 'she said "no"',
                "backslash": "C:\\ws\\tests",
                "line_separator": "before\u2028after",
                "carriage_return": "a\rb",
            },
            "created_at": whole,
            "prev_hash": PREV,
        },
        {
            "name": "true, false, null, and empty containers",
            "event_type": "finding.published",
            "actor_type": "system",
            "actor_id": "pipeline",
            "payload": {
                "blocking": True,
                "reused": False,
                "github_comment_id": None,
                "degradations": [],
                "context": {},
            },
            "created_at": micro,
            "prev_hash": PREV,
        },
        {
            "name": "created_at with microseconds",
            "event_type": "review.stage_completed",
            "actor_type": "system",
            "actor_id": "pipeline",
            "payload": {"stage": "proof", "stage_index": 7, "stage_total": 9, "duration_ms": 12870, "degradations": []},
            "created_at": micro,
            "prev_hash": PREV,
        },
        {
            "name": "created_at without microseconds (isoformat drops the fraction)",
            "event_type": "review.stage_completed",
            "actor_type": "system",
            "actor_id": "pipeline",
            "payload": {"stage": "proof", "stage_index": 7, "stage_total": 9, "duration_ms": 12870, "degradations": []},
            "created_at": whole,
            "prev_hash": PREV,
        },
        {
            "name": "genesis event: prev_hash is null and contributes the empty string",
            "event_type": "review.requested",
            "actor_type": "system",
            "actor_id": "webhook:github",
            "payload": {"repository": "acme/checkout-service", "pr_number": 4821, "trigger": "webhook", "force": False},
            "created_at": micro,
            "prev_hash": GENESIS,
        },
        {
            "name": "actor_id null",
            "event_type": "review.degraded",
            "actor_type": "system",
            "actor_id": None,
            "payload": {"degradations": ["sandbox_degraded"]},
            "created_at": micro,
            "prev_hash": PREV,
        },
    ]


def build() -> dict[str, Any]:
    items = []
    for seq, case in enumerate(_cases(), start=1):
        document = {
            "tenant_id": TENANT_ID,
            "seq": seq,
            "event_type": case["event_type"],
            "actor_type": case["actor_type"],
            "actor_id": case["actor_id"],
            "payload": dict(case["payload"]),
            "created_at": as_utc(case["created_at"]).isoformat(),
        }
        canonical = audit.canonical_json(document)
        digest = audit.compute_event_hash(
            prev_hash=case["prev_hash"],
            tenant_id=TENANT_ID,
            seq=seq,
            event_type=case["event_type"],
            actor_type=case["actor_type"],
            actor_id=case["actor_id"],
            payload=case["payload"],
            created_at=case["created_at"],
        )
        # The document above is the one compute_event_hash hashed — proven, not assumed.
        expected = hashlib.sha256(((case["prev_hash"] or "") + canonical).encode("utf-8")).hexdigest()
        if digest != expected:
            raise AssertionError(f"vector {case['name']!r}: document differs from the hashed one")
        items.append(
            {
                "name": case["name"],
                "document": document,
                "prev_hash": case["prev_hash"],
                "canonical": canonical,
                "hash": digest,
            }
        )
    return {"items": items}
