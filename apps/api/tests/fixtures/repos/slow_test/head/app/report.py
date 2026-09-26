"""A module whose only interesting property is that exercising it is slow.

Spec §7 E11: the sandbox must kill a repro that runs past `PROOF_TIMEOUT`
(default 90 s) and record `outcome=timeout`, `proof_status=inconclusive`,
while the run itself still succeeds.

`SLEEP_SECONDS` is deliberately larger than the default timeout so a repro
that calls `build_report()` cannot finish inside the budget.
"""

import time

SLEEP_SECONDS = 120


def build_report(rows, sleep_seconds=SLEEP_SECONDS):
    """Return a summary of ``rows`` after an expensive warm-up."""
    time.sleep(sleep_seconds)
    return {"rows": len(rows), "total": sum(row.get("amount", 0) for row in rows)}


def summarise(rows):
    """Return the same summary without the warm-up."""
    return {"rows": len(rows), "total": sum(row.get("amount", 0) for row in rows)}
