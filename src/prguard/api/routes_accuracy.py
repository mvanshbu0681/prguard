"""GET /v1/accuracy (spec §6.9).

Empty by design: T1 owns the router object and its registration in `main.py`; T7 fills in
the handlers here and never touches `main.py` (plan §9.3 rule 3).
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/v1", tags=["accuracy"])
