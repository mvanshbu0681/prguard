"""The isolated sandbox — §4.6's `docker run` flags, §11.2 assumption 8's "no SDK".

The daemon is stopped on this machine (X7) and AC-10..AC-13 deliberately do not need it, so the
live test at the bottom carries ``@pytest.mark.requires_docker`` and is deselected by default
(§9.5). Everything above it runs offline, because the *command* is the isolation guarantee:
``--network none`` is what makes running model-written code defensible, and a flag that quietly
stopped being passed would look exactly like a flag that was still being passed.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import pytest

from prguard.core.proof.docker_runner import DEFAULT_IMAGE, MOUNT_POINT, DockerRunner
from prguard.core.proof.runner import DockerProbe, SandboxRunner
from prguard.core.proof.subprocess_runner import SPAWN_FAILURE_EXIT_CODE, SubprocessRunner
from tests.proof.conftest import TEST_TIMEOUT_SECONDS, make_request

RUNNER = DockerRunner(timeout_seconds=TEST_TIMEOUT_SECONDS)
REQUEST = make_request("proof_generator_billing_none_rate")


def flag_value(command: list[str], flag: str) -> str:
    return command[command.index(flag) + 1]


def test_both_runners_satisfy_the_sandbox_protocol() -> None:
    """Structural typing checked by mypy; the assignment is what makes it a compile-time test."""
    runners: list[SandboxRunner] = [DockerRunner(), SubprocessRunner()]
    assert [runner.name for runner in runners] == ["docker", "subprocess"]
    assert [runner.isolation for runner in runners] == ["isolated", "degraded"]


def test_the_command_carries_every_isolation_flag_the_spec_names(tmp_path: Path) -> None:
    """§4.6: ``--network none --memory 1g --cpus 1 --pids-limit 256``, ``python:3.12-slim``."""
    command = RUNNER.command(tree=tmp_path, request=REQUEST)

    assert command[:3] == ["docker", "run", "--rm"]
    assert flag_value(command, "--network") == "none"
    assert flag_value(command, "--memory") == "1g"
    assert flag_value(command, "--cpus") == "1"
    assert flag_value(command, "--pids-limit") == "256"
    assert DEFAULT_IMAGE in command
    assert DEFAULT_IMAGE == "python:3.12-slim"


def test_the_workspace_is_mounted_and_is_the_working_directory(tmp_path: Path) -> None:
    request = make_request("proof_generator_billing_none_rate")
    command = RUNNER.command(tree=tmp_path, request=request)

    assert flag_value(command, "--volume") == f"{tmp_path}:{MOUNT_POINT}:rw"
    assert flag_value(command, "--workdir") == MOUNT_POINT
    assert f"PYTHONPATH={MOUNT_POINT}" in command


def test_the_test_command_matches_the_local_runners(tmp_path: Path) -> None:
    """Both sandboxes must run the same repro the same way, or the two are not comparable."""
    request = make_request("proof_generator_billing_none_rate")
    docker = RUNNER.command(tree=tmp_path, request=request)
    local = SubprocessRunner().command(request, python_executable="python")

    assert docker[-7:] == ["python", "-m", "pytest", request.test_file_path, "-q", "-p",
                           "no:cacheprovider"]
    assert docker[-7:] == local


def test_the_container_has_a_unique_name_so_a_timeout_can_kill_it(tmp_path: Path) -> None:
    """E11's container half: ``--rm`` alone leaves nothing to ``docker kill``."""
    request = make_request("proof_generator_billing_none_rate")
    first = flag_value(RUNNER.command(tree=tmp_path, request=request), "--name")
    second = flag_value(RUNNER.command(tree=tmp_path, request=request), "--name")

    assert first.startswith("prguard-proof-")
    assert first != second


def test_the_image_and_limits_are_configurable(tmp_path: Path) -> None:
    """§4.8: nothing about the sandbox is a literal at a call site."""
    runner = DockerRunner(image="python:3.13-slim", memory="512m", cpus="2", pids_limit=64)
    command = runner.command(tree=tmp_path, request=REQUEST)

    assert "python:3.13-slim" in command
    assert flag_value(command, "--memory") == "512m"
    assert flag_value(command, "--cpus") == "2"
    assert flag_value(command, "--pids-limit") == "64"


async def test_a_missing_docker_binary_is_a_run_result_not_an_exception(tmp_path: Path) -> None:
    """Every sandbox failure is a ``RunResult``: the classifier reads it as ``error``, advisory."""
    runner = DockerRunner(docker_executable="prguard-no-such-docker-binary")
    result = await runner.execute(
        tree=tmp_path, request=make_request("proof_generator_billing_none_rate")
    )

    assert result.exit_code == SPAWN_FAILURE_EXIT_CODE
    assert "could not start the container" in result.stderr


def test_docker_is_recorded_as_isolated_and_says_which_image_was_used(tmp_path: Path) -> None:
    assert RUNNER.name == "docker"
    assert RUNNER.isolation == "isolated"


# ---------------------------------------------------------------------------------------
# The live path — deselected by default (§9.5), and not needed by any AC
# ---------------------------------------------------------------------------------------


@pytest.mark.requires_docker
@pytest.mark.skipif(shutil.which("docker") is None, reason="no docker CLI on this machine")
async def test_a_live_container_proves_the_seeded_bug(materialise_repo: Any) -> None:
    """The same AC-10 scenario, in a real network-less container.

    Exists so the isolated path is not theoretical, and is deselected tonight: X7 records the
    daemon as stopped, and R1 is explicit that with Docker down nothing is lost but a label.
    """
    if not DockerProbe().available():
        pytest.skip("the Docker daemon is not running")

    from prguard.core.proof.deps import NullInstaller
    from prguard.core.proof.runner import ProofPolicy, run_proof

    request = make_request("proof_generator_billing_none_rate", timeout_seconds=120)
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=DockerRunner(timeout_seconds=120),
        policy=ProofPolicy(timeout_seconds=120),
        installer=NullInstaller(),
    )

    assert outcome.status == "proven"
    assert outcome.runner == "docker"
    assert outcome.isolation == "isolated"
