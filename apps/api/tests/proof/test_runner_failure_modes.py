"""Everything that can go wrong in a sandbox, and the one thing that must not — AC-12.

E11 (timeout), E10 (dependency install failure), E13 (red at base and at head) and E8 (no
manifest at all). Four different accidents, one required behaviour: the proof degrades to
advisory, the finding stays unblocking, and **the run still succeeds**. Proof never fails a run
(§4.1 S7).

The second requirement is the one worth being paranoid about. E10's row in the corpus exists
because every input except ``deps_ok`` matches the `proven` row: if the conjunct were ever
dropped, a repro that failed at head only because half its dependencies were missing would be
reported as a proof. The A/B below runs exactly that pair.
"""

from __future__ import annotations

import os
import signal
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from prguard.core.proof.deps import (
    InstallResult,
    NullInstaller,
    Requirements,
    UvInstaller,
    discover_requirements,
)
from prguard.core.proof.runner import (
    ProofPolicy,
    apply_outcome,
    errored_outcome,
    proof_confidence,
    run_proof,
)
from prguard.core.proof.subprocess_runner import TIMEOUT_EXIT_CODE, SubprocessRunner
from prguard.core.types import ProofRequest, RunResult
from tests.fixtures.loader import proof_case, repo_tree
from tests.proof.conftest import TEST_TIMEOUT_SECONDS, make_finding, make_request

#: An unresolvable pin that fails with or without a network — the same one
#: ``tests/fixtures/repos/bad_requirements`` carries.
UNRESOLVABLE = "prguard-fixture-package-that-does-not-exist==9.9.9"

#: ``--no-index`` keeps the real installer's real failure path offline and instant. VERIFY has
#: to pass with no network (§9 condition 1), and a test that reaches PyPI to watch it say "404"
#: is a test that hangs the night DNS is slow.
OFFLINE_UV = UvInstaller(extra_args=("--no-index",), timeout_seconds=TEST_TIMEOUT_SECONDS)

POLICY = ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS)
RUNNER = SubprocessRunner(timeout_seconds=TEST_TIMEOUT_SECONDS)


# ---------------------------------------------------------------------------------------
# E11 — the repro that never finishes
# ---------------------------------------------------------------------------------------


async def test_timeout_is_inconclusive(materialise_repo: Any) -> None:
    """AC-12 / E11: ``slow_test`` sleeps past the budget; the group is killed and we learn nothing.

    ``PROOF_TIMEOUT`` is shortened here because the fixture sleeps 120 s and the point is the
    kill, not the wait. The verdict, the exit code and the ``timed_out`` flag are the real ones.
    """
    request = make_request("proof_generator_slow_repro", timeout_seconds=2)
    workspace = materialise_repo("slow_test", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=2),
        policy=ProofPolicy(timeout_seconds=2),
        installer=NullInstaller(),
    )

    assert outcome.status == "inconclusive"
    assert outcome.outcome == "timeout"
    assert outcome.head is not None
    assert outcome.head.timed_out is True
    assert outcome.head.exit_code == TIMEOUT_EXIT_CODE
    assert "PROOF_TIMEOUT" in outcome.head.stderr


async def test_a_timed_out_proof_leaves_the_finding_advisory(materialise_repo: Any) -> None:
    """AC-12: `blocking=false`. A sandbox that ran out of time has proved nothing either way."""
    request = make_request("proof_generator_slow_repro", timeout_seconds=2)
    workspace = materialise_repo("slow_test", request, with_base=False)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=2),
        policy=ProofPolicy(timeout_seconds=2, require_baseline=False),
        installer=NullInstaller(),
    )
    finding = apply_outcome(make_finding(status="published"), outcome)

    assert finding.proof_status == "inconclusive"
    assert finding.blocking is False
    assert proof_confidence(outcome.status) == 0.5


