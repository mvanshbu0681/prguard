"""The money shot, executed for real — AC-10 and AC-11.

Nothing is mocked below the classifier: these tests copy a committed fixture repo into a
temporary workspace, write T3's recorded repro into both trees, and spawn two actual pytest
processes. The exit codes and the captured output are the sandbox's, not a fixture's, which is
the only way "a finding with a red test attached" means anything.

Docker is not involved and does not need to be (R1): the runner here is the ``subprocess``
fallback, ``isolation`` reads ``degraded`` on every artifact it produces, and AC-10..AC-13 pass
with the daemon stopped — which is this machine's actual state.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from prguard.core.proof.deps import NullInstaller
from prguard.core.proof.runner import (
    DISPROVEN_CLAMP_NOTE,
    ProofPolicy,
    apply_outcome,
    artifact_columns,
    is_head_only,
    proof_confidence,
    run_proof,
)
from prguard.core.proof.subprocess_runner import SubprocessRunner, sandbox_env
from prguard.core.types import ProofOutcome, SeverityInputs, SeverityResult
from prguard.db import models
from tests.conftest import RowFactory
from tests.proof.conftest import TEST_TIMEOUT_SECONDS, make_finding, make_request, make_severity

POLICY = ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS)
RUNNER = SubprocessRunner(timeout_seconds=TEST_TIMEOUT_SECONDS)


async def execute(materialise_repo: Any, repo: str, fixture: str, **kwargs: Any) -> ProofOutcome:
    """Materialise ``repo``, write ``fixture``'s repro into both trees, and run the pair."""
    request = make_request(fixture)
    workspace = materialise_repo(repo, request, with_base=kwargs.pop("with_base", True))
    return await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=kwargs.pop("policy", POLICY),
        installer=NullInstaller(),
        **kwargs,
    )


# ---------------------------------------------------------------------------------------
# AC-10 — the positive path
# ---------------------------------------------------------------------------------------


async def test_base_passes_head_fails_marks_proven(materialise_repo: Any) -> None:
    """AC-10: the repro passes at base and fails at head → `proven`, with real output.

    ``buggy_calc`` removes ``apply_discount``'s ``rate is None`` guard between base and head.
    The recorded repro asserts the *documented* behaviour ("a promotion with no rate is a
    no-op"), so it is green before the PR and red after it — which is the whole claim, spelled
    out in two exit codes.
    """
    outcome = await execute(materialise_repo, "buggy_calc", "proof_generator_billing_none_rate")

    assert outcome.status == "proven"
    assert outcome.outcome == "failing_as_expected"
    assert outcome.baseline_mode == "compared"
    assert outcome.deps_install_ok is True

    assert outcome.base is not None and outcome.head is not None
    assert outcome.base.exit_code == 0
    assert outcome.head.exit_code == 1
    assert "1 passed" in outcome.base.stdout
    assert "TypeError" in outcome.head.stdout
    assert "app/billing.py" in outcome.head.stdout
    assert outcome.duration_ms > 0


async def test_the_proven_run_records_a_degraded_subprocess_sandbox(materialise_repo: Any) -> None:
    """E14: the label is not cosmetic. A proof run without Docker says so on the artifact."""
    outcome = await execute(materialise_repo, "buggy_calc", "proof_generator_billing_none_rate")
    assert outcome.runner == "subprocess"
    assert outcome.isolation == "degraded"


async def test_proven_sets_the_findings_proof_confidence_to_one(materialise_repo: Any) -> None:
    """AC-10's last clause: `severity_inputs.proof_confidence == 1.0` on the finding itself."""
    outcome = await execute(materialise_repo, "buggy_calc", "proof_generator_billing_none_rate")
    finding = make_finding()
    assert finding.severity is not None
    assert finding.severity.inputs.proof_confidence == 0.5  # S5 scored it before S7 ran

    apply_outcome(finding, outcome)

    assert finding.proof_status == "proven"
    assert finding.severity is not None
    assert finding.severity.inputs.proof_confidence == 1.0
    assert proof_confidence(outcome.status) == 1.0


