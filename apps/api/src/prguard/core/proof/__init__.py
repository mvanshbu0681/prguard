"""Proof by execution (M1) — spec §4.6, and the product's entire differentiator.

The claim is "a finding with a red test attached cannot be a false positive". It holds because
``proven`` has exactly one definition, in exactly one function:

    the repro **passed at base** and **failed at head**, with the predicted failure signal in
    the head output and every dependency it needed installed.

Nothing else is ``proven``. A badly-generated repro, a timeout, a missing manifest, a failed
install, a repo that was already red, a sandbox that never started — every one of them is
``inconclusive`` or ``disproven``. The designed failure mode is *proving less*, never proving
wrong (R3).

Stage order, and what each module owns:

* :mod:`~prguard.core.proof.selector` — which findings are worth the budget (3 per run).
* :mod:`~prguard.core.proof.generator` — one validated LLM call per candidate.
* :mod:`~prguard.core.proof.workspace` — base and head materialised, repro written into both.
* :mod:`~prguard.core.proof.deps` — E8/E10: what the repro needs, and whether it got it.
* :mod:`~prguard.core.proof.runner` — the §4.6 table, sandbox selection, and execution.
* :mod:`~prguard.core.proof.subprocess_runner` / :mod:`~prguard.core.proof.docker_runner` —
  the two sandboxes, chosen by a cached ``docker info`` probe.
* :mod:`~prguard.core.proof.redact` — E26, applied before anything is persisted.

Nothing in this package fails a run. Every failure mode is a recorded degradation (§4.1 S7).
"""

from prguard.core.proof.deps import (
    DependencyInstaller,
    InstallResult,
    NullInstaller,
    Requirements,
    UvInstaller,
    discover_requirements,
)
from prguard.core.proof.docker_runner import DockerRunner
from prguard.core.proof.generator import (
    ProofGenerationError,
    ProofPromptContext,
    generate_repro,
    to_request,
)
from prguard.core.proof.redact import configured_secrets, redact, redact_output
from prguard.core.proof.runner import (
    DOCKER_PROBE,
    DockerProbe,
    ProofPolicy,
    ProofVerdict,
    SandboxRunner,
    SandboxSelection,
    apply_outcome,
    artifact_columns,
    classify,
    classify_outcome,
    docker_available,
    errored_outcome,
    is_head_only,
    proof_confidence,
    run_proof,
    run_state,
    select_runner,
    skipped_outcome,
)
from prguard.core.proof.selector import (
    Candidate,
    explain_selection,
    is_provable,
    select_candidates,
)
from prguard.core.proof.subprocess_runner import SubprocessRunner
from prguard.core.proof.workspace import (
    GitHubTarballSource,
    LocalPathSource,
    ProofWorkspace,
    WorkspaceSource,
    materialise,
)

__all__ = [
    "DOCKER_PROBE",
    "Candidate",
    "DependencyInstaller",
    "DockerProbe",
    "DockerRunner",
    "GitHubTarballSource",
    "InstallResult",
    "LocalPathSource",
    "NullInstaller",
    "ProofGenerationError",
    "ProofPolicy",
    "ProofPromptContext",
    "ProofVerdict",
    "ProofWorkspace",
    "Requirements",
    "SandboxRunner",
    "SandboxSelection",
    "SubprocessRunner",
    "UvInstaller",
    "WorkspaceSource",
    "apply_outcome",
    "artifact_columns",
    "classify",
    "classify_outcome",
    "configured_secrets",
    "discover_requirements",
    "docker_available",
    "errored_outcome",
    "explain_selection",
    "generate_repro",
    "is_head_only",
    "is_provable",
    "materialise",
    "proof_confidence",
    "redact",
    "redact_output",
    "run_proof",
    "run_state",
    "select_candidates",
    "select_runner",
    "skipped_outcome",
    "to_request",
]