async def test_the_timeout_kills_the_whole_process_group(materialise_repo: Any) -> None:
    """E11: a repro that spawned children must not leave them holding the pipe open.

    Without ``start_new_session`` plus ``killpg`` this hangs rather than fails, so the assertion
    that matters is that the call returns at all.
    """
    request = make_request(
        "proof_generator_slow_repro",
        timeout_seconds=2,
        test_code=(
            "import subprocess\n"
            "import sys\n\n\n"
            "def test_spawns_a_child_that_outlives_it():\n"
            '    subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])\n'
            "    import time\n"
            "    time.sleep(120)\n"
        ),
    )
    workspace = materialise_repo("slow_test", request, with_base=False)

    result = await SubprocessRunner(timeout_seconds=2).execute(
        tree=workspace.head_tree, request=request
    )

    assert result.timed_out is True
    assert result.duration_ms < 20_000


async def test_the_timeout_kills_the_childs_children_and_not_only_the_child(
    materialise_repo: Any,
) -> None:
    """E11, stated as the survivors rather than as the wall clock.

    The test above notices a ``process.kill()`` only because the orphan happens to hold the
    output pipe open; a repro that redirects its children elsewhere would leave them running
    for as long as they like and nothing would ever say so. So this one hands the grandchild
    ``DEVNULL``, records its pid from inside the sandbox, and asks the operating system
    afterwards whether it is still there. ``start_new_session`` puts the repro in its own
    process group precisely so that ``killpg`` can answer "no".
    """
    request = make_request(
        "proof_generator_slow_repro",
        timeout_seconds=2,
        test_code=(
            "import pathlib\n"
            "import subprocess\n"
            "import sys\n"
            "import time\n\n\n"
            "def test_spawns_a_child_that_does_not_hold_the_pipe():\n"
            "    child = subprocess.Popen(\n"
            '        [sys.executable, "-c", "import time; time.sleep(60)"],\n'
            "        stdout=subprocess.DEVNULL,\n"
            "        stderr=subprocess.DEVNULL,\n"
            "    )\n"
            '    pathlib.Path("grandchild.pid").write_text(str(child.pid))\n'
            "    time.sleep(60)\n"
        ),
    )
    workspace = materialise_repo("slow_test", request, with_base=False)

    result = await SubprocessRunner(timeout_seconds=2).execute(
        tree=workspace.head_tree, request=request
    )

    assert result.timed_out is True
    pid_file = workspace.head_tree / "grandchild.pid"
    assert pid_file.is_file(), "the repro never got as far as spawning its child"
    grandchild = int(pid_file.read_text())
    try:
        assert _is_dead(grandchild), (
            f"pid {grandchild} outlived the repro: the timeout killed the process, not the group"
        )
    finally:
        _reap(grandchild)


def _is_dead(pid: int, *, within_seconds: float = 5.0) -> bool:
    """Whether ``pid`` is gone, polling briefly so a signal in flight is not a flake."""
    deadline = time.monotonic() + within_seconds
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except (ProcessLookupError, PermissionError):
            return True
        time.sleep(0.05)
    return False


def _reap(pid: int) -> None:
    """Leave no 60-second orphan behind when the assertion above fails."""
    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        return


# ---------------------------------------------------------------------------------------
# E10 — the dependency that could not be installed
# ---------------------------------------------------------------------------------------


async def test_dep_install_failure_caps_at_inconclusive(materialise_repo: Any) -> None:
    """AC-12 / E10: the `proven` scenario, minus a working install, is not a proof.

    Same repo, same repro, same two exit codes, same failure signal — the only difference from
    ``test_base_passes_head_fails_marks_proven`` is one requirement that cannot be installed.
    The corpus keeps this row for exactly this reason: an install failure can never produce a
    `proven` finding.
    """
    request = make_request(
        "proof_generator_billing_none_rate", extra_requirements=(UNRESOLVABLE,)
    )
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=OFFLINE_UV,
    )

    assert outcome.deps_install_ok is False
    assert outcome.status == "inconclusive"
    assert outcome.outcome == "error"
    assert outcome.base is not None and outcome.head is not None
    assert (outcome.base.exit_code, outcome.head.exit_code) == (0, 1)
    assert "TypeError" in outcome.head.stdout
    assert "dependency install failed" in outcome.detail