async def test_the_artifact_persists_both_exit_codes_and_the_real_output(
    materialise_repo: Any, session: AsyncSession, rows: RowFactory, default_tenant: models.Tenant
) -> None:
    """AC-10: "artifact persisted with both exit codes and real captured output".

    Written through the real §5.1 table and read back, because a verdict that survives only in
    memory is not evidence — the audit trail is the ground truth for what the AI did.
    """
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)
    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=NullInstaller(),
    )

    repository = await rows.repository(default_tenant)
    pull_request = await rows.pull_request(default_tenant, repository)
    review_run = await rows.review_run(default_tenant, pull_request)
    finding = await rows.finding(default_tenant, review_run)
    await rows.proof_artifact(
        default_tenant,
        finding,
        review_run,
        **artifact_columns(outcome, request),
    )

    stored = (
        await session.execute(
            sa.select(models.ProofArtifact).where(models.ProofArtifact.finding_id == finding.id)
        )
    ).scalars().one()
    assert stored.base_exit_code == 0
    assert stored.head_exit_code == 1
    assert stored.outcome == models.ProofOutcome.FAILING_AS_EXPECTED.value
    assert stored.baseline_mode == models.BaselineMode.COMPARED.value
    assert stored.runner == models.ProofRunner.SUBPROCESS.value
    assert stored.isolation == models.ProofIsolation.DEGRADED.value
    assert stored.head_stdout is not None and "TypeError" in stored.head_stdout
    assert stored.base_stdout is not None and "1 passed" in stored.base_stdout
    assert stored.test_code == request.test_code
    assert stored.expected_failure_signal == "TypeError"
    assert stored.deps_install_ok is True


# ---------------------------------------------------------------------------------------
# AC-11 — the negative path, which is the more interesting half of the trust story
# ---------------------------------------------------------------------------------------


async def test_passing_repro_marks_disproven(materialise_repo: Any) -> None:
    """AC-11 / E12: the repro passes at head, so the finding refutes itself.

    ``buggy_calc_disproven`` is the same bug report against a head where the guard was
    *refactored* rather than removed. We said it was broken, we ran a test, the test was green:
    the honest answer is `disproven`, kept on the record with its artifact.
    """
    outcome = await execute(
        materialise_repo, "buggy_calc_disproven", "proof_generator_trivially_passing"
    )

    assert outcome.status == "disproven"
    assert outcome.outcome == "passed_unexpectedly"
    assert outcome.base is not None and outcome.head is not None
    assert outcome.base.exit_code == 0
    assert outcome.head.exit_code == 0
    assert "1 passed" in outcome.head.stdout


async def test_disproven_clamps_the_finding_to_info_and_never_blocks(
    materialise_repo: Any,
) -> None:
    """AC-11: `status=disproven`, `blocking=false`, band clamped to `info` with §6.4's note."""
    outcome = await execute(
        materialise_repo, "buggy_calc_disproven", "proof_generator_trivially_passing"
    )
    finding = make_finding(severity=make_severity(score=0.81, band="critical"))

    apply_outcome(finding, outcome)

    assert finding.proof_status == "disproven"
    assert finding.status == "disproven"
    assert finding.blocking is False
    assert finding.severity is not None
    assert finding.severity.band == "info"
    assert DISPROVEN_CLAMP_NOTE in finding.severity.notes
    assert finding.severity.inputs.proof_confidence == 0.0


async def test_disproven_keeps_the_score_that_was_computed_before_the_proof(
    materialise_repo: Any,
) -> None:
    """Being publicly wrong is the trust story; rewriting the score would erase the evidence."""
    outcome = await execute(
        materialise_repo, "buggy_calc_disproven", "proof_generator_trivially_passing"
    )
    finding = make_finding(severity=make_severity(score=0.81, band="critical"))

    apply_outcome(finding, outcome)

    assert finding.severity is not None
    assert finding.severity.score == pytest.approx(0.81)


async def test_the_artifact_is_retained_for_a_disproven_finding(materialise_repo: Any) -> None:
    """E12: "returned with the full artifact". Self-refutation is only credible with evidence."""
    outcome = await execute(
        materialise_repo, "buggy_calc_disproven", "proof_generator_trivially_passing"
    )
    columns = artifact_columns(outcome, make_request("proof_generator_trivially_passing"))
    assert columns["base_exit_code"] == 0
    assert columns["head_exit_code"] == 0
    assert columns["outcome"] == "passed_unexpectedly"
    assert "1 passed" in str(columns["head_stdout"])


