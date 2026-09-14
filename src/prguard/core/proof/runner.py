"""Proof classification and sandbox selection — spec §4.6, plan §8 Cluster B.

This module holds the one decision the whole product rests on. "A finding with a red test
attached cannot be a false positive" is true only while ``proven`` is unreachable except by the
single documented path, so that path is written here once, as a pure function over two
``RunResult`` objects, and every other module asks it rather than re-deriving it.

**The invariant.** ``proven`` requires *all* of:

1. the baseline **executed a test** and that test **passed** — or there was legitimately no
   baseline to run (the file is new at head ⇒ ``not_applicable``, or
   ``PROOF_REQUIRE_BASELINE=false`` was set for demo latency, in which case the artifact is
   labelled ``head_only``). "Executed" is not decoration: pytest exits 0 when every collected
   test was *skipped*, so a baseline read from its exit code alone can be a baseline that ran
   nothing;
2. the head run **failed** (exit code 1 — it ran and answered);
3. the generation's ``expected_failure_signal`` appears in the head output;
4. every dependency the repro needed was installed.

Any other combination is ``inconclusive`` or ``disproven``. Seven of spec §7's edge cases —
E7, E8, E10, E11, E12, E13, E14 — are consequences of that sentence rather than special cases
of their own, which is why they are absent from the code below.

The second half of the module is sandbox selection (§4.6, E14): try Docker, fall back to the
subprocess runner with ``isolation="degraded"``, and if the fallback is disallowed report
``skipped_no_env`` so the gate concludes ``neutral``. **A missing sandbox can never turn a gate
red**, so nothing here raises — every failure mode is a recorded degradation.
"""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from types import MappingProxyType
from typing import Final, Literal, Protocol

from prguard.config import Settings
from prguard.core.proof.deps import (
    DependencyInstaller,
    InstallResult,
    NullInstaller,
    discover_requirements,
)
from prguard.core.proof.docker_runner import DockerRunner
from prguard.core.proof.redact import redact_output
from prguard.core.proof.subprocess_runner import SubprocessRunner
from prguard.core.proof.workspace import ProofWorkspace
from prguard.core.severity import is_blocking
from prguard.core.types import (
    BAND_RANK,
    Band,
    BaselineMode,
    CanonicalFinding,
    ProofIsolation,
    ProofOutcome,
    ProofOutcomeKind,
    ProofRequest,
    ProofRunner,
    ProofStatus,
    RunResult,
    SeverityInputs,
    SeverityResult,
)

# ---------------------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------------------

#: What one execution did. ``not_run`` means no process was started at all.
RunState = Literal["pass", "fail", "timeout", "error", "not_run"]

#: Why the verdict came out the way it did. Finer-grained than §5.1's six-value ``outcome``
#: column, and identical to the vocabulary ``tests/fixtures/expectations/proof_matrix.json``
#: records, so an artifact can say *why* and not only *what*.
ProofReason = Literal[
    "failed_as_predicted",
    "passed_unexpectedly",
    "pre_existing_failure",
    "baseline_failed",
    "baseline_missing",
    "signal_absent",
    "collection_error",
    "no_tests_ran",
    "baseline_not_observed",
    "deps_install_failed",
    "timeout",
    "skipped_no_env",
]

#: ``ProofReason`` → the §5.1 ``proof_artifacts.outcome`` enum. Several reasons share ``error``
#: because the column has six values; the reason is kept alongside so nothing is lost.
REASON_OUTCOME: Final[Mapping[ProofReason, ProofOutcomeKind]] = MappingProxyType(
    {
        "failed_as_predicted": "failing_as_expected",
        "passed_unexpectedly": "passed_unexpectedly",
        "pre_existing_failure": "pre_existing_failure",
        "baseline_failed": "error",
        "baseline_missing": "error",
        "signal_absent": "error",
        "collection_error": "error",
        "no_tests_ran": "error",
        "baseline_not_observed": "error",
        "deps_install_failed": "error",
        "timeout": "timeout",
        "skipped_no_env": "skipped_no_env",
    }
)

#: Spec §4.4: the third severity input a proof contributes. 0.5 is every shade of "we do not
#: know", which is why an unattempted proof neither helps nor hurts a finding's score.
PROOF_CONFIDENCE: Final[Mapping[ProofStatus, float]] = MappingProxyType(
    {
        "proven": 1.0,
        "disproven": 0.0,
        "inconclusive": 0.5,
        "not_attempted": 0.5,
        "not_applicable": 0.5,
        "skipped_no_env": 0.5,
    }
)

