"""Materialising base and head, and writing the repro into both — spec §4.6 "Execution".

Two things are worth testing here and one of them is not obvious. The obvious one is that both
trees get the same repro, because a proof that ran two different tests is not a comparison. The
non-obvious one is the repro *path*: ``test_file_path`` arrives from a model, so
``/etc/cron.d/x.py`` and ``../../.ssh/authorized_keys.py`` are not exotic edge cases, they are
the first thing anyone who can influence the generator's input will try (§3 Tier 3).
"""

from __future__ import annotations

import io
import tarfile
import tempfile
from pathlib import Path

import httpx
import pytest
import respx

from prguard.core.proof.workspace import (
    PROOF_DIR,
    WORKSPACE_PREFIX,
    GitHubTarballSource,
    LocalPathSource,
    ProofWorkspace,
    UnsafeReproPathError,
    WorkspaceError,
    default_repro_path,
    materialise,
    safe_repro_path,
    write_repro,
)
from tests.fixtures.loader import repo_tree
from tests.proof.conftest import make_request

BASE_SHA = "1f0b2c3d" + "0" * 32
HEAD_SHA = "9a1e3c7f" + "0" * 32


def build_tarball(files: dict[str, str], *, root: str = "octocat-hello-world-9a1e3c7") -> bytes:
    """A GitHub source archive: every path under one top-level ``{owner}-{repo}-{sha}`` dir."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for path, content in files.items():
            payload = content.encode("utf-8")
            info = tarfile.TarInfo(name=f"{root}/{path}")
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
    return buffer.getvalue()


# ---------------------------------------------------------------------------------------
# Repro path validation — the part that is a security control, not a convenience
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        "/etc/cron.d/payload.py",
        "../../../../etc/passwd.py",
        ".prguard_proof/../../escape.py",
        "~/.ssh/authorized_keys.py",
        "",
        "   ",
        ".prguard_proof/payload.sh",
        ".prguard_proof/payload",
    ],
)
def test_a_repro_path_that_escapes_the_workspace_is_refused(path: str) -> None:
    """Absolute, traversing, home-relative or non-Python paths raise rather than degrade.

    This one does *not* degrade quietly: writing a file wherever a prompt asked us to is a
    vulnerability, and a vulnerability that reports itself as a skipped proof is worse than one
    that stops the proof.
    """
    with pytest.raises(UnsafeReproPathError):
        safe_repro_path(path)


@pytest.mark.parametrize(
    "path",
    [
        ".prguard_proof/test_null_deref_7c21a9.py",
        "tests/test_generated.py",
        "test_repro.py",
    ],
)
def test_ordinary_relative_python_paths_are_accepted(path: str) -> None:
    assert str(safe_repro_path(path)) == path


def test_default_repro_path_is_inside_the_proof_directory() -> None:
    """§4.6's sample path shape, for a generation that named no file of its own."""
    assert default_repro_path("f-9c2e").startswith(f"{PROOF_DIR}/test_")
    assert default_repro_path("f/9c2e").endswith(".py")
    assert "/" not in default_repro_path("f/9c2e").removeprefix(f"{PROOF_DIR}/")


# ---------------------------------------------------------------------------------------
# Local trees — the offline path, and the one AC-10..AC-13 actually run
# ---------------------------------------------------------------------------------------


async def test_local_source_materialises_both_refs(tmp_path: Path) -> None:
    source = LocalPathSource(
        trees={"base": repo_tree("buggy_calc", "base"), "head": repo_tree("buggy_calc", "head")}
    )
    request = make_request("proof_generator_billing_none_rate")

    workspace = await materialise(
        source, request=request, head_ref="head", base_ref="base", root=tmp_path / "ws"
    )

    assert workspace.base_tree is not None
    assert (workspace.head_tree / "app" / "billing.py").is_file()
    assert (workspace.base_tree / "app" / "billing.py").is_file()


async def test_the_same_repro_is_written_into_both_trees(tmp_path: Path) -> None:
    """A proof compares two revisions of the code, never two versions of the test."""
    source = LocalPathSource(
        trees={"base": repo_tree("buggy_calc", "base"), "head": repo_tree("buggy_calc", "head")}
    )
    request = make_request("proof_generator_billing_none_rate")

    workspace = await materialise(
        source, request=request, head_ref="head", base_ref="base", root=tmp_path / "ws"
    )

    assert workspace.base_tree is not None
    head_repro = (workspace.head_tree / request.test_file_path).read_text(encoding="utf-8")
    base_repro = (workspace.base_tree / request.test_file_path).read_text(encoding="utf-8")
    assert head_repro == base_repro == request.test_code


async def test_the_fixture_tree_itself_is_never_touched(tmp_path: Path) -> None:
    """The corpus is committed data. A run that wrote into it would poison every later test."""
    source = LocalPathSource(
        trees={"base": repo_tree("buggy_calc", "base"), "head": repo_tree("buggy_calc", "head")}
    )
    request = make_request("proof_generator_billing_none_rate")

    await materialise(
        source, request=request, head_ref="head", base_ref="base", root=tmp_path / "ws"
    )

    assert not (repo_tree("buggy_calc", "head") / PROOF_DIR).exists()
    assert not (repo_tree("buggy_calc", "base") / PROOF_DIR).exists()


async def test_no_base_ref_means_no_base_tree(tmp_path: Path) -> None:
    """§4.6 row 1's parenthetical and `PROOF_REQUIRE_BASELINE=false` share this shape."""
    source = LocalPathSource(trees={"head": repo_tree("buggy_calc", "head")})
    workspace = await materialise(
        source,
        request=make_request("proof_generator_billing_none_rate"),
        head_ref="head",
        root=tmp_path / "ws",
    )
    assert workspace.base_tree is None


