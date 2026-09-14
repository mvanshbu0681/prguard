"""The local, resource-limited sandbox — §4.6's fallback, and E14's reality on this machine.

The Docker daemon is not running here (spec X7), so this is the runner that actually executes
tonight's proofs. It is honest about what it is: ``isolation="degraded"`` is recorded on every
artifact it produces and surfaced through the API, because a process with rlimits is not a
container with no network.

What it does provide:

* **A disposable cwd.** Every run happens inside a materialised workspace that is deleted
  afterwards, so a repro that writes files cannot touch the repository under review.
* **A scrubbed environment.** An explicit allow-list, not the parent's environment minus a few
  keys — ``ANTHROPIC_API_KEY`` and ``GITHUB_TOKEN`` are never visible to generated code, and
  ``PYTEST_DISABLE_PLUGIN_AUTOLOAD`` keeps whatever plugins the host happens to have out of the
  result.
* **rlimits** on CPU time, address space and open files, applied best-effort in the child
  between fork and exec. Each is clamped to the inherited hard limit and skipped rather than
  raised if the platform refuses it — a sandbox that cannot start is worse than one that is
  merely degraded.
* **A process-group kill on timeout** (E11). ``start_new_session`` puts the child in its own
  group, so a repro that spawned children does not leave them behind holding the pipe open.
"""

from __future__ import annotations

import asyncio
import os
import resource
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from prguard.core.types import ProofIsolation, ProofRequest, ProofRunner, RunResult

#: Exit code recorded for a run killed at the timeout — the shell convention, and what
#: ``tests/fixtures/verify_corpus.py`` already uses for the same event.
TIMEOUT_EXIT_CODE: Final[int] = 124

#: Exit code recorded when the runner could not start the process at all.
SPAWN_FAILURE_EXIT_CODE: Final[int] = 127

#: Grace added to the wall-clock timeout before RLIMIT_CPU fires. CPU seconds are not wall
#: seconds: a sleeping repro must be killed by the timeout, not by the CPU limit.
CPU_LIMIT_GRACE_SECONDS: Final[int] = 5

#: Default address-space ceiling. Generous, because the ceiling is a runaway guard and not a
#: budget; a repro that legitimately needs more than this is not a repro.
DEFAULT_ADDRESS_SPACE_BYTES: Final[int] = 2 * 1024**3

#: Default open-file ceiling.
DEFAULT_MAX_OPEN_FILES: Final[int] = 512

#: Environment keys forwarded into the sandbox. Everything else is dropped.
FORWARDED_ENV_KEYS: Final[tuple[str, ...]] = ("PATH", "LANG", "LC_ALL", "SYSTEMROOT")

#: The §4.6 test command, minus the interpreter and the file.
PYTEST_ARGS: Final[tuple[str, ...]] = ("-q", "-p", "no:cacheprovider")


@dataclass(frozen=True)
class SubprocessRunner:
    """Runs a repro locally under rlimits. Satisfies ``runner.SandboxRunner``."""

    timeout_seconds: int = 90
    address_space_bytes: int | None = DEFAULT_ADDRESS_SPACE_BYTES
    max_open_files: int = DEFAULT_MAX_OPEN_FILES
    cpu_seconds: int | None = None

    @property
    def name(self) -> ProofRunner:
        return "subprocess"

    @property
    def isolation(self) -> ProofIsolation:
        """Always ``degraded``. This is the label E14 says must be recorded and surfaced."""
        return "degraded"

    def command(self, request: ProofRequest, *, python_executable: str | None = None) -> list[str]:
        """The §4.6 test command: ``pytest <file> -q -p no:cacheprovider``."""
        interpreter = python_executable or sys.executable
        return [interpreter, "-m", "pytest", request.test_file_path, *PYTEST_ARGS]

    async def execute(
        self,
        *,
        tree: Path,
        request: ProofRequest,
        python_executable: str | None = None,
    ) -> RunResult:
        """Execute the repro in ``tree``. Never raises — a broken sandbox is a ``RunResult``."""
        return await asyncio.to_thread(self._execute, tree, request, python_executable)

    def _execute(
        self, tree: Path, request: ProofRequest, python_executable: str | None
    ) -> RunResult:
        command = self.command(request, python_executable=python_executable)
        timeout = request.timeout_seconds or self.timeout_seconds
        env = sandbox_env(tree)
        started = time.monotonic()
        try:
            process = subprocess.Popen(  # noqa: S603 - fixed argv, no shell
                command,
                cwd=str(tree),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,
                preexec_fn=self._apply_limits,  # noqa: PLW1509 - the point of this runner
            )
        except OSError as exc:
            return RunResult(
                exit_code=SPAWN_FAILURE_EXIT_CODE,
                stderr=f"could not start the sandbox: {exc}",
                duration_ms=_elapsed_ms(started),
                command=" ".join(command),
            )

        timed_out = False
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            _kill_process_group(process)
            stdout, stderr = process.communicate()
            stderr = (stderr or "") + f"\nkilled after {timeout}s (PROOF_TIMEOUT)\n"

        return RunResult(
            exit_code=TIMEOUT_EXIT_CODE if timed_out else process.returncode,
            stdout=stdout or "",
            stderr=stderr or "",
            duration_ms=_elapsed_ms(started),
            timed_out=timed_out,
            command=" ".join(command),
        )

    def _apply_limits(self) -> None:  # pragma: no cover - runs in the forked child
        """Best-effort rlimits, between fork and exec. Must never raise: this is the child."""
        cpu = self.cpu_seconds
        if cpu is None:
            cpu = self.timeout_seconds + CPU_LIMIT_GRACE_SECONDS
        _set_limit(resource.RLIMIT_CPU, cpu)
        if self.address_space_bytes is not None:
            _set_limit(resource.RLIMIT_AS, self.address_space_bytes)
        _set_limit(resource.RLIMIT_NOFILE, self.max_open_files)


def sandbox_env(tree: Path) -> dict[str, str]:
    """The environment a repro sees: the tree importable, and nothing of ours.

    ``PYTHONPATH`` is how ``app``/``svc`` become importable without an install (§4.6, and the
    reason the fixture repos need no build backend). ``PYTEST_DISABLE_PLUGIN_AUTOLOAD`` makes
    the result independent of which plugins the host env happens to carry, which matters when
    the host env is the one running this very test suite.
    """
    env = {key: os.environ[key] for key in FORWARDED_ENV_KEYS if key in os.environ}
    env.update(
        {
            "HOME": str(tree),
            "TMPDIR": str(tree),
            "PYTHONPATH": str(tree),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONHASHSEED": "0",
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
            "NO_COLOR": "1",
            "PY_COLORS": "0",
            "CI": "1",
        }
    )
    return env


def _set_limit(which: int, value: int) -> None:  # pragma: no cover - forked child
    """Lower one rlimit to ``value``, never above the inherited hard limit, never raising."""
    try:
        soft, hard = resource.getrlimit(which)
    except (OSError, ValueError):
        return
    ceiling = value if hard == resource.RLIM_INFINITY else min(value, hard)
    if soft != resource.RLIM_INFINITY and soft <= ceiling:
        return
    try:
        resource.setrlimit(which, (ceiling, hard))
    except (OSError, ValueError):
        return


def _kill_process_group(process: subprocess.Popen[str]) -> None:
    """E11: kill the whole group, not just the child that stopped answering."""
    try:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    except (OSError, ProcessLookupError):
        process.kill()


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
