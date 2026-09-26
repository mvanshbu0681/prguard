"""Secret redaction and output truncation — E26, §4.6, plan §10 T5 step 10.

Sandbox output is persisted, served over the API and quoted in a GitHub review body, so a token
that reaches stdout is a token that gets published. The repro is generated code running against
a repository we did not write; it can print whatever it finds, and "it should not find
anything" is not a control.

The ordering assertion is the one worth keeping: redaction runs *before* truncation, so a cut
through the middle of a token cannot leave a recognisable prefix behind.
"""

from __future__ import annotations

from typing import Any

import pytest

from prguard.core.proof.deps import NullInstaller
from prguard.core.proof.redact import (
    MIN_SECRET_LENGTH,
    REDACTED,
    TRUNCATION_MARKER,
    configured_secrets,
    redact,
    redact_output,
    truncate,
)
from prguard.core.proof.runner import ProofPolicy, run_proof
from prguard.core.proof.subprocess_runner import SubprocessRunner
from tests.proof.conftest import TEST_TIMEOUT_SECONDS, make_request

GITHUB_TOKEN = "ghp_" + "A1b2C3d4E5f6G7h8" * 2
GITHUB_PAT = "github_pat_" + "1" * 30
ANTHROPIC_KEY = "sk-ant-api03-" + "x" * 40
AWS_KEY = "AKIAIOSFODNN7EXAMPLE"


# ---------------------------------------------------------------------------------------
# The E26 pattern table
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("secret", [GITHUB_TOKEN, GITHUB_PAT, ANTHROPIC_KEY, AWS_KEY])
def test_known_token_prefixes_are_masked(secret: str) -> None:
    """E26's list verbatim: ``ghp_``, ``github_pat_``, ``sk-ant-``, ``AKIA``."""
    redacted = redact(f"traceback said: {secret} was rejected")

    assert secret not in redacted
    assert REDACTED in redacted


def test_bearer_tokens_are_masked_whatever_shape_they_take() -> None:
    redacted = redact("requests.get(url, headers={'x': 'Bearer abc.def-ghi_jkl123'})")
    assert "abc.def-ghi_jkl123" not in redacted
    assert "Bearer " + REDACTED in redacted


def test_authorization_headers_are_masked_whole() -> None:
    """The header name is not the secret; the rest of the line always is."""
    redacted = redact(f"Authorization: Bearer {GITHUB_TOKEN}\nContent-Type: application/json")

    assert GITHUB_TOKEN not in redacted
    assert "Authorization: " + REDACTED in redacted
    assert "Content-Type: application/json" in redacted


def test_configured_secret_values_are_masked_even_in_an_unknown_shape() -> None:
    """The other half of E26: whatever this process holds, in whatever format it holds it."""
    secret = "an-unremarkable-looking-deploy-key-value"
    redacted = redact(f"env says SECRET={secret}", secrets=[secret])

    assert secret not in redacted
    assert REDACTED in redacted


def test_a_short_configured_value_is_not_masked() -> None:
    """Masking a three-character value would redact the alphabet out of every traceback."""
    assert redact("the answer is ok", secrets=["ok"]) == "the answer is ok"
    assert len("ok") < MIN_SECRET_LENGTH


def test_configured_secrets_are_ordered_longest_first() -> None:
    """A token containing a shorter configured value must be masked whole, not left with a tail."""
    assert configured_secrets("abcdefghij", "abcdefghijklmno", None, "x") == (
        "abcdefghijklmno",
        "abcdefghij",
    )


def test_a_token_with_no_word_boundary_in_front_of_it_is_still_masked() -> None:
    """A token glued to the end of a word, or buried in a blob, is the same token.

    ``\\bghp_…`` looks right and quietly misses ``...decodedghp_AAAA``: there is no boundary
    between two word characters. Over-redacting a traceback is survivable; the alternative is
    publishing a credential.
    """
    redacted = redact(f"decoded{GITHUB_TOKEN}tail")
    assert "ghp_" not in redacted
    assert REDACTED in redacted


