"""Generating the repro — spec §4.6 "Generation", plan §10 T5 step 8.

Every response here is one T3 recorded earlier, replayed through ``FakeLLMClient``: no network,
no model, and no repro invented by this test file. What is being checked is the wiring (one
call, schema-validated, one repair retry, a refused path stays refused) and the one thing the
prompt has to say — that a repro asserts the contract and not the bug.

The last section is the plan's step 8 and it is the point of the whole track: the recorded
import-error generation, executed for real, can only ever be ``inconclusive``.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from prguard.core.proof.deps import NullInstaller
from prguard.core.proof.generator import (
    PROMPT_KEY_PREFIX,
    SYSTEM_PROMPT,
    ProofGenerationError,
    ProofPromptContext,
    build_prompt,
    generate_repro,
    to_request,
)
from prguard.core.proof.runner import ProofPolicy, run_proof
from prguard.core.proof.subprocess_runner import SubprocessRunner
from prguard.core.types import ProofGeneration
from prguard.llm.client import FakeLLMClient
from tests.fixtures.loader import llm_fixture
from tests.proof.conftest import TEST_TIMEOUT_SECONDS, generation, make_finding

MODEL = "claude-opus-5"
CONTEXT = ProofPromptContext(
    repository="buggy_calc",
    enclosing_source="def apply_discount(price, rate):\n    discounted = price * (1 - rate)\n",
    file_imports="",
    sample_test="def test_line_total():\n    assert line_total(line) == 20.0\n",
)


def fake_for(fixture: str, *, rule_key: str = "unguarded_none_arithmetic") -> FakeLLMClient:
    """A provider that answers the recorded response for this finding's prompt key."""
    recorded = llm_fixture(fixture)
    return FakeLLMClient(
        routes={f"{PROMPT_KEY_PREFIX}:buggy_calc:{rule_key}": recorded.response_text}
    )


async def generate(client: FakeLLMClient, **overrides: Any) -> Any:
    return await generate_repro(
        client,
        finding=make_finding(**overrides.pop("finding_overrides", {})),
        context=overrides.pop("context", CONTEXT),
        model=overrides.pop("model", MODEL),
        timeout_seconds=overrides.pop("timeout_seconds", TEST_TIMEOUT_SECONDS),
        **overrides,
    )


# ---------------------------------------------------------------------------------------
# The prompt
# ---------------------------------------------------------------------------------------


def test_the_system_prompt_forbids_asserting_the_bug() -> None:
    """The single most load-bearing sentence in any prompt in this codebase.

    §4.6's own sample repro is ``with pytest.raises(TypeError)``, which fails at base and passes
    at head — it can never be `proven`. The corpus pins that shape as
    ``proof_generator_inverted_repro``. The prompt has to say so explicitly, with an example of
    each, or half the generations come back inverted.
    """
    assert "PASS at base, FAIL at head" in SYSTEM_PROMPT
    assert "Do not write" in SYSTEM_PROMPT
    assert "pytest.raises(TypeError)" in SYSTEM_PROMPT
    assert "Correct:" in SYSTEM_PROMPT and "Wrong:" in SYSTEM_PROMPT


def test_the_prompt_carries_everything_the_spec_lists() -> None:
    """§4.6: the finding, the enclosing function at head, the file's imports, one sample test."""
    finding = make_finding()
    prompt = build_prompt(finding, CONTEXT)

    assert CONTEXT.prompt_key(finding) in prompt
    assert finding.rule_key in prompt
    assert finding.title in prompt
    assert f"{finding.file_path}:{finding.start_line}" in prompt
    assert CONTEXT.enclosing_source in prompt
    assert CONTEXT.sample_test in prompt


def test_a_repository_with_no_tests_is_told_so_rather_than_shown_nothing() -> None:
    """E7: proof still runs on a repo with no suite — the repro is self-contained."""
    prompt = build_prompt(make_finding(), ProofPromptContext(repository="no_tests"))
    assert "this repository has no tests" in prompt


def test_the_prompt_key_is_the_one_the_corpus_recorded() -> None:
    recorded = llm_fixture("proof_generator_billing_none_rate")
    assert CONTEXT.prompt_key(make_finding()) == recorded.prompt_key


# ---------------------------------------------------------------------------------------
# One validated call per candidate
# ---------------------------------------------------------------------------------------


async def test_a_recorded_response_becomes_an_executable_request() -> None:
    client = fake_for("proof_generator_billing_none_rate")
    recorded = generation("proof_generator_billing_none_rate")

    request = await generate(client)

    assert request.finding_id == "f-9c2e"
    assert request.test_file_path == recorded.test_file_path
    assert request.test_code == recorded.test_code
    assert request.expected_failure_signal == "TypeError"
    assert request.extra_requirements == ()
    assert request.timeout_seconds == TEST_TIMEOUT_SECONDS
    assert request.require_baseline is True


async def test_exactly_one_model_call_per_candidate() -> None:
    """§4.6: "one LLM call per candidate". Three proofs a run is the entire budget (R2)."""
    client = fake_for("proof_generator_billing_none_rate")
    await generate(client)
    assert len(client.calls) == 1


