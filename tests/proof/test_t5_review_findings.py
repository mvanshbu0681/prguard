"""Reviewer repros for T5 (proof subsystem). Written by review, not by the builder.

F1 (P0) — a baseline in which the repro was *skipped* is read as a passing baseline, so
`proven` is reachable with no observed passing baseline. `run_state` returns "pass" for any
exit code 0, and pytest exits 0 when every collected test was skipped.

F2 (P3) — the two invariants the builder's own docstrings call load-bearing are unpinned:
`base_applicable=False` must never suppress an available baseline, and the tarball extractor
must refuse a traversal entry. Both mutations survive the full 1745-test suite.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from prguard.core.proof.runner import apply_outcome, classify, run_proof, run_state
from prguard.core.proof.subprocess_runner import SubprocessRunner
from prguard.core.proof.workspace import ProofWorkspace, write_repro
from prguard.core.severity import is_blocking
from prguard.core.types import ProofRequest
from tests.proof.conftest import make_finding

pytestmark = pytest.mark.anyio

#: A repro that skips itself when a module the PR adds is absent — a shape a model reaches for
#: whenever the finding's file imports something new.
SKIP_AT_BASE_REPRO = '''\
import pytest

try:
    from app.discounts import rate_for  # noqa: F401

    HAVE_DISCOUNTS = True
except ImportError:
    HAVE_DISCOUNTS = False

from app.billing import apply_discount


@pytest.mark.skipif(not HAVE_DISCOUNTS, reason="app.discounts is new in this PR")
def test_apply_discount_default_is_identity():
    assert apply_discount(100.0) == 100.0
'''

#: The same hedge for a third-party package that the sandbox has no network to install.
SKIP_EVERYWHERE_REPRO = '''\
import pytest

from app.billing import apply_discount


def test_apply_discount_default_is_identity():
    pytest.importorskip("a_package_that_is_not_installed")
    assert apply_discount(100.0) == 100.0
'''


def _trees(tmp_path: Path, repro: str) -> ProofWorkspace:
    """A base without `app.discounts` and a head with it, repro written into both."""
    root = tmp_path / "ws"
    base, head = root / "base", root / "head"
    for tree in (base, head):
        (tree / "app").mkdir(parents=True)
        (tree / "app" / "__init__.py").write_text("")
        (tree / "app" / "billing.py").write_text(
            "def apply_discount(price, rate=0.0):\n    return price * (1 - rate)\n"
        )
    (head / "app" / "discounts.py").write_text(
        'def rate_for(tier):\n    return {"gold": 0.2}[tier]\n'
    )
    (head / "app" / "billing.py").write_text(
        "from app.discounts import rate_for\n\n\n"
        "def apply_discount(price, tier=None):\n    return price * (1 - rate_for(tier))\n"
    )
    request = _request(repro)
    write_repro(base, request)
    write_repro(head, request)
    return ProofWorkspace(root=root, head_tree=head, base_tree=base)


def _request(repro: str) -> ProofRequest:
    return ProofRequest(
        finding_id="f-9c2e",
        test_file_path=".prguard_proof/test_repro.py",
        test_code=repro,
        expected_failure_signal="KeyError",
        timeout_seconds=30,
    )


async def test_a_skipped_baseline_is_not_a_passing_baseline(tmp_path: Path) -> None:
    """F1: the repro never ran at base, so there is no passing-to-failing claim to make."""
    workspace = _trees(tmp_path, SKIP_AT_BASE_REPRO)
    outcome = await run_proof(
        request=_request(SKIP_AT_BASE_REPRO),
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=30),
    )

    assert outcome.base is not None
    assert outcome.base.exit_code == 0
    assert "1 skipped" in outcome.base.stdout, outcome.base.stdout
    assert run_state(outcome.base) != "pass", "a baseline that ran nothing did not pass"
    assert outcome.status != "proven", (
        "proven with no observed passing baseline: base output was "
        f"{outcome.base.stdout.strip()!r}"
    )


async def test_a_skipped_baseline_does_not_make_a_finding_blocking(tmp_path: Path) -> None:
    """F1's consequence: the merge gate goes red on evidence that was never gathered."""
    workspace = _trees(tmp_path, SKIP_AT_BASE_REPRO)
    outcome = await run_proof(
        request=_request(SKIP_AT_BASE_REPRO),
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=30),
    )
    finding = make_finding()
    apply_outcome(finding, outcome)
    finding.status = "published"

    blocking = is_blocking(
        proof_status=finding.proof_status,
        band=finding.severity.band if finding.severity else "info",
        language=finding.language,
        status=finding.status,
        block_min_severity="high",
    )
    assert blocking is False, "the gate is red on a proof whose baseline was skipped"


async def test_a_repro_skipped_at_both_revisions_is_not_disproven(tmp_path: Path) -> None:
    """E12 means "the repro passed at head", not "the repro was never executed"."""
    workspace = _trees(tmp_path, SKIP_EVERYWHERE_REPRO)
    outcome = await run_proof(
        request=_request(SKIP_EVERYWHERE_REPRO),
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=30),
    )

    assert outcome.head is not None and "1 skipped" in outcome.head.stdout
    assert outcome.status != "disproven", (
        "a finding was self-refuted by a test that never executed"
    )


def test_run_state_does_not_call_a_skipped_run_a_pass() -> None:
    """The root cause, without a subprocess: exit 0 alone does not mean the repro ran."""
    from prguard.core.types import RunResult

    skipped = RunResult(exit_code=0, stdout="s                    [100%]\n1 skipped in 0.01s\n")
    assert run_state(skipped) != "pass"
    assert classify(skipped, RunResult(exit_code=1, stdout="KeyError"), "KeyError", True) != (
        "proven"
    )


async def test_base_applicable_false_never_suppresses_an_available_baseline(
    materialise_repo: Any,
) -> None:
    """Regression pin for the runner docstring's stated invariant (mutation N3 survives).

    ``base_applicable=False`` widens what counts as a *clean* baseline; it must never decide
    that a baseline is not worth running when a base tree exists.
    """
    request = _request(
        "from app.billing import apply_discount\n\n\n"
        "def test_none_rate_is_a_noop():\n"
        "    assert apply_discount(100.0, None) == 100.0\n"
    )
    workspace = materialise_repo("buggy_calc", request)

    outcome = await run_proof(
        request=request,
        workspace=workspace,
        runner=SubprocessRunner(timeout_seconds=30),
        base_applicable=False,
    )

    assert outcome.base is not None, "the baseline was available and was not run"
    assert outcome.baseline_mode == "compared"


def test_a_tarball_entry_cannot_escape_the_workspace(tmp_path: Path) -> None:
    """Regression pin for the `filter="data"` extraction guard (mutation M25 survives)."""
    import io
    import tarfile

    from prguard.core.proof.workspace import WorkspaceError, _unpack_tarball

    payload = io.BytesIO()
    with tarfile.open(fileobj=payload, mode="w:gz") as archive:
        body = b"ESCAPED"
        entry = tarfile.TarInfo("repo-sha/../../escaped.py")
        entry.size = len(body)
        archive.addfile(entry, io.BytesIO(body))

    destination = tmp_path / "nested" / "head"
    with pytest.raises(WorkspaceError):
        _unpack_tarball(payload.getvalue(), destination)
    assert not (tmp_path / "escaped.py").exists()
