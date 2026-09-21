"""S2 — the files *outside* the diff that call what the diff changed. Spec §4.1 S2, §4.4, §8.1.

§4.4 defines ``blast_radius`` as ``min(1.0, caller_count / 10)`` where ``caller_count`` is
"references to the symbol found across fetched context files", and ``reachability`` turns on
whether anything references the symbol at all. Fetch only the paths that appear in the diff and
both inputs are measured over a set that, by construction, excludes almost every caller: delete
a ``None`` guard from ``apply_discount`` in ``app/billing.py`` and the call sites that break
live in ``app/orders.py``, which the diff never mentions. The scoring functions are right; they
were being handed zeros.

This module closes that gap with one extra read and a strict filter:

1. **One tree listing** at head (:meth:`GitHubClient.list_tree`), not one per file.
2. **Filter.** Same-language source files only, never a path already in the diff, and never one
   E9 would drop anyway — a ``vendor/`` copy of the same function is not a caller anybody has
   to fix (:func:`context.classify`).
3. **Rank, then cap.** Nearest first — files sharing the most leading path segments with a
   changed file, then the shortest path, then the path itself — and only then cut to
   ``RELATED_FILES_MAX``. A monorepo must not be able to fan one review out into thousands of
   requests, and the ranking has to bite *before* the cap does or the 40 files we keep are an
   accident of tree order. Every tie breaks on the path, so the same PR discovers the same
   files on every run (AC-26).
4. **Prove the reference.** A candidate is kept only if its body actually mentions one of the
   changed symbols. Being near the diff gets a file fetched; referencing it is what gets the
   file kept.

**Degrading, never fatal (§8.1).** The tree call failing costs the whole search and is recorded
as :data:`DEGRADATION_TREE_UNAVAILABLE`; one fetch failing costs that one file. Neither ends a
run — a review with a conservative blast radius is worth far more than no review.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from prguard.core.context import classify, is_excluded, language_of, symbols_in
from prguard.core.delivery.github_client import GitHubClient, GitHubError

#: §4.8 default for ``RELATED_FILES_MAX``, repeated here so a caller can discover without a
#: ``Settings`` object — the same convention ``context.DEFAULT_MAX_FILES`` follows.
DEFAULT_RELATED_FILES_MAX: Final[int] = 40

#: How many candidate bodies may be in flight at once. The listing is one request; the fetches
#: are up to ``RELATED_FILES_MAX`` of them, and GitHub's secondary rate limit is the reason
#: this is a semaphore rather than a bare ``gather`` (§8.1, E27).
DEFAULT_FETCH_CONCURRENCY: Final[int] = 8

#: `review_runs.degradations` — the tree listing failed, so no caller outside the diff could be
#: found. Severity still scores; it scores on the diff alone and says so.
DEGRADATION_TREE_UNAVAILABLE: Final[str] = "context_repo_tree_unavailable"

#: `review_runs.degradations` — at least one candidate body could not be read. Deliberately not
#: `context_file_unfetchable`: that one means a file *in the diff* is missing from context,
#: which is a materially worse outcome than a caller we did not get to read.
DEGRADATION_RELATED_UNFETCHABLE: Final[str] = "context_related_file_unfetchable"


@dataclass(frozen=True)
class RelatedFiles:
    """What the search found, what it could not read, and what it had to leave out."""

    contents: Mapping[str, str] = field(default_factory=dict)
    failures: Mapping[str, str] = field(default_factory=dict)
    #: The ranked candidates that were actually fetched, cap applied.
    considered: tuple[str, ...] = ()
    #: Candidates the ``RELATED_FILES_MAX`` cap cut before they were fetched.
    skipped: tuple[str, ...] = ()
    #: Why the tree listing produced nothing, when that is what happened.
    tree_error: str | None = None

    @property
    def paths(self) -> tuple[str, ...]:
        return tuple(self.contents)

    @property
    def degradations(self) -> tuple[str, ...]:
        keys: list[str] = []
        if self.tree_error:
            keys.append(DEGRADATION_TREE_UNAVAILABLE)
        if self.failures:
            keys.append(DEGRADATION_RELATED_UNFETCHABLE)
        return tuple(keys)


def changed_symbols(sources: Mapping[str, str]) -> tuple[str, ...]:
    """The names the changed files define, spelled the way another module would reference them.

    :func:`context.symbols_in` returns qualified names (``Cart.add``); a caller writes the leaf
    (``add``), so that is what a cross-file search looks for. Private and dunder names are left
    out: ``_helper`` is not referenced from another module by convention, and ``__init__``
    matches every class in the repository, which would turn the search into a repo download.

    An unparsable file contributes nothing and raises nothing — E28 is a degradation here too.
    """
    found: set[str] = set()
    for path, body in sources.items():
        if language_of(path) != "python":
            continue
        for qualified in symbols_in(body):
            leaf = qualified.rsplit(".", 1)[-1]
            if not leaf.startswith("_"):
                found.add(leaf)
    return tuple(sorted(found))


def rank_candidates(paths: Sequence[str], *, changed_paths: Sequence[str]) -> tuple[str, ...]:
    """Order candidates nearest-first, so the cap keeps the files most likely to be callers.

    "Nearest" is how many leading path segments a candidate's directory shares with some
    changed file's directory: ``app/orders.py`` beats ``services/reporting/export.py`` for a
    change in ``app/billing.py``, because a package's own siblings are where its callers are.
    Ties fall to the shortest path and then to the path itself — never to tree order, which
    would make a capped search irreproducible.
    """
    directories = [_directory(path) for path in changed_paths]

    def key(path: str) -> tuple[int, int, str]:
        segments = _directory(path)
        shared = max((_shared_prefix(segments, other) for other in directories), default=0)
        return (-shared, len(path), path)

    return tuple(sorted(paths, key=key))


async def discover_related_files(
    client: GitHubClient | None,
    *,
    owner: str,
    repo: str,
    ref: str,
    changed_paths: Sequence[str],
    sources: Mapping[str, str],
    max_files: int = DEFAULT_RELATED_FILES_MAX,
    concurrency: int = DEFAULT_FETCH_CONCURRENCY,
) -> RelatedFiles:
    """Find and fetch the files outside the diff that reference a changed symbol.

    ``sources`` is the head body of each changed file S2 managed to fetch — the symbols come
    from there, so a file whose body failed to arrive simply contributes no search terms.
    ``max_files`` of zero or less turns the search off entirely, which is how an operator with
    a very large monorepo opts out without a code change.
    """
    symbols = changed_symbols(sources)
    if client is None or not symbols or max_files <= 0:
        return RelatedFiles()

    try:
        tree = await client.list_tree(owner, repo, ref=ref)
    except GitHubError as error:
        return RelatedFiles(tree_error=f"{type(error).__name__}: {error.github_message}")

    ranked = rank_candidates(
        _candidates(tree, changed_paths=changed_paths, sources=sources),
        changed_paths=changed_paths,
    )
    considered, skipped = ranked[:max_files], ranked[max_files:]

    fetched, failures = await _fetch_all(
        client, owner=owner, repo=repo, ref=ref, paths=considered, concurrency=concurrency
    )
    reference = _reference_pattern(symbols)
    return RelatedFiles(
        contents={path: body for path, body in fetched.items() if reference.search(body)},
        failures=failures,
        considered=considered,
        skipped=skipped,
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _candidates(
    tree: Sequence[str], *, changed_paths: Sequence[str], sources: Mapping[str, str]
) -> tuple[str, ...]:
    """Every tree path that could plausibly reference a changed symbol, unranked."""
    languages = {
        language_of(path) for path in sources if language_of(path) != "unknown"
    }
    already = set(changed_paths)
    return tuple(
        path
        for path in tree
        if path not in already
        and language_of(path) in languages
        and not is_excluded(classify(path))
    )


async def _fetch_all(
    client: GitHubClient,
    *,
    owner: str,
    repo: str,
    ref: str,
    paths: Sequence[str],
    concurrency: int,
) -> tuple[dict[str, str], dict[str, str]]:
    """Fetch every candidate body under a semaphore. A failure costs that path only (§8.1)."""
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def fetch(path: str) -> tuple[str, str | None, str | None]:
        async with semaphore:
            try:
                return (path, await client.get_file_contents(owner, repo, path, ref=ref), None)
            except GitHubError as error:
                return (path, None, f"{type(error).__name__}: {error.github_message}")

    results = await asyncio.gather(*(fetch(path) for path in paths))
    contents = {path: body for path, body, _ in results if body is not None}
    failures = {path: reason for path, _, reason in results if reason is not None}
    return contents, failures


def _reference_pattern(symbols: Sequence[str]) -> re.Pattern[str]:
    """One alternation over every changed symbol — the same word-boundary rule §4.4 counts."""
    return re.compile(r"\b(?:" + "|".join(re.escape(symbol) for symbol in symbols) + r")\b")


def _directory(path: str) -> tuple[str, ...]:
    return tuple(part for part in path.split("/")[:-1] if part)


def _shared_prefix(left: Sequence[str], right: Sequence[str]) -> int:
    shared = 0
    for one, other in zip(left, right, strict=False):
        if one != other:
            break
        shared += 1
    return shared


__all__ = [
    "DEFAULT_FETCH_CONCURRENCY",
    "DEFAULT_RELATED_FILES_MAX",
    "DEGRADATION_RELATED_UNFETCHABLE",
    "DEGRADATION_TREE_UNAVAILABLE",
    "RelatedFiles",
    "changed_symbols",
    "discover_related_files",
    "rank_candidates",
]
