"""S3 — prompt assembly, the ``Specialist`` protocol, and the parallel runner (spec §4.1).

Three ideas, and they are all borrowed from the one production system that published its numbers
(§3 Tier 3 of the market analysis):

1. **Prompts are markdown assembled at runtime**, never f-strings in Python. One shared file of
   mandatory rules (``prompts/SHARED.md``) plus one file per reviewer, concatenated into the
   system prompt. Reviewing a prompt then means reading a document, which is the only way prompt
   quality survives contact with a deadline.
2. **Everything from the pull request is fenced.** ``build_user_prompt`` wraps each block of
   user-controlled text in ``<untrusted_content source="…">`` and SHARED.md tells the model that
   what is inside is data. The text must already have passed ``core/sanitize.py`` (E15), which
   neutralises forged boundary tags; this module places the boundary, it does not police it.
3. **One reviewer failing is a degradation, not an outage.** The runner gathers every specialist
   under a semaphore and returns typed failures alongside the outputs, so the pipeline can record
   ``degradations:["specialist_bugs_failed"]`` and carry on with the rest (E23). Only *every*
   specialist failing is fatal, and that decision belongs to the pipeline, not here.

Ownership: T8. The pipeline (T9) chooses the client, the model and the concurrency bound; nothing
in this module reads config or touches the database.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path
from typing import Final, Protocol, runtime_checkable

from prguard.core.types import RiskTier, SpecialistOutput
from prguard.llm.client import LLMClient, LLMError
from prguard.llm.structured import StructuredOutputError, complete_structured

#: Where the runtime-assembled markdown lives (spec §4.3).
PROMPT_DIR: Final[Path] = Path(__file__).resolve().parent / "prompts"

#: The mandatory rules every reviewer and the coordinator are given.
SHARED_PROMPT: Final[str] = "SHARED"

#: How many specialists may be in flight at once by default (§11.2 assumption 10: four of them).
DEFAULT_MAX_CONCURRENCY: Final[int] = 4

_SECTION_SEPARATOR: Final[str] = "\n\n---\n\n"


class PromptNotFoundError(LLMError):
    """A prompt file was named but does not exist. Raised at assembly, never mid-review."""


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    """Return the markdown file ``prompts/<name>.md``, cached for the process lifetime."""
    path = PROMPT_DIR / f"{name}.md"
    if not path.is_file():
        available = sorted(item.stem for item in PROMPT_DIR.glob("*.md"))
        raise PromptNotFoundError(f"no prompt named {name!r} in {PROMPT_DIR}; have: {available}")
    return path.read_text(encoding="utf-8")


def system_prompt(agent: str) -> str:
    """The shared mandatory rules followed by one agent's own instructions."""
    return f"{load_prompt(SHARED_PROMPT)}{_SECTION_SEPARATOR}{load_prompt(agent)}"


@dataclass(frozen=True)
class ReviewTask:
    """The material S2 prepared, ready to be shown to a model.

    ``title``, ``description``, ``diff`` and ``file_context`` are user-controlled and **must
    already be sanitised** (E15) — they are fenced here, not cleaned here. ``supplied_files`` is
    the authoritative context set: a finding naming anything else is a hallucination and the
    coordinator drops it (§6.12).
    """

    repository: str
    pull_request_number: int
    title: str
    description: str
    risk_tier: RiskTier
    supplied_files: tuple[str, ...]
    diff: str
    file_context: str = ""
    conventions: str = ""
    truncation_note: str = ""


def fence_untrusted(source: str, body: str) -> str:
    """Wrap one block of user-controlled text in its boundary tags (E15).

    The tag name is deliberately the one ``core/sanitize.py`` neutralises inside the body, so a
    forged closing tag in a diff cannot end the fence early.
    """
    return f'<untrusted_content source="{source}">\n{body}\n</untrusted_content>'


def context_header(task: ReviewTask) -> str:
    """The trusted preamble: which pull request this is, and which paths exist."""
    paths = "\n".join(f"- {path}" for path in task.supplied_files)
    lines = [
        f"Repository: {task.repository}",
        f"Pull request: #{task.pull_request_number}",
        f"Risk tier: {task.risk_tier}",
        "",
        "Files supplied in context. These are the only paths `file_path` may name:",
        paths,
    ]
    if task.truncation_note:
        lines.append(f"\nContext note: {task.truncation_note}")
    return "\n".join(lines)


def untrusted_sections(task: ReviewTask) -> list[str]:
    """Every fenced block this task carries, empty ones omitted.

    An empty fence is worse than no fence: it teaches the model that the tags are decoration.
    """
    sections: list[str] = []
    metadata = "\n".join(
        part
        for part in (
            f"Title: {task.title}" if task.title else "",
            f"Description:\n{task.description}" if task.description else "",
        )
        if part
    )
    if metadata:
        sections.append(fence_untrusted("pr_metadata", metadata))
    if task.diff:
        sections.append(fence_untrusted("pr_diff", task.diff))
    if task.file_context:
        sections.append(fence_untrusted("file_bodies", task.file_context))
    if task.conventions:
        sections.append(fence_untrusted("repo_conventions", task.conventions))
    return sections


