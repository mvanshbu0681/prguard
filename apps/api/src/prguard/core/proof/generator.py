"""Generating the repro test — spec §4.6 "Generation", §6.12's validate-never-trust rule.

One LLM call per candidate, validated against :class:`~prguard.core.types.ProofGeneration` with
the single repair retry :mod:`prguard.llm.structured` provides. The interesting design decision
is not the plumbing, it is the *instruction*.

**The repro must assert the contract, not the bug.** §4.6's own worked example is
``with pytest.raises(TypeError)``, which is the wrong shape: it passes at head and fails at
base, the exact inverse of the ``proven`` row, so it can never prove anything (the corpus keeps
it as ``proof_generator_inverted_repro``, classified ``inconclusive``). A model left to its own
devices writes that test roughly half the time, because "write a test for this bug" and "write
a test this bug breaks" sound like the same request. The system prompt below spends most of its
length on that one distinction, because it is the difference between a proof and a shrug.

This is safe by construction either way — a badly-shaped repro yields ``inconclusive`` or
``disproven``, never a false ``proven`` (R3). Prompt quality decides *how much* we prove, and
the classifier decides *whether we are right*. Only one of those two is allowed to be a matter
of prompt engineering.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from prguard.core.proof.workspace import (
    UnsafeReproPathError,
    default_repro_path,
    safe_repro_path,
)
from prguard.core.types import CanonicalFinding, ProofGeneration, ProofRequest
from prguard.llm.client import LLMClient, LLMError
from prguard.llm.structured import StructuredOutputError, complete_structured

#: Prefix of the prompt key a fake provider routes on, and what the recorded fixtures are
#: keyed by: ``proof_generator:<repository>:<rule_key>``.
PROMPT_KEY_PREFIX: Final[str] = "proof_generator"

SYSTEM_PROMPT: Final[str] = """\
You write one Python test that decides whether a claimed bug is real.

The test is executed twice: once against the repository *before* the pull request (base) and
once against it *after* (head). Exactly one outcome counts as evidence:

    PASS at base, FAIL at head.

Write the test so that it asserts the behaviour the code is **supposed** to have. Do not write
a test that asserts the bug occurs. A test shaped like `with pytest.raises(TypeError): ...`
fails at base and passes at head, which is the opposite of evidence and will be discarded.

  Correct:   assert apply_discount(100.0, None) == 100.0     # the documented contract
  Wrong:     with pytest.raises(TypeError): apply_discount(100.0, None)

Rules:

1. Exercise the changed code path directly, with the input the finding names.
2. Assert the documented or obviously-intended behaviour, never the defect.
3. Import only from the repository under review and the Python standard library, unless you
   list a package in `extra_requirements`. There is no network inside the sandbox.
4. No sleeps, no timers, no polling, no filesystem or process side effects. The test must run
   in under a second.
5. `expected_failure_signal` must be a distinctive, case-sensitive substring that appears in
   the failure output at head — usually an exception class name such as `TypeError`.
6. The test file path must be relative and end in `.py`; put it under `.prguard_proof/`.
7. If the finding cannot be settled by an automated test, still answer in the schema and say so
   in `explanation`. A weak repro is better than a fabricated one: an inconclusive result costs
   us a claim, a wrong result costs us the product.

Return one JSON object matching the schema and nothing else."""


class ProofGenerationError(LLMError):
    """No usable repro could be generated. The caller records ``not_attempted`` (§8.1)."""


@dataclass(frozen=True)
class ProofPromptContext:
    """Everything §4.6 says goes into the generation prompt.

    The three source fields are **repository content and therefore untrusted** (§3 Tier 3, E15).
    The caller sanitises them with ``core/sanitize.py`` before constructing this object; this
    module only labels the sections, so nothing is wrapped twice or unwrapped by accident.
    """

    repository: str
    enclosing_source: str = ""
    file_imports: str = ""
    sample_test: str = ""

    def prompt_key(self, finding: CanonicalFinding) -> str:
        """``proof_generator:<repository>:<rule_key>`` — the key the fixtures are recorded by."""
        return f"{PROMPT_KEY_PREFIX}:{self.repository}:{finding.rule_key}"


def build_prompt(finding: CanonicalFinding, context: ProofPromptContext) -> str:
    """The user half of the generation request (§4.6: finding, enclosing source, imports, test)."""
    return "\n\n".join(
        [
            context.prompt_key(finding),
            "## Finding",
            f"rule_key: {finding.rule_key}",
            f"category: {finding.category}",
            f"location: {finding.file_path}:{finding.start_line}-{finding.end_line}",
            f"symbol: {finding.symbol_path}",
            f"title: {finding.title}",
            finding.body_markdown,
            "## Enclosing function at head",
            context.enclosing_source or "(not available)",
            "## Imports in that file",
            context.file_imports or "(not available)",
            "## An existing test from this repository, for convention",
            context.sample_test or "(this repository has no tests; write a self-contained one)",
            "## Task",
            "Write the one test described in the system prompt. It must pass at base and fail "
            "at head.",
        ]
    )


async def generate_repro(
    client: LLMClient,
    *,
    finding: CanonicalFinding,
    context: ProofPromptContext,
    model: str,
    max_tokens: int = 8000,
    temperature: float = 0.0,
    timeout_seconds: int = 90,
    require_baseline: bool = True,
) -> ProofRequest:
    """One call, validated, turned into an executable :class:`ProofRequest`.

    Raises :class:`ProofGenerationError` when the model could not produce a usable repro after
    the one repair retry, or produced one whose ``test_file_path`` points outside the workspace.
    The caller catches it and records the finding ``not_attempted`` — a generator failure is a
    degradation, never a failed run (§8.1).
    """
    try:
        generation = await complete_structured(
            client,
            model=model,
            system=SYSTEM_PROMPT,
            prompt=build_prompt(finding, context),
            schema=ProofGeneration,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except StructuredOutputError as exc:
        raise ProofGenerationError(
            f"no valid repro for finding {finding.id}: {exc}"
        ) from exc
    return to_request(
        generation,
        finding=finding,
        timeout_seconds=timeout_seconds,
        require_baseline=require_baseline,
    )


def to_request(
    generation: ProofGeneration,
    *,
    finding: CanonicalFinding,
    timeout_seconds: int = 90,
    require_baseline: bool = True,
) -> ProofRequest:
    """Turn a validated generation into something the runner will execute.

    The path and the signal are re-checked here rather than trusted from the schema: pydantic
    proved the response *has* those fields, not that the values are safe to act on. An empty
    signal is refused because a repro with no falsifiable prediction can never be ``proven`` —
    running it would spend a sandbox to learn nothing.
    """
    if not generation.test_code.strip():
        raise ProofGenerationError(f"the generated repro for {finding.id} has no test code")
    if not generation.expected_failure_signal.strip():
        raise ProofGenerationError(
            f"the generated repro for {finding.id} predicts no failure signal, "
            "so it could never be proven"
        )
    path = generation.test_file_path.strip() or default_repro_path(finding.id)
    try:
        safe_repro_path(path)
    except UnsafeReproPathError as exc:
        raise ProofGenerationError(f"refused repro path for {finding.id}: {exc}") from exc
    return ProofRequest(
        finding_id=finding.id,
        test_file_path=path,
        test_code=generation.test_code,
        expected_failure_signal=generation.expected_failure_signal.strip(),
        extra_requirements=tuple(generation.extra_requirements),
        timeout_seconds=timeout_seconds,
        require_baseline=require_baseline,
    )
