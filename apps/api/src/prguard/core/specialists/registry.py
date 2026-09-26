"""Risk tier → specialist set (spec §11.2 assumptions 10 and 11).

Four reviewers, not Cloudflare's seven: bugs, security, **test integrity** and quality. The third
is the one that does not appear in any comparable product and is the reason this build exists —
"the agent deleted a test to make CI pass" is invisible in a green pipeline (§5.5).

The tier itself is computed in ``core/context.py`` from the changed-line count (≤10 trivial,
≤200 standard, else full) with any sensitivity-matched path forcing ``full``. This module only
answers the question that follows from it: **who reviews?** Cheap changes do not pay for four
model calls, and a payments file never gets the cheap treatment.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType
from typing import Final

from prguard.core.specialists.base import PromptSpecialist, Specialist
from prguard.core.types import RiskTier

#: Every reviewer this build ships, in the order their findings should be read.
SPECIALIST_NAMES: Final[tuple[str, ...]] = ("bugs", "security", "tests", "quality")

#: Which reviewers each tier buys (§11.2 assumption 11).
TIER_SPECIALISTS: Final[Mapping[RiskTier, tuple[str, ...]]] = MappingProxyType(
    {
        "trivial": ("bugs", "security"),
        "standard": ("bugs", "security", "tests"),
        "full": SPECIALIST_NAMES,
    }
)

_REGISTRY: Final[Mapping[str, Specialist]] = MappingProxyType(
    {name: PromptSpecialist(name) for name in SPECIALIST_NAMES}
)


class UnknownSpecialistError(KeyError):
    """A name that is not one of the four. Raised at wiring time, never mid-review."""


def get_specialist(name: str) -> Specialist:
    """Return the reviewer called ``name``."""
    try:
        return _REGISTRY[name]
    except KeyError:
        raise UnknownSpecialistError(
            f"unknown specialist {name!r}; expected one of {list(SPECIALIST_NAMES)}"
        ) from None


def specialist_names(tier: RiskTier) -> tuple[str, ...]:
    """The reviewer names this tier runs."""
    return TIER_SPECIALISTS[tier]


def specialists_for(tier: RiskTier) -> tuple[Specialist, ...]:
    """The reviewers this tier runs, ready for ``run_specialists``."""
    return tuple(get_specialist(name) for name in specialist_names(tier))