#: Exit code of a run that executed the repro and reported a failing assertion (pytest's 1).
PYTEST_EXIT_TESTS_FAILED: Final[int] = 1

#: Exit code of a run in which every test passed (pytest's 0).
PYTEST_EXIT_OK: Final[int] = 0

#: What pytest prints when it collected nothing at all. Exit code 5 usually accompanies it,
#: but not always — hence a marker rather than a code.
NO_TESTS_RAN_MARKER: Final[str] = "no tests ran"

#: Output markers that mean "the repro never ran", whatever the exit code claims. E8: a test
#: that died importing a third-party module says nothing about the finding.
COLLECTION_FAILURE_MARKERS: Final[tuple[str, ...]] = (
    "ERROR collecting",
    "error during collection",
    "errors during collection",
    "INTERNALERROR",
    "ModuleNotFoundError",
    "ImportError while importing test module",
    NO_TESTS_RAN_MARKER,
)

#: The tail every pytest terminal summary line carries: ``… in 0.42s`` (a long run adds
#: ``(0:01:05)`` after it). Used to find that line and to refuse to read counts from any other,
#: because a repro is free to print "1 passed" for reasons of its own and the sentence that
#: decides whether a test executed has to be pytest's, not the repro's.
SUMMARY_DURATION: Final[re.Pattern[str]] = re.compile(r"\bin\s+\d+(?:\.\d+)?s\b")

#: One ``<n> <outcome>`` pair inside that line.
SUMMARY_COUNT: Final[re.Pattern[str]] = re.compile(
    r"(\d+)\s+(passed|failed|errors?|skipped|deselected|xfailed|xpassed)\b"
)

#: Summary counts that are *not* "a test body ran and upheld the contract". ``skipped`` and
#: ``deselected`` never ran at all; ``error`` means setup or teardown decided the outcome, not
#: the assertion the finding is about; ``xfailed``/``xpassed`` ran under a declaration that
#: either result was acceptable, which is no more falsifiable than an empty
#: ``expected_failure_signal``. None of them can be half of a passing-to-failing claim.
UNEXECUTED_SUMMARY_COUNTS: Final[tuple[str, ...]] = (
    "skipped",
    "deselected",
    "error",
    "xfailed",
    "xpassed",
)

#: §6.4 — the note a clamped finding carries so the API can explain itself.
DISPROVEN_CLAMP_NOTE: Final[str] = "clamped to info: repro passed at head"

#: Recorded on the run when Docker was unavailable and the local fallback was used (E14).
DEGRADATION_SANDBOX_DEGRADED: Final[str] = "sandbox_degraded"

#: Recorded on the run when no sandbox was available at all (E14, `PROOF_ALLOW_SUBPROCESS`).
DEGRADATION_NO_SANDBOX: Final[str] = "proof_skipped_no_env"

#: Spec §4.6 / §11.2 assumption 8 — how long a `docker info` probe is trusted.
DOCKER_PROBE_CACHE_SECONDS: Final[float] = 60.0

#: How long the probe itself may take before it counts as a failure. A hung daemon socket must
#: not become a hung review.
DOCKER_PROBE_TIMEOUT_SECONDS: Final[float] = 5.0

#: The probe itself. A CLI call, not a docker-SDK client — §11.2 assumption 8 is explicit that
#: the SDK is not a dependency, and plan §9.3 rule 1 freezes ``pyproject.toml`` against adding it.
DOCKER_INFO_COMMAND: Final[tuple[str, ...]] = ("docker", "info", "--format", "{{.ServerVersion}}")


# ---------------------------------------------------------------------------------------
# The §4.6 table — pure, and the only path to `proven` in the codebase
# ---------------------------------------------------------------------------------------


def run_state(result: RunResult | None) -> RunState:
    """Interpret one execution — from the exit code *and* the output, never one alone.

    *The exit code* says what pytest concluded. It reserves 0 for "nothing failed" and 1 for
    "a test failed"; every other code (2 interrupted, 3 internal error, 4 usage error, 5
    nothing collected, negative for a signal) means it never got as far as answering the
    question. A run killed at the timeout is a ``timeout`` whatever code the kill left behind.

    *The output* says whether a test body actually ran, and that is the half on which the
    product's claim depends. **pytest exits 0 when every collected test was skipped**, so a
    ``@pytest.mark.skipif`` on a module the PR adds, a bare ``pytest.skip()`` or an
    ``importorskip`` hedged against a sandbox with no network all produce a baseline that
    executed nothing and reports success. ``pass`` is the state :func:`classify` consumes on
    the way to ``proven``, so "exit 0" on its own never earns it. Symmetrically, exit 1 with
    errors and no failures is not a ``fail``: a test whose *setup* blew up never reached the
    assertion the finding is about, and its traceback may still carry the predicted signal.

    Only a run that printed no summary at all is decided by its exit code alone — there is then
    nothing to check the code against, and a sandbox that captured no output is a broken runner
    rather than a skipped test.
    """
    if result is None:
        return "not_run"
    if result.timed_out:
        return "timeout"
    if result.exit_code not in (PYTEST_EXIT_OK, PYTEST_EXIT_TESTS_FAILED):
        return "error"
    if _looks_like_a_collection_failure(result):
        return "error"
    counts = _summary_counts(result)
    if result.exit_code == PYTEST_EXIT_OK:
        return "pass" if _every_collected_test_passed(counts) else "error"
    return "fail" if _a_test_failed(counts) else "error"