def test_redaction_leaves_ordinary_output_alone() -> None:
    """A redactor that eats real tracebacks destroys the evidence it was protecting."""
    traceback = (
        "E       TypeError: unsupported operand type(s) for -: 'int' and 'NoneType'\n"
        "app/billing.py:41: TypeError\n1 failed in 0.01s\n"
    )
    assert redact(traceback) == traceback


def test_redacting_nothing_is_cheap_and_safe() -> None:
    assert redact("") == ""
    assert redact_output("", max_bytes=10) == ""


# ---------------------------------------------------------------------------------------
# Truncation at PROOF_OUTPUT_MAX_BYTES
# ---------------------------------------------------------------------------------------


def test_output_is_truncated_to_the_configured_budget() -> None:
    """§4.8 default 20 000 bytes — a runaway repro must not become a runaway database row."""
    truncated = truncate("x" * 50_000, max_bytes=20_000)

    assert len(truncated.encode("utf-8")) <= 20_000
    assert TRUNCATION_MARKER in truncated


def test_truncation_keeps_the_tail_where_pytest_puts_the_verdict() -> None:
    """A head-only cut would throw away the evidence the classifier is about to look for.

    pytest prints the traceback and ``1 failed`` last, and ``expected_failure_signal`` lives in
    that tail. Dropping it would mean a repro that printed 200 KB before failing could never be
    `proven` — we would lose real proofs to a storage limit.
    """
    payload = "start of output\n" + "z" * 50_000 + "\nE   TypeError: boom\n1 failed in 0.01s\n"

    truncated = truncate(payload, max_bytes=2_000)

    assert "start of output" in truncated
    assert "TypeError: boom" in truncated
    assert "1 failed in 0.01s" in truncated
    assert TRUNCATION_MARKER in truncated
    assert len(truncated.encode("utf-8")) <= 2_000


def test_the_marker_is_inside_the_budget_not_appended_to_it() -> None:
    """Otherwise "the limit" is a limit plus however long the marker happens to be (§5.2)."""
    assert len(truncate("y" * 500, max_bytes=120).encode("utf-8")) <= 120


def test_short_output_is_returned_untouched() -> None:
    assert truncate("1 passed in 0.01s\n", max_bytes=20_000) == "1 passed in 0.01s\n"


def test_truncation_never_splits_a_character() -> None:
    """Byte budgets and multi-byte characters: a cut mid-codepoint would raise on decode."""
    truncated = truncate("é" * 400, max_bytes=201)
    assert "�" not in truncated
    assert len(truncated.encode("utf-8")) <= 201


def test_a_zero_budget_yields_nothing_rather_than_raising() -> None:
    assert truncate("anything", max_bytes=0) == ""


# ---------------------------------------------------------------------------------------
# The two together, in the order §4.6 requires
# ---------------------------------------------------------------------------------------


def budget_that_cuts_after(head_chars: int) -> int:
    """A ``max_bytes`` whose head slice is exactly ``head_chars`` bytes long."""
    return len(TRUNCATION_MARKER.encode("utf-8")) + head_chars * 4


def test_a_configured_secret_cut_in_half_is_still_masked() -> None:
    """The ordering assertion, and it is a real one: the wrong order is shown to leak.

    A literal secret is matched by equality, so half of one matches nothing. Truncating first
    therefore leaves the first half of the value sitting in the persisted artifact, where the
    redactor will never look at it again.
    """
    secret = "prguard-deploy-key-0123456789abcdef"
    payload = secret + "n" * 500
    max_bytes = budget_that_cuts_after(20)

    leaky = redact(truncate(payload, max_bytes=max_bytes), secrets=[secret])
    assert secret[:20] in leaky, "truncate-then-redact is expected to leak; that is the point"

    assert secret[:15] not in redact_output(payload, max_bytes=max_bytes, secrets=[secret])