def build_user_prompt(task: ReviewTask, *, specialist: str) -> str:
    """Assemble one specialist's request: the trusted preamble, then the fenced evidence."""
    sections = [context_header(task), *untrusted_sections(task)]
    sections.append(
        f"\nReview this change as the `{specialist}` reviewer and return the single JSON object "
        "your instructions describe. No prose, no fences, no commentary. An empty findings list "
        "is a complete answer."
    )
    return "\n".join(sections)


@runtime_checkable
class Specialist(Protocol):
    """One review angle. Implementations must not retry, sleep, or touch the database."""

    name: str

    async def review(
        self,
        client: LLMClient,
        task: ReviewTask,
        *,
        model: str,
        max_tokens: int,
        temperature: float,
    ) -> SpecialistOutput:
        """Return this reviewer's structured output, or raise for the runner to classify."""
        ...


class PromptSpecialist:
    """A specialist that is entirely defined by its markdown file (§3 Tier 3).

    Adding a reviewer is adding a prompt and a registry entry — there is no per-specialist Python
    to write, which is the point: the review logic lives somewhere a reviewer can read it.
    """

    def __init__(self, name: str, *, prompt: str | None = None) -> None:
        self.name = name
        self.prompt_name = prompt or name

    def __repr__(self) -> str:
        return f"PromptSpecialist({self.name!r})"

    @property
    def system(self) -> str:
        return system_prompt(self.prompt_name)

    async def review(
        self,
        client: LLMClient,
        task: ReviewTask,
        *,
        model: str,
        max_tokens: int,
        temperature: float,
    ) -> SpecialistOutput:
        output = await complete_structured(
            client,
            model=model,
            system=self.system,
            prompt=build_user_prompt(task, specialist=self.name),
            schema=SpecialistOutput,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if output.specialist != self.name:
            # Attribution is ours, not the model's: a reviewer that mistypes its own name would
            # otherwise misfile its findings and its degradation.
            return replace(output, specialist=self.name)
        return output


@dataclass(frozen=True)
class SpecialistFailure:
    """One reviewer that did not return usable output. Persisted as a degradation (E23)."""

    specialist: str
    #: A ``structured.FailureReason`` where we got a response, else ``llm_error`` /
    #: ``unexpected_error``.
    reason: str
    detail: str = ""
    attempts: int = 0

    @property
    def degradation(self) -> str:
        """The exact string spec §7 E23 prescribes for ``review_runs.degradations``."""
        return f"specialist_{self.specialist}_failed"


@dataclass(frozen=True)
class SpecialistRunResult:
    """What S3 hands S4: the outputs that arrived and the reviewers that fell over."""

    outputs: tuple[SpecialistOutput, ...] = ()
    failures: tuple[SpecialistFailure, ...] = ()

    @property
    def degradations(self) -> tuple[str, ...]:
        return tuple(failure.degradation for failure in self.failures)

    @property
    def all_failed(self) -> bool:
        """Every reviewer failed — §8.1 makes this fatal (``LLM_UNAVAILABLE``) in the pipeline."""
        return not self.outputs and bool(self.failures)

    @property
    def finding_count(self) -> int:
        return sum(len(output.findings) for output in self.outputs)


async def run_specialists(
    specialists: Sequence[Specialist],
    *,
    client: LLMClient,
    task: ReviewTask,
    model: str,
    max_tokens: int,
    temperature: float,
    max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
) -> SpecialistRunResult:
    """Run every specialist concurrently, isolating failures (spec §4.1 S3, §8.1).

    Results keep the order of ``specialists`` regardless of which finished first, because the
    coordinator's input — and therefore the review — must not depend on scheduling.
    """
    semaphore = asyncio.Semaphore(max_concurrency)

    async def one(specialist: Specialist) -> SpecialistOutput | SpecialistFailure:
        async with semaphore:
            try:
                return await specialist.review(
                    client,
                    task,
                    model=model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except StructuredOutputError as error:
                return SpecialistFailure(
                    specialist=specialist.name,
                    reason=error.reason,
                    detail=str(error),
                    attempts=error.attempts,
                )
            except LLMError as error:
                return SpecialistFailure(
                    specialist=specialist.name,
                    reason="llm_error",
                    detail=f"{type(error).__name__}: {error}",
                )
            except Exception as error:
                # Deliberately broad, and deliberately not `BaseException`: a superseded run
                # (E3) cancels these tasks and that must propagate. Anything else is one
                # reviewer's problem, and three reviewers beat none.
                return SpecialistFailure(
                    specialist=specialist.name,
                    reason="unexpected_error",
                    detail=f"{type(error).__name__}: {error}",
                )

    settled = await asyncio.gather(*(one(specialist) for specialist in specialists))

    outputs = tuple(item for item in settled if isinstance(item, SpecialistOutput))
    failures = tuple(item for item in settled if isinstance(item, SpecialistFailure))
    return SpecialistRunResult(outputs=outputs, failures=failures)