def classify(
    base: RunResult | None,
    head: RunResult | None,
    signal: str,
    deps_ok: bool,
    *,
    require_baseline: bool = True,
    base_applicable: bool = True,
) -> ProofStatus:
    """The §4.6 table. The single place in this codebase that can return ``proven``.

    ``base`` is ``None`` when no baseline execution happened; ``head`` is ``None`` when nothing
    executed at all (E14, no sandbox). ``signal`` is the generation's
    ``expected_failure_signal`` and is matched case-sensitively against the head output, because
    exception names are case-sensitive and a loose match is how a false proof gets in.

    ``base_applicable=False`` is §4.6 row 1's parenthetical — the file is new at head, so there
    was never a baseline to run. ``require_baseline=False`` is ``PROOF_REQUIRE_BASELINE``, the
    documented demo-latency escape hatch that labels the proof ``head_only``. Both widen what
    counts as a clean baseline; neither weakens conditions 2–4.
    """
    head_state = run_state(head)
    if head_state == "not_run":
        return "not_attempted"
    if head_state in ("timeout", "error"):
        return "inconclusive"
    if not deps_ok:
        return "inconclusive"

    base_state = _baseline_state(
        base, require_baseline=require_baseline, base_applicable=base_applicable
    )
    if base_state not in ("pass", "not_applicable"):
        return "inconclusive"
    if head_state == "pass":
        return "disproven"
    if not _signal_present(signal, head):
        return "inconclusive"
    return "proven"


@dataclass(frozen=True)
class ProofVerdict:
    """``classify`` plus everything the artifact needs to explain the verdict."""

    status: ProofStatus
    outcome: ProofOutcomeKind
    reason: ProofReason
    baseline_mode: BaselineMode

    @property
    def detail(self) -> str:
        """A one-line explanation safe to persist and to show in the API."""
        return REASON_DETAIL[self.reason]


def classify_outcome(
    base: RunResult | None,
    head: RunResult | None,
    signal: str,
    deps_ok: bool,
    *,
    require_baseline: bool = True,
    base_applicable: bool = True,
) -> ProofVerdict:
    """Decorate :func:`classify` with the reason, the §5.1 outcome enum and the baseline mode.

    The status is taken from :func:`classify` and never re-derived — two functions that both
    decide what ``proven`` means is exactly one function too many.
    """
    status = classify(
        base,
        head,
        signal,
        deps_ok,
        require_baseline=require_baseline,
        base_applicable=base_applicable,
    )
    reason = _reason_for(
        base,
        head,
        signal,
        deps_ok,
        status=status,
        require_baseline=require_baseline,
        base_applicable=base_applicable,
    )
    return ProofVerdict(
        status=status,
        outcome=REASON_OUTCOME[reason],
        reason=reason,
        baseline_mode=_baseline_mode(
            base, require_baseline=require_baseline, base_applicable=base_applicable
        ),
    )


def proof_confidence(status: ProofStatus) -> float:
    """The ``proof_confidence`` severity input for a proof verdict (spec §4.4)."""
    return PROOF_CONFIDENCE[status]


def is_head_only(outcome: ProofOutcome) -> bool:
    """Whether §4.6's ``head_only`` label applies: a proof run with no baseline comparison.

    Defined here rather than at the API layer so that "did we actually compare two revisions?"
    has one answer. ``PROOF_REQUIRE_BASELINE=false`` halves demo latency and costs exactly this:
    the claim becomes "it fails at head" instead of "it started failing at head", and the
    response has to say so.
    """
    return outcome.baseline_mode != "compared" and outcome.base is None