async def test_the_same_request_without_the_bad_pin_is_proven(materialise_repo: Any) -> None:
    """The other half of the A/B: with nothing to install, the identical repro proves the bug."""
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=OFFLINE_UV,
    )

    assert outcome.deps_install_ok is True
    assert outcome.status == "proven"


@dataclass
class RecordingInstaller:
    """An installer that succeeds, fails, or both, depending on which tree it is handed.

    ``run_proof`` installs into base and head separately, and ``deps_ok`` is the conjunction of
    the two results. Every fixture above fails *both* halves at once, so the base-side conjunct
    could be dropped without a single test noticing — which is E10's rule ("an install failure
    can never produce a `proven` finding") quietly holding only on the head.
    """

    failing_trees: tuple[str, ...] = ()
    interpreter_for: dict[str, str] = field(default_factory=dict)
    seen: list[Path] = field(default_factory=list)

    async def install(self, *, tree: Path, requirements: Requirements) -> InstallResult:
        self.seen.append(tree)
        if tree.name in self.failing_trees:
            return InstallResult(ok=False, performed=True, detail=f"install failed in {tree.name}")
        return InstallResult(
            ok=True,
            performed=True,
            detail=f"installed in {tree.name}",
            python_executable=self.interpreter_for.get(tree.name),
        )


async def test_an_install_failure_at_base_alone_can_never_be_proven(
    materialise_repo: Any,
) -> None:
    """E10 on the half nothing else covers: base could not be prepared, so its pass proves nothing.

    Same repo, same repro, same two exit codes as ``test_base_passes_head_fails_marks_proven``.
    The only difference is that the *baseline* tree was never given what it needed, which makes
    its green meaningless — the repro may have passed there for want of a dependency rather
    than because the contract held.
    """
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=RecordingInstaller(failing_trees=("base",)),
    )

    assert outcome.base is not None and outcome.head is not None
    assert (outcome.base.exit_code, outcome.head.exit_code) == (0, 1)
    assert "TypeError" in outcome.head.stdout
    assert outcome.deps_install_ok is False
    assert outcome.status == "inconclusive"
    assert outcome.status != "proven"


async def test_both_installs_succeeding_is_what_the_same_request_needs(
    materialise_repo: Any,
) -> None:
    """The other half of the A/B: the identical run with both trees prepared is the proof."""
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=RecordingInstaller(),
    )

    assert outcome.deps_install_ok is True
    assert outcome.status == "proven"


async def test_each_tree_is_run_by_the_interpreter_its_own_install_created(
    materialise_repo: Any,
) -> None:
    """§4.6: ``uv venv`` then run the repro *in that venv*, per tree.

    A runner invoked with ``python_executable=None`` would fall back to this process's
    interpreter, where the installed dependency is not present — the install would be real, the
    run would not use it, and E10's boolean would say everything was fine. The two trees get
    different venvs, so passing the head's interpreter to both is caught as well.
    """
    installer = RecordingInstaller(
        interpreter_for={"head": "/venv/head/bin/python", "base": "/venv/base/bin/python"}
    )
    invocations: list[tuple[str, str | None]] = []

    class RecordingRunner:
        name = "subprocess"
        isolation = "degraded"

        async def execute(
            self, *, tree: Path, request: ProofRequest, python_executable: str | None = None
        ) -> RunResult:
            invocations.append((tree.name, python_executable))
            passed = RunResult(exit_code=0, stdout="1 passed in 0.01s\n")
            failed = RunResult(exit_code=1, stdout="E   TypeError: nope\n1 failed in 0.01s\n")
            return passed if tree.name == "base" else failed

    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RecordingRunner(),  # type: ignore[arg-type]
        policy=POLICY,
        installer=installer,
    )

    assert dict(invocations) == {
        "head": "/venv/head/bin/python",
        "base": "/venv/base/bin/python",
    }
    assert outcome.status == "proven"


