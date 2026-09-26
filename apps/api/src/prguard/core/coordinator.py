"""S4 — the coordinator. Spec §4.1, §6.12, §7 E15/E23, §8.1.

**It is a filter, not a merger.** The specialists have already said everything they can think of;
this stage's value is measured in what it removes. Speculation, nitpicks, false positives and
findings the repository's own conventions contradict are dropped here, and what survives is
normalised into the :class:`~prguard.core.types.CanonicalFinding` every later stage speaks.

Two of its rules are ours rather than the model's, because a prompt cannot guarantee them:

* **Hallucinated paths are dropped in code, before and after the call.** §6.12 requires
  ``file_path`` to be one of the files supplied in context; E15 makes it the half of
  prompt-injection defence that does not depend on the model behaving. A finding naming a file
  nobody supplied never reaches the coordinator model, and one the *coordinator* invents is
  dropped on the way out.
* **Nothing is silently forgotten.** Every specialist finding must come out as either a kept
  finding or a recorded drop with a reason, because ``/result`` publishes the drop list — being
  able to see what was filtered, and argue with it, is the product. A finding the model neither
  kept nor dropped is **kept**, with a degradation recorded: a coordinator's silence is not a
  decision.

When the coordinator model is unavailable the stage degrades to a deterministic merge — union
plus exact-duplicate removal, no false-positive filtering — and records
``degradations:["coordinator_fallback"]`` (§8.1). A noisier review is survivable; a lost finding
is not.

Ownership: T8. No I/O beyond the model call; persistence belongs to the pipeline (T9).
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Annotated, Any, Final

from pydantic import Field, model_validator
from pydantic.dataclasses import dataclass as validated_dataclass

from prguard.core.specialists.base import (
    ReviewTask,
    context_header,
    fence_untrusted,
    system_prompt,
    untrusted_sections,
)
from prguard.core.types import (
    CanonicalFinding,
    Category,
    DroppedFinding,
    DropReason,
    Evidence,
    Side,
    SpecialistFinding,
    SpecialistOutput,
)
from prguard.llm.client import LLMClient
from prguard.llm.structured import complete_structured

#: The markdown file assembled on top of ``SHARED.md`` for this stage.
COORDINATOR_PROMPT: Final[str] = "coordinator"

#: Spec §8.1 — recorded when the deterministic merge had to stand in for the model.
COORDINATOR_FALLBACK_DEGRADATION: Final[str] = "coordinator_fallback"

#: Recorded when the model returned an answer that forgot some of its input (see module docs).
COORDINATOR_UNACCOUNTED_DEGRADATION: Final[str] = "coordinator_unaccounted"

#: Used only for a drop the coordinator reported against no finding we sent it; the drop's
#: ``detail`` says so, so the record never claims more than it knows.
DEFAULT_DROP_CATEGORY: Final[Category] = "maintainability"

#: Spec §4.7: we only ever comment on the post-image of the diff.
DEFAULT_SIDE: Final[Side] = "RIGHT"

#: Enough to classify blocking eligibility (E25, Q9) and to render a code fence.
LANGUAGE_BY_SUFFIX: Final[Mapping[str, str]] = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".java": "java",
    ".kt": "kotlin",
    ".c": "c",
    ".h": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".sh": "shell",
    ".sql": "sql",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".toml": "toml",
    ".ini": "ini",
    ".md": "markdown",
    ".html": "html",
    ".css": "css",
}

_SLUG_PATTERN: Final[re.Pattern[str]] = re.compile(r"[^a-z0-9]+")
_MAX_RULE_KEY_CHARS: Final[int] = 255

#: Why a path-less finding was dropped. Phrased for the pull request author, not for us.
_HALLUCINATED_DETAIL: Final[str] = "file_path was not one of the files supplied in context"


# ---------------------------------------------------------------------------
# The coordinator's own wire contract (§6.12: `List[SpecialistOutput]` in, canonical out)
# ---------------------------------------------------------------------------


@validated_dataclass(frozen=True)
class CoordinatedFinding:
    """One finding the coordinator kept, in the shape the model returns it."""

    rule_key: str
    category: Category
    title: str
    body_markdown: str
    file_path: str
    start_line: Annotated[int, Field(ge=1)]
    end_line: Annotated[int, Field(ge=1)]
    symbol_hint: str | None = None
    language: str | None = None
    llm_severity_hint: str | None = None
    #: Tolerated because it is the input field name; ``llm_severity_hint`` wins when both appear.
    severity_hint: str | None = None
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 0.5
    provable: bool = False
    repro_hint: str | None = None
    #: §6.12's optional remediation. Optional here for the same reason it is optional on the
    #: specialist contract: a coordinator that omits it must cost us a "Fix:" line, not a run.
    remediation: str | None = None
    sources: tuple[str, ...] = ()
    evidence: tuple[Evidence, ...] = ()

    @model_validator(mode="after")
    def _line_range_is_ordered(self) -> CoordinatedFinding:
        if self.start_line > self.end_line:
            raise ValueError(
                f"start_line ({self.start_line}) must be <= end_line ({self.end_line})"
            )
        return self

    @property
    def severity(self) -> str | None:
        return self.llm_severity_hint or self.severity_hint


@validated_dataclass(frozen=True)
class CoordinatorDrop:
    """One finding the coordinator refused, and the reason it gave."""

    rule_key: str
    file_path: str
    drop_reason: DropReason
    detail: str = ""
    source: str = ""
    category: Category | None = None


@validated_dataclass(frozen=True)
class CoordinatorOutput:
    """The whole coordinator response. Both lists may be empty; that is a good answer."""

    findings: tuple[CoordinatedFinding, ...] = ()
    dropped: tuple[CoordinatorDrop, ...] = ()
    notes: str | None = None


@dataclass(frozen=True)
class CoordinationResult:
    """What S4 hands S5: the surviving findings, and the receipts for everything else."""

    findings: tuple[CanonicalFinding, ...] = ()
    dropped: tuple[DroppedFinding, ...] = ()
    degradations: tuple[str, ...] = ()
    notes: str = ""

    @property
    def used_fallback(self) -> bool:
        return COORDINATOR_FALLBACK_DEGRADATION in self.degradations

    def dropped_payload(self) -> list[dict[str, Any]]:
        """The drop list as plain JSON, for ``review_runs`` persistence and ``/result``."""
        return [
            {
                "specialist": drop.specialist,
                "rule_key": drop.rule_key,
                "category": drop.category,
                "title": drop.title,
                "file_path": drop.file_path,
                "start_line": drop.start_line,
                "end_line": drop.end_line,
                "drop_reason": drop.drop_reason,
                "detail": drop.detail,
            }
            for drop in self.dropped
        ]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def coordinate(
    client: LLMClient,
    *,
    outputs: Sequence[SpecialistOutput],
    task: ReviewTask,
    tenant_id: str,
    repository_id: str,
    model: str,
    max_tokens: int,
    temperature: float,
) -> CoordinationResult:
    """Merge, filter and normalise the specialists' findings (spec §4.1 S4).

    Never raises for a model failure: a dead coordinator degrades to :func:`deterministic_merge`
    with ``degradations:["coordinator_fallback"]`` (§8.1).
    """
    supplied = frozenset(task.supplied_files)
    candidates, hallucinated = _partition_hallucinated(outputs, supplied)

    if not candidates:
        # E24: nothing to coordinate is a complete answer, and it costs nothing to reach.
        return CoordinationResult(dropped=tuple(hallucinated))

    # Assembled outside the try: a missing prompt file is our bug, and degrading quietly to the
    # deterministic merge on every run is exactly how it would go unnoticed.
    system = system_prompt(COORDINATOR_PROMPT)
    prompt = build_coordinator_prompt(task, candidates)
    try:
        response = await complete_structured(
            client,
            model=model,
            system=system,
            prompt=prompt,
            schema=CoordinatorOutput,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except Exception as error:
        # Deliberately broad, deliberately not `BaseException`: §8.1 says a coordinator failure
        # degrades the run, and cancellation (E3) must still propagate.
        return deterministic_merge(
            candidates,
            hallucinated=hallucinated,
            tenant_id=tenant_id,
            repository_id=repository_id,
            detail=f"{type(error).__name__}: {error}",
        )

    return _apply(
        response,
        candidates=candidates,
        hallucinated=hallucinated,
        supplied=supplied,
        tenant_id=tenant_id,
        repository_id=repository_id,
    )


def build_coordinator_prompt(
    task: ReviewTask, candidates: Sequence[tuple[str, SpecialistFinding]]
) -> str:
    """The trusted preamble, the same fenced context the specialists saw, then their findings.

    The findings are fenced *and* sanitised. They are our reviewers' words, but every one of
    them is model prose quoting a diff written by a stranger, so a forged
    ``</untrusted_content>`` inside a finding body is exactly as reachable as one inside the
    diff — and would end this fence early, leaving the rest of the attacker's text reading as
    our own prompt. :func:`~prguard.core.specialists.base.fence_untrusted` neutralises the body
    it wraps, so the closer in that fence is always ours (E15).
    """
    listed = "\n\n".join(
        _describe(specialist, finding) for specialist, finding in candidates
    )
    return "\n".join(
        [
            context_header(task),
            *untrusted_sections(task),
            "",
            f"{len(candidates)} finding(s) were reported by the reviewers named below. Keep, "
            "merge or drop each one, and account for every one of them exactly once.",
            fence_untrusted("specialist_findings", listed),
            "",
            "Return the single JSON object your instructions describe, and nothing else.",
        ]
    )


def deterministic_merge(
    candidates: Sequence[tuple[str, SpecialistFinding]],
    *,
    hallucinated: Sequence[DroppedFinding],
    tenant_id: str,
    repository_id: str,
    detail: str = "",
) -> CoordinationResult:
    """Spec §8.1's fallback: union, exact-duplicate removal, **no** false-positive filtering.

    Deliberately dumber than the model it replaces. A review that says too much is a bad review;
    a review that quietly loses the finding that mattered is a broken product.
    """
    seen: dict[tuple[str, str, int, int], str] = {}
    findings: list[CanonicalFinding] = []
    dropped: list[DroppedFinding] = list(hallucinated)

    for specialist, finding in candidates:
        key = _exact_key(finding)
        if key in seen:
            dropped.append(
                _dropped_from_specialist(
                    specialist,
                    finding,
                    reason="duplicate",
                    detail=f"identical location and rule as the finding from {seen[key]}",
                )
            )
            continue
        seen[key] = specialist
        findings.append(
            _canonical_from_specialist(
                specialist,
                finding,
                tenant_id=tenant_id,
                repository_id=repository_id,
            )
        )

    note = "deterministic merge: the coordinator model was unavailable"
    return CoordinationResult(
        findings=tuple(findings),
        dropped=tuple(dropped),
        degradations=(COORDINATOR_FALLBACK_DEGRADATION,),
        notes=f"{note} ({detail})" if detail else note,
    )


# ---------------------------------------------------------------------------
# Applying the model's answer
# ---------------------------------------------------------------------------


class _Pending:
    """The findings we sent, indexed so the answer can be matched back to them.

    Keyed on ``(normalised rule_key, file_path)`` rather than on line numbers, because a
    coordinator that merges two reports of one defect keeps one set of lines and the drop
    records carry no lines at all (§6.12).
    """

    def __init__(self, candidates: Iterable[tuple[str, SpecialistFinding]]) -> None:
        self._by_key: dict[tuple[str, str], list[tuple[str, SpecialistFinding]]] = {}
        for specialist, finding in candidates:
            self._by_key.setdefault(_match_key(finding), []).append((specialist, finding))

    def take(
        self, rule_key: str, file_path: str, *, specialist: str | None = None
    ) -> tuple[str, SpecialistFinding] | None:
        """Claim one unaccounted-for finding, preferring one from ``specialist``."""
        entries = self._by_key.get((_slug(rule_key), file_path))
        if not entries:
            return None
        for index, (owner, _finding) in enumerate(entries):
            if specialist is None or owner == specialist:
                return entries.pop(index)
        return entries.pop(0)

    def remaining(self) -> list[tuple[str, SpecialistFinding]]:
        return [entry for entries in self._by_key.values() for entry in entries]


def _apply(
    response: CoordinatorOutput,
    *,
    candidates: Sequence[tuple[str, SpecialistFinding]],
    hallucinated: Sequence[DroppedFinding],
    supplied: frozenset[str],
    tenant_id: str,
    repository_id: str,
) -> CoordinationResult:
    pending = _Pending(candidates)
    findings: list[CanonicalFinding] = []
    dropped: list[DroppedFinding] = list(hallucinated)
    recorded: set[tuple[str, str]] = {(_slug(d.rule_key), d.file_path) for d in hallucinated}

    for kept in response.findings:
        claimed = [
            entry
            for entry in (
                pending.take(kept.rule_key, kept.file_path, specialist=source)
                for source in (kept.sources or (None,))
            )
            if entry is not None
        ]
        if kept.file_path not in supplied:
            # The coordinator invented a path of its own, or tried to carry a specialist's
            # invention back in. Same rule, one record (E15).
            key = (_slug(kept.rule_key), kept.file_path)
            if key not in recorded:
                dropped.append(
                    _dropped_from_coordinated(
                        kept,
                        reason="hallucinated_path",
                        detail=_HALLUCINATED_DETAIL,
                        specialist=_attribution(kept, claimed),
                    )
                )
                recorded.add(key)
            continue
        findings.append(
            _canonical_from_coordinated(
                kept,
                specialist=_attribution(kept, claimed),
                supplied=supplied,
                tenant_id=tenant_id,
                repository_id=repository_id,
            )
        )

    for drop in response.dropped:
        key = (_slug(drop.rule_key), drop.file_path)
        match = pending.take(drop.rule_key, drop.file_path, specialist=drop.source or None)
        if match is None:
            if key in recorded:
                # Already accounted for — the model listed a drop we had made ourselves.
                continue
            dropped.append(_dropped_from_report(drop))
            recorded.add(key)
            continue
        specialist, finding = match
        dropped.append(
            _dropped_from_specialist(
                specialist,
                finding,
                reason=drop.drop_reason,
                detail=drop.detail or f"dropped by the coordinator as {drop.drop_reason}",
            )
        )
        recorded.add(key)

    degradations: tuple[str, ...] = ()
    leftovers = pending.remaining()
    if leftovers:
        # Silence is not a decision: keep them, and say that the coordinator did not rule.
        degradations = (COORDINATOR_UNACCOUNTED_DEGRADATION,)
        findings.extend(
            _canonical_from_specialist(
                specialist,
                finding,
                tenant_id=tenant_id,
                repository_id=repository_id,
            )
            for specialist, finding in leftovers
        )

    return CoordinationResult(
        findings=tuple(findings),
        dropped=tuple(dropped),
        degradations=degradations,
        notes=response.notes or "",
    )


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------


def _partition_hallucinated(
    outputs: Sequence[SpecialistOutput], supplied: frozenset[str]
) -> tuple[list[tuple[str, SpecialistFinding]], list[DroppedFinding]]:
    """Split the specialists' findings into "worth coordinating" and "never in context"."""
    candidates: list[tuple[str, SpecialistFinding]] = []
    hallucinated: list[DroppedFinding] = []
    for output in outputs:
        for finding in output.findings:
            if finding.file_path in supplied:
                candidates.append((output.specialist, finding))
            else:
                hallucinated.append(
                    _dropped_from_specialist(
                        output.specialist,
                        finding,
                        reason="hallucinated_path",
                        detail=_HALLUCINATED_DETAIL,
                    )
                )
    return candidates, hallucinated