#: Human-readable half of :data:`REASON_OUTCOME`, persisted as ``ProofOutcome.detail``.
REASON_DETAIL: Final[Mapping[ProofReason, str]] = MappingProxyType(
    {
        "failed_as_predicted": "Repro passed at base and failed at head with the predicted signal.",
        "passed_unexpectedly": "Repro passed at head: the finding is refuted by its own test.",
        "pre_existing_failure": "Repro failed at base and at head: this PR did not cause it.",
        "baseline_failed": "The baseline did not hold, so there is no passing-to-failing claim.",
        "baseline_missing": "No baseline ran and PROOF_REQUIRE_BASELINE is set.",
        "signal_absent": "Head failed, but not with the predicted failure signal.",
        "collection_error": "The repro never ran: collection or import failed.",
        "no_tests_ran": "The repro was collected but no test executed: every test was skipped.",
        "baseline_not_observed": (
            "The baseline executed no test, so there is no passing-to-failing claim."
        ),
        "deps_install_failed": "A dependency the repro needed was not installed.",
        "timeout": "The repro was killed at PROOF_TIMEOUT.",
        "skipped_no_env": "No sandbox was available, so nothing was executed.",
    }
)


def _baseline_state(
    base: RunResult | None, *, require_baseline: bool, base_applicable: bool
) -> RunState | Literal["not_applicable"]:
    """What the baseline says, resolving the two ways it can legitimately be absent.

    An *observed* baseline always wins. ``base_applicable=False`` with a real base result is a
    caller contradicting itself, and the safe reading of a contradiction is the one that cannot
    manufacture a proof.
    """
    state = run_state(base)
    if state != "not_run":
        return state
    if not base_applicable or not require_baseline:
        return "not_applicable"
    return "not_run"


def _baseline_mode(
    base: RunResult | None, *, require_baseline: bool, base_applicable: bool
) -> BaselineMode:
    """§5.1 ``proof_artifacts.baseline_mode``: what the baseline actually did."""
    if base is not None:
        return "compared"
    if not base_applicable:
        return "not_applicable"
    return "skipped"


def _reason_for(
    base: RunResult | None,
    head: RunResult | None,
    signal: str,
    deps_ok: bool,
    *,
    status: ProofStatus,
    require_baseline: bool,
    base_applicable: bool,
) -> ProofReason:
    """Name what happened, in the order the table consulted it."""
    if status == "proven":
        return "failed_as_predicted"
    if status == "disproven":
        return "passed_unexpectedly"

    head_state = run_state(head)
    if head_state == "not_run":
        return "skipped_no_env"
    if head_state == "timeout":
        return "timeout"
    if head_state == "error":
        return "no_tests_ran" if _no_test_executed(head) else "collection_error"
    if not deps_ok:
        return "deps_install_failed"

    base_state = _baseline_state(
        base, require_baseline=require_baseline, base_applicable=base_applicable
    )
    if base_state == "not_run":
        return "baseline_missing"
    if base_state == "error" and _no_test_executed(base):
        return "baseline_not_observed"
    if base_state == "fail" and head_state == "fail":
        return "pre_existing_failure"
    if base_state not in ("pass", "not_applicable"):
        return "baseline_failed"
    if head_state == "fail" and not _signal_present(signal, head):
        return "signal_absent"
    return "baseline_failed"


def _signal_present(signal: str, head: RunResult | None) -> bool:
    """Whether the predicted failure signal appears in the head output.

    An empty or blank signal matches nothing: a generation that could not say what failure it
    expected has not made a falsifiable prediction, and an unfalsifiable prediction is never
    a proof.
    """
    needle = signal.strip()
    if not needle or head is None:
        return False
    return needle in head.stdout or needle in head.stderr


def _looks_like_a_collection_failure(result: RunResult) -> bool:
    return any(marker in result.stdout or marker in result.stderr
               for marker in COLLECTION_FAILURE_MARKERS)


def _summary_counts(result: RunResult) -> Mapping[str, int]:
    """pytest's own terminal summary, parsed into counts. Empty when it printed none.

    pytest writes the line last and :func:`redact.truncate` deliberately keeps the tail of the
    output, so the summary survives to here even for a repro that printed 200 KB before it
    finished. The scan runs backwards for the same reason: the last summary in the buffer is
    this run's.
    """
    for line in reversed(_output(result).splitlines()):
        candidate = line.strip().strip("=").strip()
        if not SUMMARY_DURATION.search(candidate):
            continue
        counts = {
            outcome.rstrip("s"): int(value) for value, outcome in SUMMARY_COUNT.findall(candidate)
        }
        if counts:
            return counts
    return {}