def test_a_token_cut_below_its_pattern_length_is_still_masked() -> None:
    """Same argument for the pattern half: ``ghp_A1b`` is too short for the regex to catch."""
    payload = GITHUB_TOKEN + "n" * 500
    max_bytes = budget_that_cuts_after(7)

    leaky = redact(truncate(payload, max_bytes=max_bytes))
    assert "ghp_" in leaky, "truncate-then-redact is expected to leak; that is the point"

    assert "ghp_" not in redact_output(payload, max_bytes=max_bytes)


def test_the_budget_is_honoured_after_redaction() -> None:
    result = redact_output(f"{ANTHROPIC_KEY} " * 500, max_bytes=300)
    assert len(result.encode("utf-8")) <= 300
    assert "sk-ant-" not in result


# ---------------------------------------------------------------------------------------
# End to end: what a repro prints is what gets persisted, and it is clean
# ---------------------------------------------------------------------------------------


async def test_a_repro_that_prints_a_token_has_it_redacted_in_the_artifact(
    materialise_repo: Any,
) -> None:
    """The whole point, exercised against a real process rather than a string.

    The repro deliberately writes a credential to stdout. What lands on the artifact — the
    thing that is persisted, served and quoted — must not contain it.
    """
    request = make_request(
        "proof_generator_billing_none_rate",
        test_code=(
            "def test_prints_a_secret_then_fails():\n"
            f'    print("token={GITHUB_TOKEN}")\n'
            f'    print("Authorization: Bearer {ANTHROPIC_KEY}")\n'
            "    raise TypeError(\"unsupported operand\")\n"
        ),
    )
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=TEST_TIMEOUT_SECONDS),
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS, require_baseline=False),
        installer=NullInstaller(),
    )

    assert outcome.head is not None
    combined = outcome.head.stdout + outcome.head.stderr
    assert GITHUB_TOKEN not in combined
    assert ANTHROPIC_KEY not in combined
    assert REDACTED in combined
    # The evidence itself survives: redaction must not cost us the failure signal.
    assert "TypeError" in combined


async def test_the_configured_secrets_of_this_process_are_masked_too(
    materialise_repo: Any,
) -> None:
    """``secrets=`` is how the run passes its own credentials to the redactor (E26)."""
    literal = "a-deploy-key-that-matches-no-pattern-at-all"
    request = make_request(
        "proof_generator_billing_none_rate",
        test_code=(
            "def test_prints_a_configured_value():\n"
            f'    print("value={literal}")\n'
            "    raise TypeError(\"unsupported operand\")\n"
        ),
    )
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=TEST_TIMEOUT_SECONDS),
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS, require_baseline=False),
        installer=NullInstaller(),
        secrets=configured_secrets(literal),
    )

    assert outcome.head is not None
    assert literal not in outcome.head.stdout + outcome.head.stderr


async def test_a_noisy_repro_is_capped_without_losing_its_verdict(materialise_repo: Any) -> None:
    """§5.2: truncated before insert — and still provable, because the tail survives.

    200 KB of noise then a real failure. The budget is honoured, and the signal that justifies
    the verdict is still in the artifact that gets persisted, which is what makes the artifact
    evidence rather than a summary of evidence.
    """
    request = make_request(
        "proof_generator_billing_none_rate",
        test_code=(
            "def test_is_extremely_chatty():\n"
            '    print("z" * 200_000)\n'
            '    raise TypeError("unsupported operand")\n'
        ),
    )
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=TEST_TIMEOUT_SECONDS),
        policy=ProofPolicy(
            timeout_seconds=TEST_TIMEOUT_SECONDS, require_baseline=False, output_max_bytes=20_000
        ),
        installer=NullInstaller(),
    )

    assert outcome.head is not None
    assert len(outcome.head.stdout.encode("utf-8")) <= 20_000
    assert TRUNCATION_MARKER in outcome.head.stdout
    assert "TypeError" in outcome.head.stdout
    assert outcome.status == "proven"