def _attribution(
    kept: CoordinatedFinding, claimed: Sequence[tuple[str, SpecialistFinding]]
) -> str:
    """Which reviewer gets the credit.

    The reviewer we matched wins over the one the coordinator names: attribution feeds
    ``/v1/accuracy``'s per-specialist numbers, and those should reflect who actually found it.
    """
    if claimed:
        return claimed[0][0]
    if kept.sources:
        return kept.sources[0]
    return COORDINATOR_PROMPT


def _canonical_from_coordinated(
    kept: CoordinatedFinding,
    *,
    specialist: str,
    supplied: frozenset[str],
    tenant_id: str,
    repository_id: str,
) -> CanonicalFinding:
    return CanonicalFinding(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        repository_id=repository_id,
        specialist=specialist,
        category=kept.category,
        rule_key=_slug(kept.rule_key),
        title=kept.title,
        body_markdown=kept.body_markdown,
        file_path=kept.file_path,
        start_line=kept.start_line,
        end_line=kept.end_line,
        side=DEFAULT_SIDE,
        language=kept.language or language_for(kept.file_path),
        symbol_path=_symbol_path(kept.file_path, kept.symbol_hint),
        llm_severity_hint=kept.severity,
        confidence=kept.confidence,
        provable=kept.provable,
        repro_hint=kept.repro_hint,
        remediation=kept.remediation,
        evidence=[item for item in kept.evidence if item.file_path in supplied],
    )


