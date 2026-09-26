"""Sandbox selection when Docker is not there — AC-13, E14, spec X7.

The Docker daemon is stopped on this machine and VERIFY has to be green anyway (§9 condition 1),
so "degrades, never crashes" is not a resilience nicety here — it is the default path. Two rungs
below Docker, both of them tested:

1. ``PROOF_ALLOW_SUBPROCESS=true`` (the default) → the local runner, ``isolation="degraded"``,
   ``degradations:["sandbox_degraded"]``. Proofs still run. AC-10 and AC-11 are proved on it.
2. ``PROOF_ALLOW_SUBPROCESS=false`` → nothing executes, every proof is ``skipped_no_env``, and
   the gate concludes ``neutral``.

The line that must never bend: **a missing sandbox can never turn a gate red.** "We could not
check" is not "we found a problem", and a product that confuses them is one that gets turned off.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

from prguard.config import Settings
from prguard.core.delivery import gate
from prguard.core.proof.deps import NullInstaller
from prguard.core.proof.docker_runner import DockerRunner
from prguard.core.proof.runner import (
    DEGRADATION_NO_SANDBOX,
    DEGRADATION_SANDBOX_DEGRADED,
    DOCKER_INFO_COMMAND,
    DockerProbe,
    ProofPolicy,
    docker_available,
    run_proof,
    select_runner,
    skipped_outcome,
)
from prguard.core.proof.subprocess_runner import SubprocessRunner
from tests.proof.conftest import TEST_TIMEOUT_SECONDS, make_request

SRC = Path(__file__).resolve().parents[2] / "src"

#: A probe that really shells out and really fails, with no daemon involved either way.
DAEMON_DOWN = (sys.executable, "-c", "raise SystemExit(1)")

#: The same, succeeding — so the Docker branch is exercised without needing Docker.
DAEMON_UP = (sys.executable, "-c", "")


def probe(command: tuple[str, ...], **kwargs: Any) -> DockerProbe:
    return DockerProbe(command=command, **kwargs)


# ---------------------------------------------------------------------------------------
# AC-13, first half
# ---------------------------------------------------------------------------------------


def test_docker_unavailable_falls_back_to_subprocess() -> None:
    """AC-13: probe fails → `runner="subprocess"`, `isolation="degraded"`, and it says so."""
    selection = select_runner(ProofPolicy(), probe=probe(DAEMON_DOWN))

    assert selection.available
    assert selection.runner is not None
    assert selection.runner.name == "subprocess"
    assert selection.runner.isolation == "degraded"
    assert selection.degradations == (DEGRADATION_SANDBOX_DEGRADED,)
    assert "docker unavailable" in selection.reason


def test_docker_available_is_preferred_and_is_not_degraded() -> None:
    """The other branch, so the fallback is a fallback and not the only path that works."""
    selection = select_runner(ProofPolicy(), probe=probe(DAEMON_UP))

    assert selection.runner is not None
    assert selection.runner.name == "docker"
    assert selection.runner.isolation == "isolated"
    assert selection.degradations == ()


def test_the_chosen_runners_are_the_real_ones() -> None:
    """Selection returns the concrete runners, not a marker a later stage has to interpret."""
    assert isinstance(select_runner(ProofPolicy(), probe=probe(DAEMON_UP)).runner, DockerRunner)
    down = select_runner(ProofPolicy(), probe=probe(DAEMON_DOWN)).runner
    assert isinstance(down, SubprocessRunner)


def test_the_policys_timeout_reaches_the_runner() -> None:
    """``PROOF_TIMEOUT`` is config (§4.8); neither runner may carry its own idea of it."""
    policy = ProofPolicy(timeout_seconds=7)
    docker = select_runner(policy, probe=probe(DAEMON_UP)).runner
    local = select_runner(policy, probe=probe(DAEMON_DOWN)).runner
    assert isinstance(docker, DockerRunner) and docker.timeout_seconds == 7
    assert isinstance(local, SubprocessRunner) and local.timeout_seconds == 7


async def test_a_degraded_sandbox_still_proves_things(materialise_repo: Any) -> None:
    """The point of the fallback: with the daemon down, AC-10's proof still happens."""
    selection = select_runner(
        ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS), probe=probe(DAEMON_DOWN)
    )
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=selection.runner,
        policy=ProofPolicy(timeout_seconds=TEST_TIMEOUT_SECONDS),
        installer=NullInstaller(),
    )

    assert outcome.status == "proven"
    assert outcome.runner == "subprocess"
    assert outcome.isolation == "degraded"