# ---------------------------------------------------------------------------------------
# "There was no baseline" has two meanings and only one of them permits a proof
# ---------------------------------------------------------------------------------------


async def test_a_missing_base_tree_is_not_the_same_claim_as_a_new_file(
    materialise_repo: Any,
) -> None:
    """The sharpest false-`proven` trap in the whole track, and it looks like plumbing.

    §4.6 row 1 permits ``proven`` with no baseline **when the file is new at head** — there was
    nothing to run. A workspace that simply has no base tree is a different statement: maybe
    the tarball failed, maybe the caller forgot. Reading the second as the first would let any
    failing repro prove a bug with no passing-to-failing evidence at all.

    ``PROOF_REQUIRE_BASELINE`` is on here, so the honest answer is `inconclusive`.
    """
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS, require_baseline=True),
        installer=NullInstaller(),
    )

    assert outcome.head is not None and outcome.head.exit_code == 1
    assert outcome.base is None
    assert outcome.status == "inconclusive"
    assert outcome.status != "proven"


async def test_a_file_that_is_new_at_head_has_no_baseline_to_compare(
    materialise_repo: Any,
) -> None:
    """§4.6 row 1's parenthetical, stated explicitly by the caller rather than inferred."""
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS, require_baseline=True),
        installer=NullInstaller(),
        base_applicable=False,
    )

    assert outcome.status == "proven"
    assert outcome.baseline_mode == "not_applicable"


async def test_require_baseline_false_is_the_documented_head_only_shortcut(
    materialise_repo: Any,
) -> None:
    """§4.6: flipping it off halves demo latency and records ``baseline=skipped``."""
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS, require_baseline=False),
        installer=NullInstaller(),
    )

    assert outcome.status == "proven"
    assert outcome.baseline_mode == "skipped"
    assert is_head_only(outcome) is True


async def test_a_compared_proof_is_not_labelled_head_only(materialise_repo: Any) -> None:
    """§4.6: the label exists so a shortcut cannot be mistaken for the full claim."""
    outcome = await execute(materialise_repo, "buggy_calc", "proof_generator_billing_none_rate")
    assert outcome.baseline_mode == "compared"
    assert is_head_only(outcome) is False


async def test_a_request_that_waives_the_baseline_is_honoured(materialise_repo: Any) -> None:
    """The per-request flag and the config flag both have to want a baseline for one to run."""
    request = make_request("proof_generator_billing_none_rate", require_baseline=False)
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS, require_baseline=True),
        installer=NullInstaller(),
    )

    assert outcome.base is None
    assert outcome.baseline_mode == "skipped"
    assert outcome.status == "proven"


# ---------------------------------------------------------------------------------------
# The adversarial repro — T3's sharpest guard against a false `proven`
# ---------------------------------------------------------------------------------------


async def test_a_repro_asserting_the_bug_is_never_proven(materialise_repo: Any) -> None:
    """§4.6's own sample repro shape, executed: it fails at base and passes at head.

    ``with pytest.raises(TypeError)`` asserts *the bug* rather than the contract, so it is red
    before the PR and green after it — the exact inverse of the `proven` row. §4.6's table has
    no row for it; the corpus resolves it to `inconclusive`. An implementation that reads this
    as a proof has inverted the product's central claim, so this runs for real rather than
    being asserted on a synthetic pair.
    """
    outcome = await execute(materialise_repo, "buggy_calc", "proof_generator_inverted_repro")

    assert outcome.base is not None and outcome.head is not None
    assert outcome.base.exit_code == 1
    assert outcome.head.exit_code == 0
    assert outcome.status == "inconclusive"
    assert outcome.status != "proven"


# ---------------------------------------------------------------------------------------
# The sandbox is a sandbox, not a label
# ---------------------------------------------------------------------------------------