def _canonical_from_specialist(
    specialist: str,
    finding: SpecialistFinding,
    *,
    tenant_id: str,
    repository_id: str,
) -> CanonicalFinding:
    return CanonicalFinding(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        repository_id=repository_id,
        specialist=specialist,
        category=finding.category,
        rule_key=_slug(finding.rule_key),
        title=finding.title,
        body_markdown=finding.body_markdown,
        file_path=finding.file_path,
        start_line=finding.start_line,
        end_line=finding.end_line,
        side=DEFAULT_SIDE,
        language=language_for(finding.file_path),
        symbol_path=_symbol_path(finding.file_path, finding.symbol_hint),
        llm_severity_hint=finding.severity_hint,
        confidence=finding.confidence,
        provable=finding.provable,
        repro_hint=finding.repro_hint,
        remediation=finding.remediation,
        evidence=list(finding.evidence),
    )


def _dropped_from_specialist(
    specialist: str,
    finding: SpecialistFinding,
    *,
    reason: DropReason,
    detail: str,
) -> DroppedFinding:
    return DroppedFinding(
        specialist=specialist,
        rule_key=_slug(finding.rule_key),
        category=finding.category,
        title=finding.title,
        file_path=finding.file_path,
        start_line=finding.start_line,
        end_line=finding.end_line,
        drop_reason=reason,
        detail=detail,
    )


