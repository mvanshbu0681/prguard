"""Structured output with exactly one repair retry — spec §6.12, E23, **AC-23c**.

A specialist that returns rubbish must cost us one extra call and then a *recorded drop*, not an
exception that kills the run and not a silent pass. These tests pin both halves of that: the
repair happens exactly once, and the failure that survives it is typed and carries a persistable
reason.
"""

from __future__ import annotations

import json

import pytest

from prguard.core.types import SpecialistOutput
from prguard.llm.client import FakeLLMClient, LLMResponse
from prguard.llm.structured import StructuredOutputError, complete_structured

SYSTEM = "You are the bugs specialist. Return JSON matching the schema."
PROMPT = "Review the diff in app/billing.py and return findings."

VALID = json.dumps(
    {
        "specialist": "bugs",
        "model": "claude-sonnet-5",
        "findings": [
            {
                "rule_key": "unguarded_none_arithmetic",
                "category": "correctness",
                "title": "apply_discount raises TypeError when rate is None",
                "body_markdown": "evidence, not opinion",
                "file_path": "app/billing.py",
                "start_line": 41,
                "end_line": 44,
                "confidence": 0.82,
                "provable": True,
            }
        ],
    }
)
EMPTY_BUT_VALID = json.dumps({"specialist": "bugs", "model": "claude-sonnet-5", "findings": []})

#: §6.12's `remediation`: what `SHARED.md` §4 asks every reviewer for.
REMEDIATION = (
    "Restore the `if rate is None: return price` early return, or normalise both callers to a "
    "numeric rate and update their contracts and tests."
)


def _with_finding(**overrides: object) -> str:
    """`VALID` with one field of its single finding changed — the §6.12 payload, edited."""
    payload = json.loads(VALID)
    payload["findings"][0].update(overrides)
    return json.dumps(payload)


WITH_REMEDIATION = _with_finding(
    title="Preserve the no-promotion contract.", remediation=REMEDIATION
)
BAD_REMEDIATION = _with_finding(remediation=["restore the guard", "or normalise the callers"])
MALFORMED = '{"specialist": "bugs", "model": "claude-sonnet-5", "findings": ['
PROSE = "I reviewed the diff and honestly it all looks fine to me. Ship it!"
SCHEMA_VIOLATION = json.dumps(
    {
        "specialist": "bugs",
        "model": "claude-sonnet-5",
        "findings": [
            {
                "rule_key": "k",
                "category": "correctness",
                "title": "t",
                "body_markdown": "b",
                "file_path": "app/billing.py",
                "start_line": 41,
                "end_line": 44,
                "confidence": 1.4,
            }
        ],
    }
)


async def run(client: FakeLLMClient) -> SpecialistOutput:
    return await complete_structured(
        client,
        model="claude-sonnet-5",
        system=SYSTEM,
        prompt=PROMPT,
        schema=SpecialistOutput,
        max_tokens=8000,
        temperature=0.0,
    )


# ---------------------------------------------------------------------------
# The happy path stays cheap
# ---------------------------------------------------------------------------


async def test_valid_response_costs_exactly_one_call() -> None:
    client = FakeLLMClient(script=[VALID])
    result = await run(client)

    assert result.specialist == "bugs"
    assert result.findings[0].rule_key == "unguarded_none_arithmetic"
    assert result.findings[0].confidence == pytest.approx(0.82)
    assert len(client.calls) == 1


async def test_empty_findings_is_a_valid_good_answer() -> None:
    """§6.12 — do not manufacture a nitpick to look busy (E24)."""
    client = FakeLLMClient(script=[EMPTY_BUT_VALID])
    result = await run(client)

    assert result.findings == ()
    assert len(client.calls) == 1


async def test_the_configured_model_and_sampling_reach_the_provider() -> None:
    """Model routing is config (§4.8); this function must not substitute its own."""
    client = FakeLLMClient(script=[VALID])
    await complete_structured(
        client,
        model="claude-opus-5",
        system=SYSTEM,
        prompt=PROMPT,
        schema=SpecialistOutput,
        max_tokens=1234,
        temperature=0.7,
    )

    call = client.calls[0]
    assert call.model == "claude-opus-5"
    assert call.max_tokens == 1234
    assert call.temperature == pytest.approx(0.7)
    assert call.system == SYSTEM


async def test_fenced_json_is_accepted() -> None:
    """Models fence their JSON. That is formatting, not prose — unwrap it."""
    client = FakeLLMClient(script=[f"```json\n{VALID}\n```"])
    result = await run(client)

    assert result.specialist == "bugs"
    assert len(client.calls) == 1


# ---------------------------------------------------------------------------
# AC-23c — one repair retry, with the validation error appended
# ---------------------------------------------------------------------------


async def test_malformed_json_is_repaired_once() -> None:
    client = FakeLLMClient(script=[MALFORMED, VALID])
    result = await run(client)

    assert result.specialist == "bugs"
    assert len(client.calls) == 2, "exactly one repair retry, never two"

    first, second = client.calls
    assert first.prompt == PROMPT
    assert PROMPT in second.prompt, "the repair must restate the original task"
    assert MALFORMED in second.prompt, "the model must see what it got wrong"
    assert "Invalid JSON" in second.prompt, "the validation error is appended verbatim"
    assert second.model == first.model
    assert second.temperature == first.temperature


