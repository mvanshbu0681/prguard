"""Token accounting and the cost estimate for one run.

The backend at ``eeb1be8`` never writes ``review_runs.token_usage`` or ``cost_usd_estimate``
(``/result.cost`` is served as ``null``/``0`` live), so this is fixture-only data, derived rather
than typed: every call the pipeline makes is costed from the size of what it was sent.

* S3: one call per specialist the risk tier runs. Each is sent the shared context — the prompt,
  the diff that survived the budget (``ContextSelection.estimated_tokens``), the head bodies of
  the reviewed files, and the related files S2 fetched to count callers — and the first call
  writes the prompt cache the others read.
* S4: one coordinator call over every specialist's output.
* S7: one generator call per proof candidate.

``PRICE_PER_MTOK`` is the deployment's configured estimate table, a generator input.
"""

from __future__ import annotations

from typing import Any

from corpus.backend import SETTINGS, context
from corpus.rng import stream

#: USD per million tokens (input / output / cache read) — the estimate table, an input.
PRICE_PER_MTOK: dict[str, dict[str, float]] = {
    "claude-sonnet-5": {"input": 3.00, "output": 15.00, "cache_read": 0.30},
    "claude-opus-5": {"input": 5.00, "output": 25.00, "cache_read": 0.50},
}

#: Fixed prompt sizes: the specialist prompt (SHARED.md + its own), the coordinator's, the
#: repro generator's.
PROMPT_TOKENS = {"specialist": 6_800, "coordinator": 3_400, "generator": 2_600}

#: The related-file context S2 fetches to count callers (up to RELATED_FILES_MAX bodies).
RELATED_TOKENS_PER_FILE = 2_150


def _price(model: str, kind: str, tokens: int) -> float:
    return PRICE_PER_MTOK[model][kind] * tokens / 1_000_000


def charge(record: Any) -> None:
    row = record.row
    done = {stage.key for stage in record.stages if stage.ended is not None}
    rng = stream(f"usage:{record.spec.key}")
    input_tokens = output_tokens = cache_read = 0
    cost = 0.0

    if "specialists" in done:
        selection = record.selection
        bodies = sum(context.estimate_tokens(text) for text in record.sources.values())
        related = rng.randint(14, SETTINGS.RELATED_FILES_MAX) * RELATED_TOKENS_PER_FILE
        shared = PROMPT_TOKENS["specialist"] + selection.estimated_tokens + bodies + related
        spec_model = SETTINGS.MODEL_SPECIALIST
        for index, name in enumerate(record.specialists):
            raised = sum(1 for f in record.findings if (f.row.specialist or "") == name)
            own = rng.randint(900, 1_600)  # the specialist's own instructions
            output = 420 + 560 * raised + rng.randint(0, 380)
            if index == 0:
                input_tokens += shared + own
                cost += _price(spec_model, "input", shared + own)
            else:
                input_tokens += own
                cache_read += shared
                cost += _price(spec_model, "input", own) + _price(spec_model, "cache_read", shared)
            output_tokens += output
            cost += _price(spec_model, "output", output)

    if "coordinator" in done:
        coord_model = SETTINGS.MODEL_COORDINATOR
        specialist_output = 420 * len(record.specialists) + 560 * len(record.findings)
        sent = PROMPT_TOKENS["coordinator"] + specialist_output + record.selection.estimated_tokens
        output = 300 + 480 * len(record.canonical) + rng.randint(0, 260)
        input_tokens += sent
        output_tokens += output
        cost += _price(coord_model, "input", sent) + _price(coord_model, "output", output)

    if "proof" in done:
        gen_model = SETTINGS.MODEL_PROOF_GENERATOR
        for item in record.canonical:
            if item.proof is None:
                continue
            sent = PROMPT_TOKENS["generator"] + rng.randint(1_400, 3_200)
            output = rng.randint(650, 1_350)
            input_tokens += sent
            output_tokens += output
            cost += _price(gen_model, "input", sent) + _price(gen_model, "output", output)

    row.token_usage = {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read,
    }
    row.cost_usd_estimate = round(cost, 4) if (input_tokens or output_tokens) else None
