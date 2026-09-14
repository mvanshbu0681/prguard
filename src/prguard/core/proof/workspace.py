"""Materialising the two trees a proof compares — spec §4.6 "Execution".

A proof is a comparison, so it needs two working copies: the repository at the PR's base SHA
and at its head SHA, with the generated repro written into **both**. Where those copies come
from is the only part that varies — a GitHub tarball in production, a committed fixture tree
offline — so it sits behind :class:`WorkspaceSource` and everything downstream sees two
directories.

Two rules that are not negotiable:

* **The tree root goes on ``PYTHONPATH``, nothing is installed into site-packages.** The repos
  under review keep their packages (``app``, ``svc``) at the top level, and an editable install
  would need a build backend and a network for something a path entry already does.
* **The repro path is validated before anything is written.** ``test_file_path`` comes out of a
  model, so an absolute path or a ``..`` segment is not a strange edge case — it is the obvious
  thing to try if you can influence the generator's input (§3 Tier 3).
"""

from __future__ import annotations

import io
import shutil
import tarfile
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from types import TracebackType
from typing import Final, Protocol

import httpx

from prguard.core.types import ProofRequest

#: Where a generated repro is written, relative to the tree root (§4.6's sample path).
PROOF_DIR: Final[str] = ".prguard_proof"

#: Temp-directory prefix, so a leaked workspace is identifiable in `ls /tmp`.
WORKSPACE_PREFIX: Final[str] = "prguard-proof-"

#: GitHub's source archive endpoint (§4.6: "tarball download via the GitHub API").
TARBALL_PATH: Final[str] = "/repos/{owner}/{repo}/tarball/{ref}"


class WorkspaceError(Exception):
    """A workspace could not be materialised. Callers degrade; nothing here fails a run."""


class UnsafeReproPathError(WorkspaceError):
    """A generated ``test_file_path`` pointed outside the workspace."""


class WorkspaceSource(Protocol):
    """Where the bytes of a ref come from."""

    async def fetch(self, *, ref: str, destination: Path) -> None:
        """Populate ``destination`` with the repository tree at ``ref``."""
        ...


@dataclass(frozen=True)
class LocalPathSource:
    """A source backed by directories already on disk — the committed fixture repos (X12).

    ``trees`` maps a ref to the tree that represents it, so a test can hand the runner
    ``{"base": repo_tree("buggy_calc", "base"), "head": repo_tree("buggy_calc", "head")}`` and
    exercise the real execution path with no network and no clone.
    """

    trees: Mapping[str, Path]

    async def fetch(self, *, ref: str, destination: Path) -> None:
        tree = self.trees.get(ref)
        if tree is None:
            raise WorkspaceError(f"no local tree registered for ref {ref!r}")
        if not tree.is_dir():
            raise WorkspaceError(f"local tree for ref {ref!r} is not a directory: {tree}")
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copytree(tree, destination, dirs_exist_ok=True)


@dataclass(frozen=True)
class GitHubTarballSource:
    """Downloads ``/repos/{owner}/{repo}/tarball/{ref}`` and unpacks it (§4.6).

    GitHub wraps the tree in a single ``{owner}-{repo}-{sha}/`` directory; that prefix is
    stripped so ``destination`` is the repository root. Extraction uses tarfile's ``data``
    filter, which refuses absolute paths, parent traversal, links out of the tree and device
    nodes — an archive is untrusted input like any other.
    """

    client: httpx.AsyncClient
    owner: str
    repo: str
    api_base: str = "https://api.github.com"

    def url_for(self, ref: str) -> str:
        return self.api_base.rstrip("/") + TARBALL_PATH.format(
            owner=self.owner, repo=self.repo, ref=ref
        )

    async def fetch(self, *, ref: str, destination: Path) -> None:
        try:
            response = await self.client.get(self.url_for(ref), follow_redirects=True)
        except httpx.HTTPError as exc:  # pragma: no cover - exercised via respx side effects
            raise WorkspaceError(f"could not fetch the tarball for {ref!r}: {exc}") from exc
        if response.status_code != httpx.codes.OK:
            raise WorkspaceError(
                f"GitHub returned {response.status_code} for the {ref!r} tarball"
            )
        destination.mkdir(parents=True, exist_ok=True)
        _unpack_tarball(response.content, destination)