# ---------------------------------------------------------------------------------------
# AC-13, second half — no sandbox at all
# ---------------------------------------------------------------------------------------


def test_no_sandbox_yields_neutral_gate() -> None:
    """AC-13: `PROOF_ALLOW_SUBPROCESS=false` with no daemon → nothing runs, gate is `neutral`."""
    policy = ProofPolicy(allow_subprocess=False)
    selection = select_runner(policy, probe=probe(DAEMON_DOWN))

    assert selection.runner is None
    assert selection.available is False
    assert selection.degradations == (DEGRADATION_NO_SANDBOX,)
    assert selection.reason == "no sandbox available — nothing could be proven"

    conclusion = gate.conclude(
        blocking_finding_ids=[], degraded=False, all_proofs_skipped_for_env=True
    )
    assert conclusion == "neutral"


def test_every_proof_is_skipped_no_env_when_there_is_no_sandbox() -> None:
    """The corpus's ``not_attempted_no_sandbox`` row: status `not_attempted`, outcome
    `skipped_no_env`. §4.6 writes it as "`not_attempted` (`skipped_no_env`)" — one is the
    verdict, the other is what the artifact records about why there is no verdict."""
    outcome = skipped_outcome()

    assert outcome.status == "not_attempted"
    assert outcome.outcome == "skipped_no_env"
    assert outcome.baseline_mode == "skipped"
    assert outcome.base is None
    assert outcome.head is None
    assert "No sandbox" in outcome.detail


def test_a_skipped_proof_never_claims_the_sandbox_it_did_not_get() -> None:
    """E14: the artifact may not say ``docker``/``isolated`` about a proof that never ran.

    §5.1 makes both columns non-nullable, so something has to be written; what is written is the
    runner we *would* have used and the isolation it *would* have had, because claiming the
    container we never started is the one answer that would make a reader trust this row. The
    columns are read straight back out by ``/result`` and by the accuracy self-report, and an
    unrun proof that reads ``isolated`` is indistinguishable there from a real one.
    """
    outcome = skipped_outcome()

    assert outcome.runner == "subprocess"
    assert outcome.isolation == "degraded"
    assert outcome.status == "not_attempted"


async def test_run_proof_with_no_runner_executes_nothing(materialise_repo: Any) -> None:
    """Belt and braces: the top-level entry point must also refuse to pretend."""
    request = make_request("proof_generator_billing_none_rate")
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request, workspace=workspace, runner=None, installer=NullInstaller()
    )

    assert outcome.status == "not_attempted"
    assert outcome.outcome == "skipped_no_env"


@pytest.mark.parametrize("degraded", [True, False])
def test_a_missing_sandbox_can_never_turn_a_gate_red(degraded: bool) -> None:
    """The load-bearing sentence of §8.1: "a missing sandbox can never turn a gate red".

    With no blocking finding, no combination of degradations may reach ``failure`` — the only
    input that can is a finding that ``severity.is_blocking`` approved, and that needs a proof.
    """
    conclusion = gate.conclude(
        blocking_finding_ids=[], degraded=degraded, all_proofs_skipped_for_env=True
    )
    assert conclusion != "failure"


# ---------------------------------------------------------------------------------------
# The probe itself
# ---------------------------------------------------------------------------------------