async def test_a_failed_install_leaves_the_finding_advisory(materialise_repo: Any) -> None:
    request = make_request(
        "proof_generator_billing_none_rate", extra_requirements=(UNRESOLVABLE,)
    )
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=OFFLINE_UV,
    )
    finding = apply_outcome(make_finding(status="published"), outcome)

    assert finding.blocking is False


async def test_the_bad_requirements_fixture_really_cannot_be_installed(tmp_path: Path) -> None:
    """The committed E10 fixture, through the real installer: an unresolvable pin, recorded."""
    tree = tmp_path / "bad"
    tree.mkdir()
    (tree / "requirements.txt").write_text(
        (repo_tree("bad_requirements", "head") / "requirements.txt").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    requirements = discover_requirements(tree)

    result = await OFFLINE_UV.install(tree=tree, requirements=requirements)

    assert requirements.requirements_file == "requirements.txt"
    assert requirements.packages == (UNRESOLVABLE,)
    assert result.ok is False
    assert result.performed is True
    assert UNRESOLVABLE.split("==")[0] in result.output


def test_the_corpus_row_for_a_failed_install_is_the_proven_row_minus_deps_ok() -> None:
    """Reading the fixture back, so the claim above is the corpus's and not this file's."""
    case = proof_case("inconclusive_dependency_install_failed")
    proven = proof_case("proven_billing_none_rate")

    assert case["deps_ok"] is False
    assert proven["deps_ok"] is True
    assert (case["base_outcome"], case["head_outcome"], case["signal_present"]) == (
        proven["base_outcome"],
        proven["head_outcome"],
        proven["signal_present"],
    )
    assert case["expected_proof_status"] == "inconclusive"


def test_an_installer_that_has_nothing_to_do_does_not_shell_out() -> None:
    """A tree with no third-party requirement needs no venv, no index and no network at all."""
    assert UvInstaller().install_command(Requirements(packages=("httpx",))) == [
        "uv",
        "pip",
        "install",
        "--python",
        ".prguard_venv/bin/python",
        "httpx",
    ]
    assert UvInstaller().venv_command() == ["uv", "venv", ".prguard_venv", "--system-site-packages"]


async def test_nothing_to_install_is_a_success_not_a_skip(tmp_path: Path) -> None:
    """``deps_install_ok`` means "the repro has what it needs", not "a command exited 0"."""
    result = await OFFLINE_UV.install(tree=tmp_path, requirements=Requirements())
    assert (result.ok, result.performed) == (True, False)


# ---------------------------------------------------------------------------------------
# E13 — red before the PR, red after it
# ---------------------------------------------------------------------------------------


async def test_pre_existing_failure_not_proven(materialise_repo: Any) -> None:
    """AC-12 / E13: ``parse_duration`` was already broken; this PR did not cause it.

    Note that the expected failure signal *is* present in the head output. This row is the
    proof that a matching signal alone means nothing — without a green baseline there is no
    passing-to-failing claim to make.
    """
    request = make_request("proof_generator_pre_existing_failure")
    workspace = materialise_repo("pre_existing_failure", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=NullInstaller(),
    )

    assert outcome.status == "inconclusive"
    assert outcome.outcome == "pre_existing_failure"
    assert outcome.base is not None and outcome.head is not None
    assert outcome.base.exit_code == 1
    assert outcome.head.exit_code == 1
    assert "AssertionError" in outcome.head.stdout
    assert outcome.status != "proven"


async def test_a_pre_existing_failure_leaves_the_finding_advisory(materialise_repo: Any) -> None:
    request = make_request("proof_generator_pre_existing_failure")
    workspace = materialise_repo("pre_existing_failure", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=NullInstaller(),
    )
    finding = apply_outcome(make_finding(status="published"), outcome)

    assert finding.blocking is False
    assert finding.status == "published"  # not clamped: we did not refute it, we just cannot say


# ---------------------------------------------------------------------------------------
# E8 — the repo with no manifest
# ---------------------------------------------------------------------------------------


def test_a_repo_with_no_manifest_has_nothing_to_install() -> None:
    """E8: skip the install, run against the standard library."""
    requirements = discover_requirements(repo_tree("no_manifest", "head"))

    assert requirements.has_manifest is False
    assert requirements.manifest is None
    assert requirements.needed is False


async def test_a_stdlib_only_repro_runs_fine_without_a_manifest(materialise_repo: Any) -> None:
    """E8's happy half: no manifest is not an obstacle when the repro needs nothing."""
    request = make_request(
        "proof_generator_import_error",
        test_code=(
            "import unittest\n\n"
            "from svc.tokens import tokens_match\n\n\n"
            "class TestTokens(unittest.TestCase):\n"
            "    def test_equal_tokens_match(self):\n"
            '        self.assertTrue(tokens_match("abc", "abc"))\n'
        ),
        extra_requirements=(),
    )
    workspace = materialise_repo("no_manifest", request, with_base=False)

    result = await RUNNER.execute(tree=workspace.head_tree, request=request)

    assert result.exit_code == 0, result.stdout + result.stderr


async def test_a_third_party_import_without_a_manifest_is_inconclusive(
    materialise_repo: Any,
) -> None:
    """E8's unhappy half: ``import requests`` with nothing installed proves nothing.

    The recorded generation asks for ``requests`` in ``extra_requirements``, and a tree with no
    manifest has no way to provide it — so ``deps_install_ok`` is false and the ceiling is
    ``inconclusive`` however the head run happens to exit on this host.
    """
    request = make_request("proof_generator_import_error")
    workspace = materialise_repo("no_manifest", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=NullInstaller(),
    )

    assert outcome.deps_install_ok is False
    assert outcome.status == "inconclusive"
    assert outcome.status != "proven"


def test_the_corpus_agrees_that_a_missing_manifest_is_inconclusive() -> None:
    case = proof_case("inconclusive_import_error_without_deps")
    assert case["deps_ok"] is False
    assert case["expected_proof_status"] == "inconclusive"
    assert case["edge_cases"] == ["E8", "E10"]


# ---------------------------------------------------------------------------------------
# The stage's contract: proof never fails a run
# ---------------------------------------------------------------------------------------


class ExplodingRunner:
    """A sandbox that fails in a way nobody predicted, which is the interesting kind."""

    @property
    def name(self) -> str:
        return "subprocess"

    @property
    def isolation(self) -> str:
        return "degraded"

    async def execute(
        self, *, tree: Path, request: ProofRequest, python_executable: str | None = None
    ) -> RunResult:
        raise RuntimeError("the sandbox went sideways")


async def test_a_runner_that_raises_degrades_instead_of_failing_the_run(
    materialise_repo: Any,
) -> None:
    """§4.1 S7: "degrading on: everything. Proof never fails a run.""" ""
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=ExplodingRunner(),  # type: ignore[arg-type]
        policy=POLICY,
        installer=NullInstaller(),
    )

    assert outcome.status == "inconclusive"
    assert outcome.outcome == "error"
    assert "went sideways" in outcome.detail


async def test_an_installer_that_raises_degrades_too(materialise_repo: Any) -> None:
    class ExplodingInstaller:
        async def install(self, *, tree: Path, requirements: Requirements) -> Any:
            raise OSError("no disk left")

    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=RUNNER,
        policy=POLICY,
        installer=ExplodingInstaller(),
    )

    assert outcome.status == "inconclusive"
    assert outcome.status != "proven"


@pytest.mark.parametrize("detail", ["boom", ""])
def test_an_errored_outcome_is_never_blocking(detail: str) -> None:
    finding = apply_outcome(make_finding(status="published"), errored_outcome(RUNNER, detail))
    assert finding.proof_status == "inconclusive"
    assert finding.blocking is False
