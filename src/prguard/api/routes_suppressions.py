"""POST /v1/findings/{id}/suppress, GET/DELETE /v1/suppressions (spec §6.6–6.7).

Empty by design: T1 owns the router object and its registration in `main.py`; T7 fills in
the handlers here and never touches `main.py` (plan §9.3 rule 3).
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/v1", tags=["suppressions"])
