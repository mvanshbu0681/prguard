"""The generator's inputs, as types. ``catalog.py`` and ``demo_story.py`` fill these in.

Everything a reviewer would call *content* — a title, a body, a suppression reason, which
finding a run raised, what a repro printed — is an input here. Everything a reviewer would call
*a result* — a score, a band, a fingerprint, a proof verdict, a ladder rung, a gate, a hash, a
rate — is computed from these inputs by the backend's own functions in ``simulate.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field


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
    """How pytest reports the failing assertion of a repro (``pytest_text.Failure``)."""

    exception: str
    explanation: tuple[str, ...]
    caret: str | None = None


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
    """

    kind: str
    test_name: str
    test_code: str
    signal: str
    failure: FailureSpec | None = None
    base_seconds: float = 0.31
    head_seconds: float = 0.29
    #: The module a ``collection_error`` repro failed to import.
    missing_module: str | None = None


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
    remediation: str
    hint: str
    confidence: float
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
    """One review run. ``at`` is when it was queued (UTC, minute precision)."""

    key: str
    repo: str
    pr: int
    title: str
    author: str
    at: str
    uses: tuple[Use, ...] = ()
    trigger: str = "webhook"
    tier: str = "standard"
    extra_files: tuple[str, ...] = ()
    excluded: tuple[str, ...] = ()
    #: ``succeeded`` · ``failed:<stage>:<code>:<message>`` · ``cancelled:<next stage>``
    outcome: str = "succeeded"
    #: ``posted`` · ``forbidden`` (403, E17) · ``comments_unreadable`` · ``dry_run``
    review: str | None = None
    #: The gate ladder rung that took the verdict, when it differs from the repo default.
    gate_rung: str | None = None
    #: ``none`` when no sandbox could run a repro at all (``PROOF_ALLOW_SUBPROCESS=false``).
    sandbox: str | None = None
    suppress: tuple[Suppress, ...] = ()
    head_ref: str | None = None
    #: Seconds a stage took, when the plan pins them (the demo run does).
    stage_ms: tuple[int, ...] | None = None
    #: The specialist lanes inside S3, when pinned.
    lane_ms: dict[str, int] | None = None
    #: Extra degradations this run recorded (besides the ones the backend derives).
    degradations: tuple[str, ...] = ()
    #: PR state at "now" for the pull_requests row.
    pr_state: str = "open"