async def test_an_unknown_ref_raises_rather_than_producing_an_empty_tree(tmp_path: Path) -> None:
    """An empty workspace would run the repro against nothing and call the result a baseline."""
    source = LocalPathSource(trees={"head": repo_tree("buggy_calc", "head")})
    with pytest.raises(WorkspaceError):
        await materialise(
            source,
            request=make_request("proof_generator_billing_none_rate"),
            head_ref="head",
            base_ref="base",
            root=tmp_path / "ws",
        )


async def test_a_failed_materialisation_leaves_no_temp_workspace_behind() -> None:
    """Every proof allocates a temp tree; a leak per failed proof is a leak per run.

    No ``root`` is passed, so ``materialise`` allocates one itself and therefore owns it — and
    a failure halfway through fetching base must clean it up rather than abandon it in /tmp.
    """
    source = LocalPathSource(trees={"head": repo_tree("buggy_calc", "head")})
    before = set(Path(tempfile.gettempdir()).glob(f"{WORKSPACE_PREFIX}*"))

    with pytest.raises(WorkspaceError):
        await materialise(
            source,
            request=make_request("proof_generator_billing_none_rate"),
            head_ref="head",
            base_ref="base",
        )

    assert set(Path(tempfile.gettempdir()).glob(f"{WORKSPACE_PREFIX}*")) == before


def test_closing_a_workspace_removes_it(tmp_path: Path) -> None:
    root = tmp_path / "ws"
    (root / "head").mkdir(parents=True)
    workspace = ProofWorkspace(root=root, head_tree=root / "head")
    with workspace:
        assert root.exists()
    assert not root.exists()
    workspace.close()  # idempotent


def test_a_borrowed_root_is_not_deleted(tmp_path: Path) -> None:
    """``owns_root=False`` is how a caller keeps a workspace for inspection after a run."""
    root = tmp_path / "ws"
    (root / "head").mkdir(parents=True)
    ProofWorkspace(root=root, head_tree=root / "head", owns_root=False).close()
    assert root.exists()


def test_write_repro_creates_the_proof_directory(tmp_path: Path) -> None:
    request = make_request("proof_generator_billing_none_rate")
    written = write_repro(tmp_path, request)
    assert written.parent.name == PROOF_DIR
    assert written.read_text(encoding="utf-8") == request.test_code


def test_write_repro_refuses_an_escaping_path(tmp_path: Path) -> None:
    request = make_request(
        "proof_generator_billing_none_rate", test_file_path="../escaped.py"
    )
    with pytest.raises(UnsafeReproPathError):
        write_repro(tmp_path, request)
    assert not (tmp_path.parent / "escaped.py").exists()


# ---------------------------------------------------------------------------------------
# The GitHub tarball path — production's source, exercised only under respx
# ---------------------------------------------------------------------------------------


async def test_tarball_source_strips_githubs_top_level_directory(tmp_path: Path) -> None:
    """GitHub wraps the tree in ``{owner}-{repo}-{sha}/``; the workspace root is the repo root."""
    payload = build_tarball(
        {"app/billing.py": "def apply_discount(price, rate): ...\n", "pyproject.toml": ""}
    )
    url = f"https://api.github.com/repos/octocat/hello-world/tarball/{HEAD_SHA}"

    async with httpx.AsyncClient() as client:
        with respx.mock(assert_all_called=True) as mock:
            mock.get(url).mock(return_value=httpx.Response(200, content=payload))
            source = GitHubTarballSource(client=client, owner="octocat", repo="hello-world")
            await source.fetch(ref=HEAD_SHA, destination=tmp_path / "head")

    assert (tmp_path / "head" / "app" / "billing.py").is_file()
    assert not (tmp_path / "head" / "octocat-hello-world-9a1e3c7").exists()


async def test_tarball_source_builds_the_documented_url() -> None:
    async with httpx.AsyncClient() as client:
        source = GitHubTarballSource(client=client, owner="octocat", repo="hello-world")
        assert source.url_for(BASE_SHA) == (
            f"https://api.github.com/repos/octocat/hello-world/tarball/{BASE_SHA}"
        )


async def test_a_non_200_tarball_is_a_workspace_error_not_a_crash(tmp_path: Path) -> None:
    """E27: GitHub failures degrade. The caller records `not_attempted` and the run continues."""
    url = f"https://api.github.com/repos/octocat/hello-world/tarball/{HEAD_SHA}"
    async with httpx.AsyncClient() as client:
        with respx.mock(assert_all_called=True) as mock:
            mock.get(url).mock(return_value=httpx.Response(404, json={"message": "Not Found"}))
            source = GitHubTarballSource(client=client, owner="octocat", repo="hello-world")
            with pytest.raises(WorkspaceError):
                await source.fetch(ref=HEAD_SHA, destination=tmp_path / "head")


async def test_an_archive_that_tries_to_escape_is_refused(tmp_path: Path) -> None:
    """tarfile's ``data`` filter: an archive is untrusted input like any other download."""
    payload = build_tarball({"../../escaped.py": "print('pwned')\n"})
    url = f"https://api.github.com/repos/octocat/hello-world/tarball/{HEAD_SHA}"

    async with httpx.AsyncClient() as client:
        with respx.mock(assert_all_called=True) as mock:
            mock.get(url).mock(return_value=httpx.Response(200, content=payload))
            source = GitHubTarballSource(client=client, owner="octocat", repo="hello-world")
            with pytest.raises(WorkspaceError):
                await source.fetch(ref=HEAD_SHA, destination=tmp_path / "head")

    assert not (tmp_path.parent / "escaped.py").exists()