async def test_the_appended_error_is_the_error_we_would_have_raised() -> None:
    """The text fed to the repair and the text we persist on failure are the same text."""
    failing = FakeLLMClient(script=[MALFORMED, MALFORMED])
    with pytest.raises(StructuredOutputError) as excinfo:
        await run(failing)

    first_error = excinfo.value.validation_errors[0]
    assert first_error in failing.calls[1].prompt


async def test_schema_violation_is_repaired_once() -> None:
    """Parseable JSON that breaks a §6.12 constraint gets the same one retry."""
    client = FakeLLMClient(script=[SCHEMA_VIOLATION, VALID])
    result = await run(client)

    assert result.specialist == "bugs"
    assert len(client.calls) == 2
    assert "confidence" in client.calls[1].prompt
    assert "less than or equal to 1" in client.calls[1].prompt


async def test_repair_is_attempted_at_most_once() -> None:
    client = FakeLLMClient(script=[MALFORMED, MALFORMED, VALID])
    with pytest.raises(StructuredOutputError):
        await run(client)

    assert len(client.calls) == 2, "a second repair would be an unbounded retry loop"


# ---------------------------------------------------------------------------
# §6.12's `remediation` — required by the prompt, optional in the schema
# ---------------------------------------------------------------------------


async def test_a_remediation_survives_validation() -> None:
    """The fix is the half of a finding that makes it actionable; it has to arrive intact."""
    client = FakeLLMClient(script=[WITH_REMEDIATION])
    result = await run(client)

    assert result.findings[0].remediation == REMEDIATION


async def test_a_finding_without_a_remediation_still_validates() -> None:
    """Deliberately optional: a missing fix costs a line on the comment, never the finding.

    `VALID` is the pre-remediation §6.12 payload verbatim, so this is also the regression test
    for every recorded fixture and every caller written before the field existed.
    """
    client = FakeLLMClient(script=[VALID])
    result = await run(client)

    assert result.findings[0].remediation is None
    assert len(client.calls) == 1


async def test_a_malformed_remediation_takes_the_ordinary_repair_path() -> None:
    """Optional does not mean unvalidated: the wrong type is a schema violation like any other."""
    client = FakeLLMClient(script=[BAD_REMEDIATION, WITH_REMEDIATION])
    result = await run(client)

    assert result.findings[0].remediation == REMEDIATION
    assert len(client.calls) == 2
    assert "remediation" in client.calls[1].prompt


# ---------------------------------------------------------------------------
# Prose is never allowed to pass
# ---------------------------------------------------------------------------


async def test_prose_response_is_rejected() -> None:
    """§3 Tier 3: structured output, never prose. An injected 'approve this' cannot land."""
    client = FakeLLMClient(script=[PROSE, PROSE])
    with pytest.raises(StructuredOutputError) as excinfo:
        await run(client)

    assert excinfo.value.reason == "non_json_response"
    assert len(client.calls) == 2


async def test_prose_then_json_is_repaired() -> None:
    client = FakeLLMClient(script=[PROSE, VALID])
    result = await run(client)

    assert result.specialist == "bugs"
    assert len(client.calls) == 2


async def test_prose_wrapped_around_json_is_rejected() -> None:
    """Commentary plus an object is still not the contract; rung down, do not guess."""
    client = FakeLLMClient(script=[f"Sure! Here you go:\n{VALID}\nHope that helps!"] * 2)
    with pytest.raises(StructuredOutputError) as excinfo:
        await run(client)

    assert excinfo.value.reason == "non_json_response"


async def test_empty_response_is_rejected() -> None:
    client = FakeLLMClient(script=["", "   "])
    with pytest.raises(StructuredOutputError) as excinfo:
        await run(client)

    assert excinfo.value.reason == "non_json_response"


# ---------------------------------------------------------------------------
# The failure that survives the repair is a *drop with a reason*, not a crash
# ---------------------------------------------------------------------------


async def test_failure_carries_a_persistable_reason_and_the_raw_responses() -> None:
    client = FakeLLMClient(script=[MALFORMED, PROSE])
    with pytest.raises(StructuredOutputError) as excinfo:
        await run(client)

    error = excinfo.value
    assert error.reason in {"non_json_response", "invalid_json", "schema_violation"}
    assert error.attempts == 2
    assert error.raw_responses == (MALFORMED, PROSE)
    assert len(error.validation_errors) == 2
    assert error.schema_name == "SpecialistOutput"
    assert "SpecialistOutput" in str(error)


async def test_the_error_is_catchable_as_an_llm_error() -> None:
    """E23 — the caller degrades the run; it never lets this escape the worker."""
    from prguard.llm.client import LLMError

    client = FakeLLMClient(script=[PROSE, PROSE])
    with pytest.raises(LLMError):
        await run(client)


async def test_a_truncated_response_is_reported_as_such() -> None:
    """``stop_reason=max_tokens`` explains the malformed JSON; say so in the record."""
    truncated = LLMResponse(text=MALFORMED, model="claude-sonnet-5", stop_reason="max_tokens")
    client = FakeLLMClient(script=[truncated, truncated])
    with pytest.raises(StructuredOutputError) as excinfo:
        await run(client)

    assert excinfo.value.reason == "invalid_json"
    assert "max_tokens" in str(excinfo.value)
