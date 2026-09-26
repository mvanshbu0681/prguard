"""The isolated sandbox — `docker run`, shelled out to, with no Python SDK (§4.6, §11.2 #8).

The docker SDK is deliberately not a dependency (spec §11.2 assumption 8, plan §9.3 rule 1): it
pins a client version against a daemon we do not control, and everything needed here is four
flags on a CLI that is already installed. So this module builds an argv and runs it.

The flags are the spec's, and each one is load-bearing:

* ``--network none`` — generated code never reaches the internet. This is the difference
  between "we ran a test" and "we ran whatever a model wrote, online".
* ``--memory 1g --cpus 1 --pids-limit 256`` — a runaway repro costs one container, not the host.
* ``--rm`` plus a known ``--name`` so E11's timeout can ``docker kill`` the container rather
  than orphaning it.
* ``-v <ws>:/ws:rw -w /ws`` with ``PYTHONPATH=/ws`` — the same "tree root on the path, nothing
  installed" rule the local runner uses, so the two runners execute the same repro the same way.

Its live tests carry ``@pytest.mark.requires_docker`` and are deselected by default (§9.5): the
daemon is down on this machine and AC-10..AC-13 do not need it. What *is* tested offline is the
command this module builds, because the flags are the isolation guarantee.
"""

from __future__ import annotations

import asyncio
import subprocess
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from prguard.core.proof.subprocess_runner import (
    PYTEST_ARGS,
    SPAWN_FAILURE_EXIT_CODE,
    TIMEOUT_EXIT_CODE,
)
from prguard.core.types import ProofIsolation, ProofRequest, ProofRunner, RunResult

#: The base the sandbox is built from. Spec §4.6 / §11.2 assumption 8.
BASE_IMAGE: Final[str] = "python:3.12-slim"

#: The image a repro actually runs in.
#:
#: It cannot be ``python:3.12-slim`` itself. That image has no pytest, and the run is
#: ``--network none`` on purpose, so nothing can be installed once the container is up --
#: every repro failed with "No module named pytest" at *both* refs, which reads as
#: "the test fails at base too" and correctly but uselessly classifies as `inconclusive`.
#: The framework therefore has to be in the image before the network is taken away.
#: Building has network; running does not. Built once, lazily, then reused.
DEFAULT_IMAGE: Final[str] = "prguard-sandbox:py312"

#: Kept deliberately tiny: a test framework and nothing else. Anything a repro needs beyond
#: the standard library is the installer's job (§4.6, E8/E10), not the image's.
SANDBOX_DOCKERFILE: Final[str] = f"""\
FROM {BASE_IMAGE}
RUN pip install --no-cache-dir pytest>=8.0
"""

#: How long the one-time image build may take.
BUILD_TIMEOUT_SECONDS: Final[float] = 300.0

#: Where the workspace is mounted inside the container.
MOUNT_POINT: Final[str] = "/ws"

#: Container-name prefix, so a timed-out container is identifiable and killable.
CONTAINER_PREFIX: Final[str] = "prguard-proof-"

#: How long `docker kill` itself may take before we give up on being tidy.
KILL_TIMEOUT_SECONDS: Final[float] = 10.0