async def test_the_configured_model_and_temperature_are_used() -> None:
    """Model routing is config (§4.8 ``MODEL_PROOF_GENERATOR``); nothing here may hardcode one."""
    client = fake_for("proof_generator_billing_none_rate")
    await generate(client, model="claude-sonnet-5", temperature=0.2, max_tokens=1234)

    call = client.calls[0]
    assert call.model == "claude-sonnet-5"
    assert call.temperature == 0.2
    assert call.max_tokens == 1234


async def test_extra_requirements_survive_into_the_request() -> None:
    """E8/E10: what the repro asked for is what the installer is judged against."""
    client = fake_for("proof_generator_import_error", rule_key="unguarded_none_arithmetic")
    request = await generate(client)
    assert request.extra_requirements == ("requests",)


# ---------------------------------------------------------------------------------------
# Rejection and repair
# ---------------------------------------------------------------------------------------


async def test_a_prose_response_is_repaired_once_and_then_accepted() -> None:
    """§6.12: validate, never trust. One repair, then give up (a paid API is not a retry loop)."""
    prose = llm_fixture("specialist_quality_prose").response_text
    valid = llm_fixture("proof_generator_billing_none_rate").response_text
    client = FakeLLMClient(script=[prose, valid])

    request = await generate(client)

    assert len(client.calls) == 2
    assert "REPAIR REQUEST" in client.calls[1].prompt
    assert request.expected_failure_signal == "TypeError"


async def test_a_response_that_never_validates_is_a_typed_degradation() -> None:
    """§8.1: "Proof generator fails: that finding is `not_attempted`, advisory." Not an exception
    escaping into the worker."""
    prose = llm_fixture("specialist_quality_prose").response_text
    client = FakeLLMClient(script=[prose, prose])

    with pytest.raises(ProofGenerationError):
        await generate(client)

    assert len(client.calls) == 2


@pytest.mark.parametrize(
    "path", ["/etc/cron.d/payload.py", "../../escape.py", ".prguard_proof/payload.sh"]
)
async def test_a_repro_path_outside_the_workspace_is_refused(path: str) -> None:
    """A model-chosen write path is an attack surface, and the schema cannot police it."""
    payload = dict(llm_fixture("proof_generator_billing_none_rate").parsed)
    payload["test_file_path"] = path
    client = FakeLLMClient(default=json.dumps(payload))

    with pytest.raises(ProofGenerationError):
        await generate(client)


async def test_a_repro_with_no_failure_signal_is_refused() -> None:
    """An unfalsifiable prediction can never be `proven`, so running it would waste a sandbox."""
    payload = dict(llm_fixture("proof_generator_billing_none_rate").parsed)
    payload["expected_failure_signal"] = "   "
    client = FakeLLMClient(default=json.dumps(payload))

    with pytest.raises(ProofGenerationError):
        await generate(client)


async def test_an_empty_repro_is_refused() -> None:
    payload = dict(llm_fixture("proof_generator_billing_none_rate").parsed)
    payload["test_code"] = "\n  \n"
    client = FakeLLMClient(default=json.dumps(payload))

    with pytest.raises(ProofGenerationError):
        await generate(client)


def test_a_generation_that_named_no_file_gets_a_default_path() -> None:
    """The schema requires the field; an empty string still has to land somewhere sensible."""
    request = to_request(
        ProofGeneration(
            test_file_path="",
            test_code="def test_x():\n    assert True\n",
            expected_failure_signal="TypeError",
        ),
        finding=make_finding(),
    )
    assert request.test_file_path == ".prguard_proof/test_f_9c2e.py"


# ---------------------------------------------------------------------------------------
# Plan §10 T5 step 8 — the import-error generation, executed
# ---------------------------------------------------------------------------------------


async def test_the_import_error_generation_resolves_to_inconclusive_never_proven(
    materialise_repo: Any,
) -> None:
    """The recorded repro imports ``requests`` into a repo with no manifest (E8/E10).

    Generated, materialised and executed end to end: the dependency cannot be installed, so the
    proof is capped at ``inconclusive`` no matter what the head run happens to do on this host.
    """
    client = fake_for("proof_generator_import_error")
    request = await generate(client)
    workspace = materialise_repo("no_manifest", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=TEST_TIMEOUT_SECONDS),
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS),
        installer=NullInstaller(),
    )

    assert outcome.deps_install_ok is False
    assert outcome.status == "inconclusive"
    assert outcome.status != "proven"


async def test_the_inverted_generation_resolves_to_inconclusive_never_proven(
    materialise_repo: Any,
) -> None:
    """And the other adversarial recording, for the same reason, by a different route."""
    client = fake_for("proof_generator_inverted_repro")
    request = await generate(client)
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=TEST_TIMEOUT_SECONDS),
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS),
        installer=NullInstaller(),
    )

    assert outcome.status == "inconclusive"
    assert outcome.status != "proven"