def _dropped_from_coordinated(
    kept: CoordinatedFinding,
    *,
    reason: DropReason,
    detail: str,
    specialist: str,
) -> DroppedFinding:
    return DroppedFinding(
        specialist=specialist,
        rule_key=_slug(kept.rule_key),
        category=kept.category,
        title=kept.title,
        file_path=kept.file_path,
        start_line=kept.start_line,
        end_line=kept.end_line,
        drop_reason=reason,
        detail=detail,
    )


def _dropped_from_report(drop: CoordinatorDrop) -> DroppedFinding:
    """A drop the coordinator reported against nothing we sent it.

    Recorded rather than discarded, but the detail says plainly that we could not match it, so
    the row never claims to know a category or a location it was not given.
    """
    detail = drop.detail or f"dropped by the coordinator as {drop.drop_reason}"
    return DroppedFinding(
        specialist=drop.source,
        rule_key=_slug(drop.rule_key),
        category=drop.category or DEFAULT_DROP_CATEGORY,
        title="",
        file_path=drop.file_path,
        start_line=0,
        end_line=0,
        drop_reason=drop.drop_reason,
        detail=f"{detail} (no matching specialist finding)",
    )


def _describe(specialist: str, finding: SpecialistFinding) -> str:
    """One finding, rendered for the coordinator to judge.

    Every value below is model output shaped by the pull request, and is interpolated raw on
    purpose: the block this joins is neutralised as a whole by ``fence_untrusted``, so escaping
    twice here would only double the entities the coordinator reads back.
    """
    lines = [
        f"- reviewer: {specialist}",
        f"  rule_key: {finding.rule_key}",
        f"  category: {finding.category}",
        f"  location: {finding.file_path}:{finding.start_line}-{finding.end_line}",
        f"  symbol: {finding.symbol_hint or '-'}",
        f"  severity_hint: {finding.severity_hint or '-'}",
        f"  confidence: {finding.confidence:.2f}",
        f"  provable: {str(finding.provable).lower()}",
        f"  title: {finding.title}",
        f"  body: {finding.body_markdown}",
        f"  remediation: {finding.remediation or '-'}",
    ]
    lines.extend(
        f"  evidence: {item.file_path}:{item.line}: {item.quote}" for item in finding.evidence
    )
    return "\n".join(lines)


def language_for(file_path: str) -> str:
    """The language of a path, for E25's blocking rule. ``unknown`` rather than a guess."""
    return LANGUAGE_BY_SUFFIX.get(PurePosixPath(file_path).suffix.lower(), "unknown")


def _symbol_path(file_path: str, symbol_hint: str | None) -> str:
    """``app/billing.py::apply_discount`` — the stable half of the §4.5 fingerprint."""
    return f"{file_path}::{symbol_hint}" if symbol_hint else file_path


def _slug(rule_key: str) -> str:
    """``"promotion-rate NOT normalised"`` → ``"promotion_rate_not_normalised"`` (§4.5)."""
    return _SLUG_PATTERN.sub("_", rule_key.strip().lower()).strip("_")[:_MAX_RULE_KEY_CHARS]


def _match_key(finding: SpecialistFinding) -> tuple[str, str]:
    return (_slug(finding.rule_key), finding.file_path)


def _exact_key(finding: SpecialistFinding) -> tuple[str, str, int, int]:
    """The fallback's "exact fingerprint": same rule, same place. S6 computes the real one."""
    return (_slug(finding.rule_key), finding.file_path, finding.start_line, finding.end_line)