@dataclass(frozen=True)
class DockerRunner:
    """Runs a repro in a network-less container. Satisfies ``runner.SandboxRunner``."""

    image: str = DEFAULT_IMAGE
    memory: str = "1g"
    cpus: str = "1"
    pids_limit: int = 256
    timeout_seconds: int = 90
    docker_executable: str = "docker"

    @property
    def name(self) -> ProofRunner:
        return "docker"

    @property
    def isolation(self) -> ProofIsolation:
        return "isolated"

    def command(
        self, *, tree: Path, request: ProofRequest, container_name: str | None = None
    ) -> list[str]:
        """The full `docker run` argv for one repro execution (§4.6)."""
        return [
            self.docker_executable,
            "run",
            "--rm",
            "--name",
            container_name or self.container_name(),
            "--network",
            "none",
            "--memory",
            self.memory,
            "--cpus",
            self.cpus,
            "--pids-limit",
            str(self.pids_limit),
            "--env",
            f"PYTHONPATH={MOUNT_POINT}",
            "--env",
            "PYTHONDONTWRITEBYTECODE=1",
            "--env",
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD=1",
            "--volume",
            f"{tree}:{MOUNT_POINT}:rw",
            "--workdir",
            MOUNT_POINT,
            self.image,
            "python",
            "-m",
            "pytest",
            request.test_file_path,
            *PYTEST_ARGS,
        ]

    def container_name(self) -> str:
        """A unique, greppable container name. Concurrent proofs must not collide."""
        return f"{CONTAINER_PREFIX}{uuid.uuid4().hex[:12]}"

    async def execute(
        self,
        *,
        tree: Path,
        request: ProofRequest,
        python_executable: str | None = None,
    ) -> RunResult:
        """Execute the repro in a container. Never raises.

        ``python_executable`` is ignored: the container supplies its own interpreter, which is
        the point of using one. The parameter exists because both runners answer to the same
        protocol and the caller should not have to know which it got.
        """
        return await asyncio.to_thread(self._execute, tree, request)

    def ensure_image(self) -> str | None:
        """Build the sandbox image if it is not present yet. Returns an error, or None.

        Idempotent and cheap after the first call: `docker image inspect` is a local
        lookup. The build is the one step in the proof path that needs a network, and it
        happens here rather than inside the run so the run itself stays `--network none`.
        """
        try:
            inspect = subprocess.run(  # noqa: S603 - fixed argv, no shell
                [self.docker_executable, "image", "inspect", self.image],
                capture_output=True,
                text=True,
            )
            if inspect.returncode == 0:
                return None

            build = subprocess.run(  # noqa: S603 - fixed argv, no shell
                [self.docker_executable, "build", "-t", self.image, "-"],
                input=SANDBOX_DOCKERFILE,
                capture_output=True,
                text=True,
                timeout=BUILD_TIMEOUT_SECONDS,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            # No docker binary, no daemon, or a build that overran. Every one of these is a
            # string for the caller to turn into a RunResult -- `execute` never raises.
            return f"{type(exc).__name__}: {exc}"[:500]

        if build.returncode != 0:
            return (build.stderr or build.stdout or "docker build failed").strip()[:500]
        return None

    def _execute(self, tree: Path, request: ProofRequest) -> RunResult:
        started_build = time.monotonic()
        build_error = self.ensure_image()
        if build_error is not None:
            # An unbuildable sandbox is an environment failure, never a failing test:
            # classify() must not be able to read this as "the repro failed at head".
            return RunResult(
                exit_code=SPAWN_FAILURE_EXIT_CODE,
                stderr=f"could not prepare the sandbox image {self.image}: {build_error}",
                duration_ms=_elapsed_ms(started_build),
                command=f"{self.docker_executable} build -t {self.image} -",
            )

        container = self.container_name()
        command = self.command(tree=tree, request=request, container_name=container)
        timeout = request.timeout_seconds or self.timeout_seconds
        started = time.monotonic()
        try:
            completed = subprocess.run(  # noqa: S603 - fixed argv, no shell
                command, capture_output=True, text=True, timeout=timeout
            )
        except subprocess.TimeoutExpired as expired:
            self._kill(container)
            return RunResult(
                exit_code=TIMEOUT_EXIT_CODE,
                stdout=_as_text(expired.stdout),
                stderr=_as_text(expired.stderr)
                + f"\ndocker kill after {timeout}s (PROOF_TIMEOUT)\n",
                duration_ms=_elapsed_ms(started),
                timed_out=True,
                command=" ".join(command),
            )
        except (OSError, subprocess.SubprocessError) as exc:
            return RunResult(
                exit_code=SPAWN_FAILURE_EXIT_CODE,
                stderr=f"could not start the container: {exc}",
                duration_ms=_elapsed_ms(started),
                command=" ".join(command),
            )
        return RunResult(
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            duration_ms=_elapsed_ms(started),
            command=" ".join(command),
        )

    def _kill(self, container: str) -> None:
        """E11's container half: stop paying for a repro that will not finish."""
        try:
            subprocess.run(  # noqa: S603 - fixed argv, no shell
                [self.docker_executable, "kill", container],
                capture_output=True,
                text=True,
                timeout=KILL_TIMEOUT_SECONDS,
            )
        except (OSError, subprocess.SubprocessError):
            return


def _as_text(stream: bytes | str | None) -> str:
    if stream is None:
        return ""
    if isinstance(stream, bytes):
        return stream.decode("utf-8", errors="replace")
    return stream


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