def _every_collected_test_passed(counts: Mapping[str, int]) -> bool:
    """Whether an exit-0 run observed the repro execute and hold.

    *Every* collected test, not merely one of them: a repro that hedges half of itself behind a
    ``skipif`` says nothing about the half that did not run, and a count of passes cannot say
    *which* test passed — so "1 passed, 1 skipped" at base followed by "1 passed, 1 failed" at
    head could be a test that never had a baseline at all. Proving less is the designed failure
    mode; proving wrong is the one that is not survivable.
    """
    if not counts:
        return True
    if counts.get("passed", 0) < 1:
        return False
    return not any(counts.get(outcome, 0) for outcome in UNEXECUTED_SUMMARY_COUNTS)


def _a_test_failed(counts: Mapping[str, int]) -> bool:
    """Whether an exit-1 run observed a test body run and fail."""
    if not counts:
        return True
    return counts.get("failed", 0) >= 1


def _no_test_executed(result: RunResult | None) -> bool:
    """Whether a run that finished executed no test at all — the shape E8 is really about."""
    if result is None or result.timed_out:
        return False
    if NO_TESTS_RAN_MARKER in _output(result):
        return True
    counts = _summary_counts(result)
    if not counts:
        return False
    return counts.get("passed", 0) == 0 and counts.get("failed", 0) == 0


def _output(result: RunResult) -> str:
    """Everything the run said, in one string. Both streams: pytest writes to stdout, a bare
    interpreter to stderr, and which one carried the summary is not something to depend on."""
    return f"{result.stdout}\n{result.stderr}"


# ---------------------------------------------------------------------------------------
# Sandbox selection — E14, and the reason VERIFY passes with the daemon down
# ---------------------------------------------------------------------------------------


class SandboxRunner(Protocol):
    """The seam a proof executes through. Implemented by Docker and by the local fallback."""

    @property
    def name(self) -> ProofRunner:
        """``docker`` or ``subprocess`` — persisted on the artifact (§5.1)."""
        ...

    @property
    def isolation(self) -> ProofIsolation:
        """``isolated`` or ``degraded`` — persisted, surfaced, and never hidden."""
        ...

    async def execute(
        self,
        *,
        tree: Path,
        request: ProofRequest,
        python_executable: str | None = None,
    ) -> RunResult:
        """Run ``request``'s repro inside ``tree`` and return what happened. Never raises."""
        ...