@dataclass
class ProofWorkspace:
    """Two materialised trees plus the temp root that owns them.

    ``base_tree`` is ``None`` when there is no baseline to compare — a file new at head
    (§4.6 row 1's parenthetical) or ``PROOF_REQUIRE_BASELINE=false``.
    """

    root: Path
    head_tree: Path
    base_tree: Path | None = None
    owns_root: bool = True

    def close(self) -> None:
        """Remove the workspace. Safe to call twice; never raises."""
        if self.owns_root:
            shutil.rmtree(self.root, ignore_errors=True)

    def __enter__(self) -> ProofWorkspace:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()


async def materialise(
    source: WorkspaceSource,
    *,
    request: ProofRequest,
    head_ref: str,
    base_ref: str | None = None,
    root: Path | None = None,
) -> ProofWorkspace:
    """Fetch head (and base, when there is one) and write the repro into each tree.

    The same bytes go into both trees: a repro that differed between refs would be comparing
    two tests rather than two revisions, and the whole claim rests on it being one test.
    """
    workspace_root = root if root is not None else Path(tempfile.mkdtemp(prefix=WORKSPACE_PREFIX))
    workspace_root.mkdir(parents=True, exist_ok=True)
    workspace = ProofWorkspace(
        root=workspace_root,
        head_tree=workspace_root / "head",
        base_tree=(workspace_root / "base") if base_ref is not None else None,
        owns_root=root is None,
    )
    try:
        await source.fetch(ref=head_ref, destination=workspace.head_tree)
        write_repro(workspace.head_tree, request)
        if base_ref is not None and workspace.base_tree is not None:
            await source.fetch(ref=base_ref, destination=workspace.base_tree)
            write_repro(workspace.base_tree, request)
    except Exception:
        workspace.close()
        raise
    return workspace


def write_repro(tree: Path, request: ProofRequest) -> Path:
    """Write the generated test into ``tree`` and return where it landed."""
    target = tree / safe_repro_path(request.test_file_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(request.test_code, encoding="utf-8")
    return target


def safe_repro_path(test_file_path: str) -> PurePosixPath:
    """Validate a model-supplied repro path, or refuse it.

    Accepted: a relative POSIX path, no ``..`` segment, no root, no drive, ending in ``.py``.
    Everything else raises — writing a file wherever a prompt asked us to is not a degradation
    mode, it is a vulnerability.
    """
    candidate = PurePosixPath(test_file_path.strip())
    if not test_file_path.strip():
        raise UnsafeReproPathError("the generated repro has no test_file_path")
    if candidate.is_absolute() or test_file_path.strip().startswith("~"):
        raise UnsafeReproPathError(f"repro path must be relative: {test_file_path!r}")
    if any(part == ".." for part in candidate.parts):
        raise UnsafeReproPathError(f"repro path escapes the workspace: {test_file_path!r}")
    if candidate.suffix != ".py":
        raise UnsafeReproPathError(f"repro path must name a .py file: {test_file_path!r}")
    return candidate


def default_repro_path(finding_id: str) -> str:
    """Where a repro goes when the generator did not choose: ``.prguard_proof/test_<id>.py``."""
    slug = "".join(character if character.isalnum() else "_" for character in finding_id)
    return f"{PROOF_DIR}/test_{slug}.py"


def _unpack_tarball(payload: bytes, destination: Path) -> None:
    """Extract a GitHub source archive, stripping its single top-level directory."""
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:*") as archive:
            with tempfile.TemporaryDirectory(prefix=WORKSPACE_PREFIX) as staging:
                archive.extractall(staging, filter="data")
                _promote_single_root(Path(staging), destination)
    except (tarfile.TarError, OSError, ValueError) as exc:
        raise WorkspaceError(f"could not unpack the tarball: {exc}") from exc


def _promote_single_root(staging: Path, destination: Path) -> None:
    entries = [entry for entry in staging.iterdir() if not entry.name.startswith(".")]
    root = entries[0] if len(entries) == 1 and entries[0].is_dir() else staging
    shutil.copytree(root, destination, dirs_exist_ok=True)
