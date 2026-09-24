"""The generator's inputs, as types. ``catalog.py`` and ``demo_story.py`` fill these in.

Everything a reviewer would call *content* — a title, a body, a suppression reason, which
finding a run raised, what a repro printed — is an input here. Everything a reviewer would call
*a result* — a score, a band, a fingerprint, a proof verdict, a ladder rung, a gate, a hash, a
rate — is computed from these inputs by the backend's own functions in ``simulate.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from corpus.synth import FileSpec


@dataclass(frozen=True)
class RepoSpec:
    """One repository the tenant reviews.

    ``app_installed`` decides the gate ladder's first rung: the deployment has a GitHub App
    configured, so ``deliver_gate`` always tries a check run, and GitHub refuses it on a
    repository the App is not installed on — the verdict then lands as a commit status.
    ``churn_available=False`` is a repository whose commits API the deployment cannot read, so
    churn scores 0.0 with the backend's own note (§4.4, E27). ``short_summary=False`` is a
    repository whose pytest config sets ``-rN``.
    """

    key: str
    owner: str
    name: str
    default_branch: str = "main"
    app_installed: bool = False
    churn_available: bool = True
    short_summary: bool = True
    is_private: bool = True
    files: tuple[FileSpec, ...] = ()

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.name}"


@dataclass(frozen=True)
class Facts:
    """What S2/S5 measured about a finding's symbol (§4.4, "How it is derived").

    ``commits_90d=None`` is the commits API being unreachable: churn scores 0.0 and the backend
    records ``CHURN_UNAVAILABLE_NOTE`` (§4.4, E27).
    """

    public_entrypoint: bool = False
    internal_callers: int = 0
    symbol_is_tested: bool = False
    file_is_tested: bool = True
    commits_90d: int | None = 4


@dataclass(frozen=True)
class FailureSpec:
    """How pytest reports the failing statement of a repro (``pytest_text.Failure``).

    ``line`` names the failing statement when it is not the test's last one (pytest prints the
    function only down to the statement that raised): the last line containing it wins.
    """

    exception: str
    explanation: tuple[str, ...]
    caret: str | None = None
    line: str | None = None


@dataclass(frozen=True)
class Proof:
    """One repro and what the sandbox observed when it ran it.

    ``kind`` is what the run *observed*, never the verdict: the verdict comes from
    ``runner.classify_outcome`` over the two ``RunResult`` objects built from this.

    * ``fails_at_head`` — passes at base, fails at head with ``failure``.
    * ``passes_both`` — passes at base and at head.
    * ``fails_both`` — fails at base and at head with ``failure`` (pre-existing).
    * ``head_timeout`` — passes at base, killed at ``PROOF_TIMEOUT`` at head.
    * ``collection_error`` — the repro cannot be imported at either SHA.
    * ``wrong_signal`` — fails at head, but not with ``signal``.
    * ``deps_failed`` — passes at base, fails at head, but a dependency did not install.
    * ``nothing_collected`` — the repro skipped itself at module level at both SHAs.
    * ``gen_fail`` — the generator never produced a test (§8.1: ``not_attempted``).
    """

    kind: str
    test_name: str = ""
    test_code: str = ""
    signal: str = ""
    failure: FailureSpec | None = None
    base_seconds: float = 0.31
    head_seconds: float = 0.29
    #: The module a ``collection_error`` repro failed to import.
    missing_module: str | None = None
    #: Where the generator wrote the file; defaults to ``tests/test_repro_<hex6>.py``.
    test_file_path: str | None = None


@dataclass(frozen=True)
class Template:
    """One finding a specialist can raise, anchored to a symbol in a file."""

    key: str
    specialist: str
    category: str
    rule_key: str
    file: str
    symbol: str
    #: Lines of the finding, as offsets from the symbol's first line (``def``/block line).
    span: tuple[int, int]
    title: str
    body: str
    hint: str
    confidence: float
    remediation: str = ""
    provable: bool = False
    facts: Facts = field(default_factory=Facts)
    #: Named repro variants. ``"default"`` is used unless a run names another.
    proofs: dict[str, Proof] = field(default_factory=dict)


@dataclass(frozen=True)
class DropTemplate:
    """A finding the coordinator refuses. ``{file}``/``{symbol}`` are filled per use."""

    key: str
    specialist: str
    category: str
    rule_key: str
    title: str
    body: str
    reason: str
    detail: str
    hint: str = "low"
    confidence: float = 0.55


@dataclass(frozen=True)
class Use:
    """A template appearing in one run.

    ``fate``: ``keep``; ``drop`` (a ``DropTemplate`` key, anchored at ``file``/``symbol``);
    ``dup:<template key>`` (another specialist's copy of a kept finding, dropped as
    ``duplicate``). ``anchor`` says where the diff sits relative to the finding: ``exact``
    (inside it), ``nearest`` (within 10 lines), ``file`` (further away), or ``none`` (the file
    has no hunk near it at all — only meaningful for findings that are not delivered).
    """

    tpl: str
    fate: str = "keep"
    anchor: str = "exact"
    proof: str = "default"
    #: For ``drop`` and ``dup`` uses: where the refused finding pointed.
    file: str | None = None
    symbol: str | None = None
    specialist: str | None = None


@dataclass(frozen=True)
class Suppress:
    """A human pressing *Suppress* on a published finding, some time after its run (§6.6)."""

    key: str
    tpl: str
    after_hours: float
    scope: str
    reason: str
    actor: str
    match_path: str | None = None
    expires_at: str | None = None


@dataclass(frozen=True)
class Revoke:
    """``DELETE /v1/suppressions/{id}`` — the row stays, ``revoked_at`` is set (§6.7)."""

    suppression: str
    at: str
    actor: str


@dataclass(frozen=True)
class RunSpec:
    """One review run.

    ``at`` is when it was queued (UTC). Minute precision gets a seeded sub-minute offset; a
    value with seconds is used as written (the demo story pins its two overlapping runs).

    ``outcome``: ``succeeded`` · ``failed:<stage>:<code>:<message>`` (the stage raised) ·
    ``stale:<stage>`` (the worker died inside ``stage`` and the reaper failed the run). A run
    is *cancelled* by nothing in its own spec: a later push to the same PR, landing while it is
    in flight, supersedes it — exactly as ``enqueue_review`` and S1 do (§4.2).

    ``review``: ``posted`` · ``forbidden`` (403, E17) · ``comments_unreadable`` (§8.1 S8) ·
    ``422:<template key>`` (that comment is refused once and demoted, E2) · ``dry_run``.
    ``gate``: ``auto`` (the repository's ladder) · ``unreachable`` (both GitHub rungs refused;
    the verdict is persisted as ``dry_run``). ``sandbox``: ``docker`` · ``subprocess`` · ``none``.
    """

    key: str
    repo: str
    pr: int
    title: str
    author: str
    at: str
    uses: tuple[Use, ...] = ()
    trigger: str = "webhook"
    #: The tier the plan expects. ``build_context`` computes the real one; they must agree.
    tier: str = "standard"
    extra_files: tuple[str, ...] = ()
    excluded: tuple[str, ...] = ()
    outcome: str = "succeeded"
    review: str = "posted"
    gate: str = "auto"
    sandbox: str = "docker"
    suppress: tuple[Suppress, ...] = ()
    head_ref: str | None = None
    #: Milliseconds each stage took, when the plan pins them (the demo run does).
    stage_ms: tuple[int, ...] | None = None
    #: Extra degradations this run recorded (besides the ones the backend derives).
    degradations: tuple[str, ...] = ()
    #: PR state at "now" for the pull_requests row.
    pr_state: str = "open"
    #: Pin identifiers the manifest binds (the demo run); generated otherwise.
    review_id: str | None = None
    head_sha: str | None = None
    base_sha: str | None = None
    #: ``finding template key -> finding id`` for ids the manifest binds.
    finding_ids: dict[str, str] = field(default_factory=dict)
    #: Changed lines per synthesised file beyond the finding hunks (risk-tier arithmetic).
    padding_lines: int = 0
    #: ``files[].patch`` omitted: an oversized diff the budget truncates (E5).
    oversized: tuple[str, ...] = ()