async def test_the_sandbox_carries_none_of_our_credentials(
    materialise_repo: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Generated code runs in an allow-listed environment, so a token cannot leak into it.

    The repro itself is the assertion: it exits 0 only if every credential this process holds
    is absent from its own environment.
    """
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_" + "a" * 36)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-" + "b" * 32)
    monkeypatch.setenv("PRGUARD_API_TOKEN", "c" * 40)
    request = make_request(
        "proof_generator_billing_none_rate",
        test_code=(
            "import os\n\n\n"
            "def test_no_credentials_reached_the_sandbox():\n"
            '    leaked = [key for key in ("GITHUB_TOKEN", "ANTHROPIC_API_KEY",\n'
            '                              "PRGUARD_API_TOKEN") if key in os.environ]\n'
            "    assert leaked == [], leaked\n"
        ),
    )
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    result = await RUNNER.execute(tree=workspace.head_tree, request=request)

    assert result.exit_code == 0, result.stdout + result.stderr


async def test_rlimits_really_are_applied_in_the_child(materialise_repo: Any) -> None:
    """The repro inspects its own limits, so a `preexec_fn` that silently did nothing fails.

    ``resource.setrlimit`` between fork and exec is easy to get wrong and impossible to notice
    from the parent, which is exactly why the assertion lives in the child.
    """
    request = make_request(
        "proof_generator_billing_none_rate",
        test_code=(
            "import resource\n\n\n"
            "def test_limits_were_lowered():\n"
            "    nofile, _ = resource.getrlimit(resource.RLIMIT_NOFILE)\n"
            "    cpu, _ = resource.getrlimit(resource.RLIMIT_CPU)\n"
            "    assert nofile == 64, nofile\n"
            "    assert cpu == 11, cpu\n"
        ),
    )
    workspace = materialise_repo("buggy_calc", request, with_base=False)
    runner = SubprocessRunner(
        timeout_seconds=TEST_TIMEOUT_SECONDS, max_open_files=64, cpu_seconds=11
    )

    result = await runner.execute(tree=workspace.head_tree, request=request)

    assert result.exit_code == 0, result.stdout + result.stderr


async def test_the_repro_runs_inside_the_workspace_and_sees_the_tree(
    materialise_repo: Any,
) -> None:
    """``PYTHONPATH`` is the tree root, so ``app`` imports with nothing installed (§4.6)."""
    request = make_request(
        "proof_generator_billing_none_rate",
        test_code=(
            "import os\n\n"
            "import app.billing\n\n\n"
            "def test_cwd_is_the_workspace():\n"
            '    assert os.path.isfile("app/billing.py")\n'
            "    assert app.billing.CENTS == 2\n"
        ),
    )
    workspace = materialise_repo("buggy_calc", request, with_base=False)

    result = await RUNNER.execute(tree=workspace.head_tree, request=request)

    assert result.exit_code == 0, result.stdout + result.stderr


def test_the_sandbox_disables_the_hosts_pytest_plugins() -> None:
    """``PYTEST_DISABLE_PLUGIN_AUTOLOAD`` is load-bearing, not tidiness.

    The host running this suite carries ``anyio``, ``asyncio`` and whatever else the developer
    installed globally; autoloaded into the sandbox they can change a repro's exit code, its
    summary line, or whether it is collected at all. A verdict that depends on which plugins
    happen to be installed on the machine is not evidence, and every proof in the product is
    read from exactly those two things.
    """
    env = sandbox_env(Path("/tmp/workspace"))

    assert env["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] == "1"
    assert env["PYTHONPATH"] == "/tmp/workspace"


def test_the_command_is_the_one_the_spec_documents() -> None:
    """§4.6: ``pytest <file> -q -p no:cacheprovider``."""
    request = make_request("proof_generator_billing_none_rate")
    command = RUNNER.command(request, python_executable="/venv/bin/python")
    assert command == [
        "/venv/bin/python",
        "-m",
        "pytest",
        request.test_file_path,
        "-q",
        "-p",
        "no:cacheprovider",
    ]


# ---------------------------------------------------------------------------------------
# The severity recompute seam
# ---------------------------------------------------------------------------------------


async def test_the_score_is_recomputed_when_the_pipeline_supplies_the_hook(
    materialise_repo: Any,
) -> None:
    """S9 hands `severity.compute` in, because proof changed one of the six inputs (§4.4)."""
    outcome = await execute(materialise_repo, "buggy_calc", "proof_generator_billing_none_rate")
    seen: list[SeverityInputs] = []

    def recompute(inputs: SeverityInputs) -> SeverityResult:
        seen.append(inputs)
        return SeverityResult(score=0.93, band="critical", inputs=inputs, weights={})

    finding = make_finding()
    apply_outcome(finding, outcome, recompute=recompute)

    assert [inputs.proof_confidence for inputs in seen] == [1.0]
    assert finding.severity is not None
    assert finding.severity.score == pytest.approx(0.93)