class DockerProbe:
    """`docker info`, cached for 60 s (§4.6, E14).

    A probe per proof would add a process spawn to every finding and a stall to every run on a
    machine where the daemon is wedged; a probe per process would never notice Docker coming
    up mid-demo. 60 s is the spec's number.
    """

    def __init__(
        self,
        *,
        command: Sequence[str] = DOCKER_INFO_COMMAND,
        cache_seconds: float = DOCKER_PROBE_CACHE_SECONDS,
        timeout_seconds: float = DOCKER_PROBE_TIMEOUT_SECONDS,
    ) -> None:
        self.command = tuple(command)
        self.cache_seconds = cache_seconds
        self.timeout_seconds = timeout_seconds
        self._available: bool | None = None
        self._checked_at = 0.0
        self.probes = 0

    def reset(self) -> None:
        """Drop the cached answer. Tests call this; so does a long-lived worker on demand."""
        self._available = None
        self._checked_at = 0.0

    def available(self, *, now: float | None = None) -> bool:
        """Whether the Docker daemon answered recently. Never raises, never blocks for long."""
        moment = time.monotonic() if now is None else now
        if self._available is not None and moment - self._checked_at < self.cache_seconds:
            return self._available
        self._available = self._probe()
        self._checked_at = moment
        return self._available

    def _probe(self) -> bool:
        """Shell out to the ``docker`` CLI. The docker SDK is deliberately not a dependency."""
        self.probes += 1
        try:
            completed = subprocess.run(  # noqa: S603 - fixed argv, no shell
                list(self.command),
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                env=_probe_env(),
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return completed.returncode == 0


#: Process-wide probe. Reset it rather than rebuilding it, so the cache is shared.
DOCKER_PROBE: Final[DockerProbe] = DockerProbe()


@dataclass(frozen=True)
class ProofPolicy:
    """The §4.8 proof knobs, resolved once per run so no call site reads config itself."""

    timeout_seconds: int = 90
    dep_install_timeout: int = 180
    output_max_bytes: int = 20_000
    require_baseline: bool = True
    allow_subprocess: bool = True
    min_score: float = 0.35
    max_per_run: int = 3
    block_min_severity: Band = "high"

    @classmethod
    def from_settings(cls, settings: Settings) -> ProofPolicy:
        return cls(
            timeout_seconds=settings.PROOF_TIMEOUT,
            dep_install_timeout=settings.DEP_INSTALL_TIMEOUT,
            output_max_bytes=settings.PROOF_OUTPUT_MAX_BYTES,
            require_baseline=settings.PROOF_REQUIRE_BASELINE,
            allow_subprocess=settings.PROOF_ALLOW_SUBPROCESS,
            min_score=settings.PROOF_MIN_SCORE,
            max_per_run=settings.PROOF_MAX_PER_RUN,
            block_min_severity=settings.BLOCK_MIN_SEVERITY,
        )


@dataclass(frozen=True)
class SandboxSelection:
    """Which runner a run got, and what it had to give up to get it."""

    runner: SandboxRunner | None
    degradations: tuple[str, ...] = ()
    reason: str = ""

    @property
    def available(self) -> bool:
        return self.runner is not None


def select_runner(
    policy: ProofPolicy,
    *,
    probe: DockerProbe | None = None,
    docker_runner: SandboxRunner | None = None,
    subprocess_runner: SandboxRunner | None = None,
) -> SandboxSelection:
    """Docker → subprocess → nothing (§4.6, E14).

    The third rung is not an error: ``PROOF_ALLOW_SUBPROCESS=false`` on a machine without
    Docker means every proof reports ``skipped_no_env`` and the gate concludes ``neutral``.
    Reviews still post and findings still publish — a missing sandbox can never turn a gate red.
    """
    if (probe or DOCKER_PROBE).available():
        chosen = docker_runner if docker_runner is not None else DockerRunner(
            timeout_seconds=policy.timeout_seconds
        )
        return SandboxSelection(runner=chosen, reason="docker daemon available")

    if policy.allow_subprocess:
        fallback = subprocess_runner if subprocess_runner is not None else SubprocessRunner(
            timeout_seconds=policy.timeout_seconds
        )
        return SandboxSelection(
            runner=fallback,
            degradations=(DEGRADATION_SANDBOX_DEGRADED,),
            reason="docker unavailable; running locally with rlimits (isolation=degraded)",
        )

    return SandboxSelection(
        runner=None,
        degradations=(DEGRADATION_NO_SANDBOX,),
        reason="no sandbox available — nothing could be proven",
    )


# ---------------------------------------------------------------------------------------
# Execution — base, then head, then the table
# ---------------------------------------------------------------------------------------


def skipped_outcome(*, reason: str = "") -> ProofOutcome:
    """The artifact for a proof that never ran (E14).

    ``runner`` is recorded as ``subprocess``/``degraded``: the local fallback was the only
    sandbox on offer and it was not permitted. The column is not nullable (§5.1) and claiming
    Docker would be a worse lie than claiming the runner we would have used.
    """
    verdict = classify_outcome(None, None, "", True)
    return ProofOutcome(
        status=verdict.status,
        outcome=verdict.outcome,
        runner="subprocess",
        isolation="degraded",
        baseline_mode=verdict.baseline_mode,
        detail=reason or verdict.detail,
    )


def errored_outcome(runner: SandboxRunner | None, detail: str) -> ProofOutcome:
    """The artifact for a proof whose machinery broke (S7: "degrading on: everything").

    §4.6's fourth row — "any | collection error → inconclusive" — is the right home for it: the
    attempt happened and produced nothing usable. Advisory, never blocking, never a failed run.
    """
    return ProofOutcome(
        status="inconclusive",
        outcome="error",
        runner=runner.name if runner is not None else "subprocess",
        isolation=runner.isolation if runner is not None else "degraded",
        baseline_mode="skipped",
        detail=detail,
    )


async def run_proof(
    *,
    request: ProofRequest,
    workspace: ProofWorkspace,
    runner: SandboxRunner | None,
    policy: ProofPolicy | None = None,
    installer: DependencyInstaller | None = None,
    secrets: Sequence[str] = (),
    base_applicable: bool = True,
) -> ProofOutcome:
    """Execute one repro at base and at head and classify the pair. Never raises.

    "Never raises" is the stage's contract, not a convenience: S7 degrades on *everything* and
    proof never fails a run (§4.1). A repro is generated code running against a repository we
    did not write, so the interesting failures are the ones nobody predicted — hence the
    catch-all, which downgrades to ``inconclusive`` rather than propagating.

    ``base_applicable=False`` is §4.6 row 1's parenthetical and **only** that: the finding's
    file did not exist at base, so there was never a baseline to run. It is deliberately a
    parameter rather than something inferred from ``workspace.base_tree``. "The file is new"
    and "no base tree was materialised" look identical from in here and mean opposite things —
    conflating them would let a workspace that simply failed to fetch base produce a ``proven``
    finding with no passing-to-failing evidence behind it, which is the one bug in this
    codebase that damages the product's claim.

    The order matters for latency, not for correctness: the head run is the one that decides
    whether there is anything to prove, but the baseline is what makes the claim mean
    "passing-to-failing", so both are always run unless ``PROOF_REQUIRE_BASELINE`` is off.

    Everything persisted passes through the redactor and the ``PROOF_OUTPUT_MAX_BYTES``
    truncation first (E26, §4.6).
    """
    if runner is None:
        return skipped_outcome()
    try:
        return await _run_proof(
            request=request,
            workspace=workspace,
            runner=runner,
            policy=policy,
            installer=installer,
            secrets=secrets,
            base_applicable=base_applicable,
        )
    except Exception as exc:  # noqa: BLE001 - S7 degrades on everything, by design
        return errored_outcome(runner, f"the proof runner failed: {type(exc).__name__}: {exc}")


async def _run_proof(
    *,
    request: ProofRequest,
    workspace: ProofWorkspace,
    runner: SandboxRunner,
    policy: ProofPolicy | None,
    installer: DependencyInstaller | None,
    secrets: Sequence[str],
    base_applicable: bool,
) -> ProofOutcome:
    settings = policy or ProofPolicy()
    started = time.monotonic()
    effective_installer = installer if installer is not None else NullInstaller()
    # Both the config knob and the per-request flag have to want a baseline for one to run;
    # either of them saying "head only" is the §4.6 demo shortcut.
    require_baseline = settings.require_baseline and request.require_baseline
    base_tree = workspace.base_tree if require_baseline else None

    head_install = await _install(
        effective_installer, tree=workspace.head_tree, request=request
    )
    base_install = (
        await _install(effective_installer, tree=base_tree, request=request)
        if base_tree is not None
        else InstallResult(ok=True, performed=False, detail="baseline not run")
    )

    head = await _execute(
        runner, tree=workspace.head_tree, request=request, install=head_install, settings=settings,
        secrets=secrets,
    )
    base = await _execute(
        runner,
        tree=base_tree,
        request=request,
        install=base_install,
        settings=settings,
        secrets=secrets,
    )

    deps_ok = head_install.ok and base_install.ok
    verdict = classify_outcome(
        base,
        head,
        request.expected_failure_signal,
        deps_ok,
        require_baseline=require_baseline,
        base_applicable=base_applicable,
    )
    detail = verdict.detail if deps_ok else f"{verdict.detail} ({head_install.detail})"
    return ProofOutcome(
        status=verdict.status,
        outcome=verdict.outcome,
        runner=runner.name,
        isolation=runner.isolation,
        baseline_mode=verdict.baseline_mode,
        base=base,
        head=head,
        deps_install_ok=deps_ok,
        duration_ms=int((time.monotonic() - started) * 1000),
        detail=detail,
    )


async def _install(
    installer: DependencyInstaller, *, tree: Path | None, request: ProofRequest
) -> InstallResult:
    """Install what the repro needs, or record honestly that we could not (E8, E10)."""
    if tree is None:
        return InstallResult(ok=True, performed=False, detail="no tree to install into")
    requirements = discover_requirements(tree, extra=request.extra_requirements)
    return await installer.install(tree=tree, requirements=requirements)


async def _execute(
    runner: SandboxRunner,
    *,
    tree: Path | None,
    request: ProofRequest,
    install: InstallResult,
    settings: ProofPolicy,
    secrets: Sequence[str],
) -> RunResult | None:
    """One sandbox execution, with its output redacted and truncated before it is persisted."""
    if tree is None:
        return None
    result = await runner.execute(
        tree=tree, request=request, python_executable=install.python_executable
    )
    return replace(
        result,
        stdout=redact_output(result.stdout, max_bytes=settings.output_max_bytes, secrets=secrets),
        stderr=redact_output(result.stderr, max_bytes=settings.output_max_bytes, secrets=secrets),
    )


# ---------------------------------------------------------------------------------------
# Applying a verdict to a finding
# ---------------------------------------------------------------------------------------


def clamp_disproven(severity: SeverityResult | None) -> SeverityResult | None:
    """E12 / §6.4: a self-refuted finding is clamped to ``info`` and says so.

    The score is left untouched. Being publicly wrong on the record is the trust story, and a
    rewritten score would erase the evidence that we ever believed it.
    """
    if severity is None:
        return None
    if DISPROVEN_CLAMP_NOTE in severity.notes:
        return severity
    return replace(
        severity, band="info", notes=[*severity.notes, DISPROVEN_CLAMP_NOTE]
    )


def with_proof_confidence(
    severity: SeverityResult | None, status: ProofStatus
) -> SeverityResult | None:
    """Write the proof's contribution into the stored severity inputs (§4.4).

    S5 scores a finding before S7 proves it, so at scoring time ``proof_confidence`` is 0.5 —
    "we have not looked". Once the sandbox has answered, the stored inputs must say what it
    found, because ``/result`` shows the arithmetic and the arithmetic has to be over the real
    numbers (R4: the claim is transparency, not calibration).

    The *score* is not recomputed here. That is ``severity.compute``'s job, and
    :func:`apply_outcome` takes it as a hook so this module never grows a second opinion about
    how a severity is calculated.
    """
    if severity is None:
        return None
    confidence = proof_confidence(status)
    if severity.inputs.proof_confidence == confidence:
        return severity
    return replace(severity, inputs=replace(severity.inputs, proof_confidence=confidence))


def apply_outcome(
    finding: CanonicalFinding,
    outcome: ProofOutcome,
    *,
    block_min_severity: Band = "high",
    recompute: Callable[[SeverityInputs], SeverityResult] | None = None,
) -> CanonicalFinding:
    """Write a proof verdict onto a finding (E12, §4.4). Mutates and returns ``finding``.

    ``recompute`` is ``severity.compute`` when the pipeline passes it: the proof changed one of
    the six inputs, so the score that inputs produce has changed too. Without it the inputs are
    still updated and the score is left as S5 computed it, which is the right behaviour for a
    unit test and the wrong one for a run — S9 supplies the hook.

    ``blocking`` is **not** assigned here: it is recomputed by calling
    :func:`prguard.core.severity.is_blocking`, which is the sole writer of that flag in the
    codebase. At proof time a finding is still ``proposed``, so the answer is ``False``;
    delivery recomputes it once the finding is published. Keeping the call here rather than
    assigning a literal is what stops a second writer from ever appearing.
    """
    finding.proof_status = outcome.status
    finding.severity = with_proof_confidence(finding.severity, outcome.status)
    if recompute is not None and finding.severity is not None:
        rescored = recompute(finding.severity.inputs)
        finding.severity = replace(rescored, notes=[*finding.severity.notes, *rescored.notes])
    if outcome.status == "disproven":
        finding.status = "disproven"
        finding.severity = clamp_disproven(finding.severity)
    finding.blocking = is_blocking(
        proof_status=finding.proof_status,
        band=finding.severity.band if finding.severity is not None else "info",
        language=finding.language,
        status=finding.status,
        block_min_severity=block_min_severity,
    )
    return finding


def artifact_columns(
    outcome: ProofOutcome, request: ProofRequest, *, image: str | None = None
) -> dict[str, object]:
    """The §5.1 ``proof_artifacts`` column values for one proof. Persistence-layer-agnostic.

    Kept here rather than in the pipeline so that the mapping from "what the runner observed"
    to "what the audit trail records" is written once, next to the verdict it describes.
    """
    return {
        "runner": outcome.runner,
        "isolation": outcome.isolation,
        "image": image,
        "test_file_path": request.test_file_path,
        "test_code": request.test_code,
        "expected_failure_signal": request.expected_failure_signal,
        "command": (outcome.head or outcome.base or RunResult(exit_code=0)).command,
        "base_exit_code": outcome.base.exit_code if outcome.base is not None else None,
        "base_stdout": outcome.base.stdout if outcome.base is not None else None,
        "base_stderr": outcome.base.stderr if outcome.base is not None else None,
        "head_exit_code": outcome.head.exit_code if outcome.head is not None else None,
        "head_stdout": outcome.head.stdout if outcome.head is not None else None,
        "head_stderr": outcome.head.stderr if outcome.head is not None else None,
        "outcome": outcome.outcome,
        "baseline_mode": outcome.baseline_mode,
        "deps_install_ok": outcome.deps_install_ok,
        "duration_ms": outcome.duration_ms,
    }


def blocking_band_reached(band: Band, *, block_min_severity: Band) -> bool:
    """Whether ``band`` clears the configured gate threshold (§4.4). Used by the selector."""
    return BAND_RANK[band] >= BAND_RANK[block_min_severity]


def _probe_env() -> dict[str, str]:
    """The minimum a `docker` CLI invocation needs: where to look and who to ask."""
    keep = ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG")
    return {key: os.environ[key] for key in keep if key in os.environ}


async def docker_available(probe: DockerProbe | None = None) -> bool:
    """Async wrapper over the probe: a wedged daemon socket must not stall a worker's loop."""
    return await asyncio.to_thread((probe or DOCKER_PROBE).available)
