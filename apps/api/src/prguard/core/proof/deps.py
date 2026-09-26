"""Dependency discovery and installation for a proof workspace — §4.6, E8, E10.

The rule this module exists to make true: **an install failure can never produce a `proven`
finding** (E10). It reports one boolean, ``InstallResult.ok``, and the classifier treats a
``False`` as fatal to the proof regardless of how convincing the head failure looked.

``ok`` is not "the install command exited 0" — it is "everything the repro needs is present".
The two differ in the case §7 E8 is about: a tree with no manifest at all, where nothing is
installed and nothing failed, but the generated repro asked for ``requests``. Nothing failed
and the dependency is still missing, so ``ok`` is ``False`` and the verdict is capped at
``inconclusive``.

**Why there is no `uv pip install -e .`.** §4.6 offers it as the manifest branch, but a proof
workspace puts the tree root on ``PYTHONPATH`` instead (the fixture repos' ``app``/``svc`` are
top-level packages). An editable install would need a build backend and therefore a network,
which would make every offline proof fail the install step it does not need.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import tomllib
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Protocol

#: Manifests §7 E8 names, in the order they are consulted.
MANIFEST_FILES: Final[tuple[str, ...]] = (
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
)

#: Default virtualenv directory inside the workspace. Dotted so pytest never collects it.
VENV_DIR: Final[str] = ".prguard_venv"


@dataclass(frozen=True)
class Requirements:
    """What a repro needs before it can run, and where we learnt it."""

    packages: tuple[str, ...] = ()
    manifest: str | None = None
    requirements_file: str | None = None

    @property
    def needed(self) -> bool:
        """Whether anything has to be installed at all."""
        return bool(self.packages) or self.requirements_file is not None

    @property
    def has_manifest(self) -> bool:
        """E8: a tree with no manifest is run against the standard library alone."""
        return self.manifest is not None


@dataclass(frozen=True)
class InstallResult:
    """The outcome of the install step. ``ok=False`` caps the proof at ``inconclusive`` (E10)."""

    ok: bool
    performed: bool
    detail: str
    python_executable: str | None = None
    output: str = ""


class DependencyInstaller(Protocol):
    """The seam between "what the repro needs" and "how this environment provides it"."""

    async def install(self, *, tree: Path, requirements: Requirements) -> InstallResult:
        """Make ``requirements`` available inside ``tree``. Never raises."""
        ...


def discover_requirements(tree: Path, *, extra: Sequence[str] = ()) -> Requirements:
    """Read the tree's manifest and combine it with the generation's ``extra_requirements``.

    ``setup.py``/``setup.cfg`` count as a manifest but yield no packages: reading their
    dependencies means executing or parsing arbitrary code, and the workspace's ``PYTHONPATH``
    already makes the project itself importable. If such a tree's repro really needs a
    third-party package, the generation has to say so in ``extra_requirements``.
    """
    manifest = next((name for name in MANIFEST_FILES if (tree / name).is_file()), None)
    packages: list[str] = []
    requirements_file: str | None = None

    if manifest == "requirements.txt":
        requirements_file = manifest
        packages.extend(_parse_requirements_txt(tree / manifest))
    elif manifest == "pyproject.toml":
        packages.extend(_parse_pyproject(tree / manifest))

    packages.extend(item.strip() for item in extra if item.strip())
    return Requirements(
        packages=_dedupe(packages),
        manifest=manifest,
        requirements_file=requirements_file,
    )


class NullInstaller:
    """Installs nothing, and says so honestly.

    The default for every offline path: with no third-party requirement there is nothing to do
    and ``ok`` is ``True``; with one, the dependency is genuinely absent and ``ok`` is ``False``,
    which is E8's ``inconclusive`` rather than a pretend success.
    """

    async def install(self, *, tree: Path, requirements: Requirements) -> InstallResult:
        if not requirements.needed:
            return InstallResult(
                ok=True,
                performed=False,
                detail="nothing to install: the repro needs only the standard library",
            )
        return InstallResult(
            ok=False,
            performed=False,
            detail=(
                "dependencies were required but no installer is configured: "
                f"{', '.join(requirements.packages)}"
            ),
        )


@dataclass(frozen=True)
class UvInstaller:
    """`uv venv && uv pip install …` (§4.6), shelled out to, with a hard timeout.

    ``--system-site-packages`` is deliberate on the subprocess path: that runner is already
    recorded as ``isolation="degraded"``, and a bare virtualenv would not contain the test
    runner itself, so a proof needing one dependency would fail on ``pytest`` rather than on
    the finding. Inside Docker the image supplies both and the flag is not used.

    ``extra_args`` exists so a test can pin the real subprocess path without a network
    (``--no-index`` makes an unresolvable pin fail in milliseconds, exactly as E10 requires).
    """

    timeout_seconds: int = 180
    uv_executable: str = "uv"
    venv_dir: str = VENV_DIR
    system_site_packages: bool = True
    extra_args: tuple[str, ...] = field(default=())

    def venv_command(self) -> list[str]:
        """The argv for creating the workspace virtualenv."""
        command = [self.uv_executable, "venv", self.venv_dir]
        if self.system_site_packages:
            command.append("--system-site-packages")
        return command

    def install_command(self, requirements: Requirements) -> list[str]:
        """The argv for installing ``requirements`` into the workspace virtualenv."""
        command = [
            self.uv_executable,
            "pip",
            "install",
            "--python",
            self.python_path(),
            *self.extra_args,
        ]
        if requirements.requirements_file is not None:
            command.extend(["-r", requirements.requirements_file])
        command.extend(requirements.packages if requirements.requirements_file is None else [])
        return command

    def python_path(self) -> str:
        """Where ``uv venv`` puts the interpreter, relative to the workspace."""
        return f"{self.venv_dir}/bin/python"

    async def install(self, *, tree: Path, requirements: Requirements) -> InstallResult:
        if not requirements.needed:
            return InstallResult(
                ok=True,
                performed=False,
                detail="nothing to install: the repro needs only the standard library",
            )
        return await asyncio.to_thread(self._install, tree, requirements)

    def _install(self, tree: Path, requirements: Requirements) -> InstallResult:
        venv = self._run(self.venv_command(), tree)
        if venv is None or venv.returncode != 0:
            return InstallResult(
                ok=False,
                performed=True,
                detail="could not create the workspace virtualenv",
                output=_output_of(venv),
            )
        install = self._run(self.install_command(requirements), tree)
        if install is None or install.returncode != 0:
            return InstallResult(
                ok=False,
                performed=True,
                detail=(
                    "dependency install failed; continuing without deps "
                    "(E10: the proof is capped at inconclusive)"
                ),
                output=_output_of(install),
            )
        return InstallResult(
            ok=True,
            performed=True,
            detail=f"installed {len(requirements.packages)} requirement(s)",
            python_executable=str(tree / self.python_path()),
            output=_output_of(install),
        )

    def _run(self, command: list[str], tree: Path) -> subprocess.CompletedProcess[str] | None:
        """One `uv` invocation. Returns ``None`` when it could not be started or timed out."""
        try:
            return subprocess.run(  # noqa: S603 - fixed argv, no shell
                command,
                cwd=str(tree),
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                env=install_env(tree),
            )
        except (OSError, subprocess.SubprocessError):
            return None


def install_env(tree: Path) -> dict[str, str]:
    """The environment an installer runs in — scrubbed, with the workspace as ``HOME``."""
    keep = ("PATH", "SSL_CERT_FILE", "SSL_CERT_DIR", "UV_CACHE_DIR")
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env["HOME"] = str(tree)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["VIRTUAL_ENV"] = ""
    return env


def _parse_requirements_txt(path: Path) -> list[str]:
    """Requirement lines only: comments, blanks and pip flags are not packages."""
    packages: list[str] = []
    for raw in _read(path).splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        packages.append(line)
    return packages


def _parse_pyproject(path: Path) -> list[str]:
    """``[project].dependencies`` only. A project declaring none needs no install at all."""
    try:
        document = tomllib.loads(_read(path))
    except tomllib.TOMLDecodeError:
        return []
    project = document.get("project")
    if not isinstance(project, dict):
        return []
    dependencies = project.get("dependencies")
    if not isinstance(dependencies, list):
        return []
    return [str(item).strip() for item in dependencies if str(item).strip()]


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _dedupe(packages: Sequence[str]) -> tuple[str, ...]:
    seen: dict[str, None] = {}
    for package in packages:
        seen.setdefault(package, None)
    return tuple(seen)


def _output_of(completed: subprocess.CompletedProcess[str] | None) -> str:
    if completed is None:
        return "the installer could not be started or exceeded DEP_INSTALL_TIMEOUT"
    return completed.stdout + completed.stderr