def test_the_probe_shells_out_to_the_docker_cli() -> None:
    """§11.2 assumption 8: the `docker` CLI, not the Python SDK."""
    assert DOCKER_INFO_COMMAND[:2] == ("docker", "info")
    assert DockerProbe().command == DOCKER_INFO_COMMAND


def test_no_module_under_src_imports_the_docker_sdk() -> None:
    """The dependency list is frozen (plan §9.3 rule 1) and the SDK is deliberately absent.

    Cheap to check, and it is the governance claim made executable — the same trick as the
    `"APPROVE"` guard in delivery.
    """
    offenders = [
        path.relative_to(SRC).as_posix()
        for path in SRC.rglob("*.py")
        if "import docker" in path.read_text(encoding="utf-8")
        or "from docker" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []


def test_the_probe_answer_is_cached_for_sixty_seconds() -> None:
    """§4.6: cached 60 s. A probe per proof would spawn a process per finding."""
    daemon = probe(DAEMON_DOWN, cache_seconds=60.0)

    assert daemon.available(now=1000.0) is False
    assert daemon.available(now=1030.0) is False
    assert daemon.probes == 1

    assert daemon.available(now=1061.0) is False
    assert daemon.probes == 2


def test_resetting_the_probe_forces_a_fresh_answer() -> None:
    """A worker that lives for hours has to be able to notice Docker coming up."""
    daemon = probe(DAEMON_DOWN)
    daemon.available(now=1000.0)
    daemon.reset()
    daemon.available(now=1000.0)
    assert daemon.probes == 2


def test_a_probe_whose_binary_is_missing_is_a_false_not_a_crash() -> None:
    """The machine may have no `docker` at all. That is a degradation, not an exception."""
    assert probe(("prguard-no-such-docker-binary", "info")).available() is False


def test_a_probe_that_hangs_is_treated_as_unavailable() -> None:
    """A wedged daemon socket must cost the run its timeout, not its life."""
    hanging = probe(
        (sys.executable, "-c", "import time; time.sleep(30)"), timeout_seconds=0.5
    )
    assert hanging.available() is False


async def test_docker_available_is_awaitable() -> None:
    """The worker calls this from an event loop; a 5 s blocking probe would stall every task."""
    assert await docker_available(probe(DAEMON_DOWN)) is False
    assert await docker_available(probe(DAEMON_UP)) is True


# ---------------------------------------------------------------------------------------
# Policy comes from config, not from constants scattered over the module
# ---------------------------------------------------------------------------------------


def test_policy_is_read_from_settings() -> None:
    """§4.8: every proof knob is env-overridable, and none of them is hardcoded downstream."""
    settings = Settings(
        PROOF_TIMEOUT=11,
        DEP_INSTALL_TIMEOUT=22,
        PROOF_OUTPUT_MAX_BYTES=33,
        PROOF_REQUIRE_BASELINE=False,
        PROOF_ALLOW_SUBPROCESS=False,
        PROOF_MIN_SCORE=0.44,
        PROOF_MAX_PER_RUN=5,
        BLOCK_MIN_SEVERITY="critical",
    )
    policy = ProofPolicy.from_settings(settings)

    assert policy.timeout_seconds == 11
    assert policy.dep_install_timeout == 22
    assert policy.output_max_bytes == 33
    assert policy.require_baseline is False
    assert policy.allow_subprocess is False
    assert policy.min_score == pytest.approx(0.44)
    assert policy.max_per_run == 5
    assert policy.block_min_severity == "critical"


def test_policy_defaults_match_the_spec() -> None:
    """§11.2 assumption 7: 3 proofs, 0.35, 90 s, 180 s, 20 KB, baseline required."""
    policy = ProofPolicy()
    assert (policy.max_per_run, policy.min_score) == (3, 0.35)
    assert (policy.timeout_seconds, policy.dep_install_timeout) == (90, 180)
    assert policy.output_max_bytes == 20_000
    assert policy.require_baseline is True
    assert policy.allow_subprocess is True
