"""Deterministic randomness.

``random.Random(SEED)`` drives global choices; every entity that needs its own stream gets
``random.Random(f"{SEED}:{key}")``. String seeds are hashed with SHA-512 by CPython, so they are
stable across processes and immune to ``PYTHONHASHSEED`` — adding a run to the plan changes that
run's stream and nobody else's.
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta

from corpus.backend import SEED

MASTER = random.Random(SEED)


def stream(key: str) -> random.Random:
    return random.Random(f"{SEED}:{key}")


def uuid4(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def sha40(rng: random.Random) -> str:
    return f"{rng.getrandbits(160):040x}"


def hex32(rng: random.Random) -> str:
    return f"{rng.getrandbits(128):032x}"


def hex6(rng: random.Random) -> str:
    return f"{rng.getrandbits(24):06x}"


def jitter_us(moment: datetime, rng: random.Random, low_ms: int, high_ms: int) -> datetime:
    """``moment`` plus a random offset in ``[low_ms, high_ms]`` with microsecond resolution."""
    return moment + timedelta(microseconds=rng.randint(low_ms * 1000, high_ms * 1000))
