"""S2 cross-file caller discovery — spec §4.1 S2, §4.4 `blast_radius`/`reachability`, §8.1.

The defect these tests exist for is a real one, traced from a live review: a `None` guard was
deleted from `apply_discount` in `app/billing.py`, three functions broke, and PRGuard named
only the one that happened to be inside the diff. `app/orders.py` was never fetched, so
`caller_count` was 0, so `blast_radius` and `reachability` were 0, so the finding scored below
`PROOF_MIN_SCORE` and was never even offered a repro. The scoring was right; the measurement
was taken over the wrong set of files.

So the obligations here are:

* a caller **outside the diff** is discovered, fetched, and kept;
* a file that is merely *near* the diff is fetched but **dropped** unless it really references
  a changed symbol — proximity buys a fetch, not a place in context;
* the search is bounded (`RELATED_FILES_MAX`) and **ranked before it is capped**, so the forty
  files kept are the forty nearest and not forty arbitrary ones;
* every failure degrades: the tree listing costs the whole search, one fetch costs one file,
  and neither raises.

Every byte comes from the committed corpus; nothing here reaches the network.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import respx

from prguard.core.delivery.github_client import GitHubClient
from prguard.core.related import (
    DEGRADATION_RELATED_UNFETCHABLE,
    DEGRADATION_TREE_UNAVAILABLE,
    changed_symbols,
    discover_related_files,
    rank_candidates,
)
from tests.fixtures.loader import repo_tree
from tests.integration.conftest import (
    API_BASE,
    HEAD_SHA,
    OWNER,
    REPO,
    contents_response,
    make_github_client,
    tree_response,
)

#: The two files PR 42 actually changes.
CHANGED = ("app/billing.py", "app/checkout.py")

TREES_URL = f"/repos/{OWNER}/{REPO}/git/trees/{HEAD_SHA}"


def head_body(path: str, tree: str = "buggy_calc") -> str:
    return (repo_tree(tree, "head") / path).read_text(encoding="utf-8")


def changed_sources(tree: str = "buggy_calc") -> dict[str, str]:
    """The head bodies S2 fetched for the diff — the only place search terms come from."""
    return {path: head_body(path, tree) for path in CHANGED}


def mock_repo(router: respx.Router, *, tree: str = "buggy_calc") -> None:
    """The one tree listing plus a contents route for every committed file."""
    router.get(TREES_URL).mock(return_value=tree_response(tree))
    root = repo_tree(tree, "head")
    for item in sorted(root.rglob("*")):
        if not item.is_file() or "__pycache__" in item.parts:
            continue
        path = str(item.relative_to(root))
        router.get(f"/repos/{OWNER}/{REPO}/contents/{path}").mock(
            return_value=contents_response(tree, path)
        )


@pytest.fixture
def github_mock() -> Any:
    with respx.mock(base_url=API_BASE, assert_all_called=False) as router:
        yield router


async def discover(client: GitHubClient, **overrides: Any) -> Any:
    kwargs: dict[str, Any] = {
        "owner": OWNER,
        "repo": REPO,
        "ref": HEAD_SHA,
        "changed_paths": CHANGED,
        "sources": changed_sources(),
    }
    kwargs.update(overrides)
    return await discover_related_files(client, **kwargs)


# ---------------------------------------------------------------------------
# The defect itself
# ---------------------------------------------------------------------------


async def test_a_caller_outside_the_diff_is_discovered_and_fetched(
    github_mock: respx.Router,
) -> None:
    """`app/orders.py` calls `apply_discount` and PR 42 never mentions it. Find it anyway."""
    mock_repo(github_mock)

    async with make_github_client() as client:
        found = await discover(client)

    assert "app/orders.py" in found.contents
    assert "apply_discount" in found.contents["app/orders.py"]
    assert found.degradations == ()


async def test_files_in_the_diff_are_never_candidates(github_mock: respx.Router) -> None:
    """They are already in context; fetching them twice is a wasted request per file."""
    mock_repo(github_mock)

    async with make_github_client() as client:
        found = await discover(client)

    assert not set(found.contents) & set(CHANGED)
    assert not set(found.considered) & set(CHANGED)


async def test_a_nearby_file_that_references_nothing_is_dropped(
    github_mock: respx.Router,
) -> None:
    """`app/receipts.py` is a sibling of the diff and mentions none of its symbols.

    Proximity is why it was fetched; the reference test is why it is not kept. Handing the
    model a file with no bearing on the change is budget spent to make the diff harder to see.
    """
    mock_repo(github_mock)

    async with make_github_client() as client:
        found = await discover(client)

    assert "app/receipts.py" in found.considered, "guard: it really was a candidate"
    assert "app/receipts.py" not in found.contents


async def test_files_of_another_language_are_never_fetched(github_mock: respx.Router) -> None:
    """A Python symbol is not referenced from `pyproject.toml`, and the fetch is not free."""
    mock_repo(github_mock)

    async with make_github_client() as client:
        found = await discover(client)

    assert not [path for path in found.considered if not path.endswith(".py")]


async def test_a_test_file_that_exercises_a_changed_symbol_is_kept(
    github_mock: respx.Router,
) -> None:
    """§4.4 `coverage_gap` is measured over the test files in context, and there were none."""
    mock_repo(github_mock)

    async with make_github_client() as client:
        found = await discover(client)

    assert "tests/test_billing.py" in found.contents


async def test_an_excluded_class_is_never_a_candidate() -> None:
    """E9 keeps vendored and generated paths out of context; they are not callers either."""
    tree = (
        "app/orders.py",
        "vendor/billing_shim.py",
        "third_party/apply_discount.py",
        "build/app/orders.py",
        "app/schema_pb2.py",
    )

    async with make_github_client() as client:
        with respx.mock(base_url=API_BASE, assert_all_called=False) as router:
            router.get(TREES_URL).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "sha": HEAD_SHA,
                        "truncated": False,
                        "tree": [{"path": path, "type": "blob"} for path in tree],
                    },
                )
            )
            router.get(f"/repos/{OWNER}/{REPO}/contents/app/orders.py").mock(
                return_value=contents_response("buggy_calc", "app/orders.py")
            )
            found = await discover(client)

    assert found.considered == ("app/orders.py",)


# ---------------------------------------------------------------------------
# Bounded, ranked, reproducible
# ---------------------------------------------------------------------------


def test_candidates_are_ranked_nearest_first() -> None:
    """Same package beats same repo, and the shortest path breaks the tie — never tree order."""
    candidates = [
        "services/reporting/export.py",
        "app/orders.py",
        "tests/test_billing.py",
        "app/a_much_longer_module_name.py",
    ]

    ranked = rank_candidates(candidates, changed_paths=CHANGED)

    assert ranked[0] == "app/orders.py"
    assert ranked.index("app/a_much_longer_module_name.py") < ranked.index(
        "services/reporting/export.py"
    )
    assert rank_candidates(list(reversed(candidates)), changed_paths=CHANGED) == ranked


async def test_the_cap_bites_after_the_ranking_not_before(github_mock: respx.Router) -> None:
    """A monorepo must not fan out — but the files it keeps have to be the nearest ones."""
    mock_repo(github_mock)

    async with make_github_client() as client:
        found = await discover(client, max_files=1)

    assert found.considered == ("app/orders.py",)
    assert "tests/test_billing.py" in found.skipped
    assert set(found.contents) == {"app/orders.py"}


async def test_a_max_of_zero_turns_the_search_off_entirely(github_mock: respx.Router) -> None:
    """The opt-out an operator with a very large repository needs, without a code change."""
    route = github_mock.get(TREES_URL).mock(return_value=tree_response("buggy_calc"))

    async with make_github_client() as client:
        found = await discover(client, max_files=0)

    assert route.call_count == 0
    assert found.contents == {}


async def test_the_same_repository_discovers_the_same_files_every_time(
    github_mock: respx.Router,
) -> None:
    """AC-26: a review is reproducible or it is not worth arguing with."""
    mock_repo(github_mock)

    async with make_github_client() as client:
        first = await discover(client)
        second = await discover(client)

    assert first.considered == second.considered
    assert list(first.contents) == list(second.contents)


# ---------------------------------------------------------------------------
# §8.1 — degrade, never fail
# ---------------------------------------------------------------------------


async def test_a_failed_tree_listing_costs_the_search_and_nothing_else(
    github_mock: respx.Router,
) -> None:
    github_mock.get(TREES_URL).mock(return_value=httpx.Response(403, json={"message": "nope"}))

    async with make_github_client() as client:
        found = await discover(client)

    assert found.contents == {}
    assert found.degradations == (DEGRADATION_TREE_UNAVAILABLE,)
    assert found.tree_error is not None and "Forbidden" in found.tree_error


async def test_one_unreadable_candidate_costs_that_candidate_only(
    github_mock: respx.Router,
) -> None:
    mock_repo(github_mock)
    github_mock.get(f"/repos/{OWNER}/{REPO}/contents/tests/test_billing.py").mock(
        return_value=httpx.Response(404, json={"message": "Not Found"})
    )

    async with make_github_client() as client:
        found = await discover(client)

    assert "app/orders.py" in found.contents
    assert list(found.failures) == ["tests/test_billing.py"]
    assert DEGRADATION_RELATED_UNFETCHABLE in found.degradations


async def test_no_client_is_an_empty_search_not_an_exception() -> None:
    found = await discover_related_files(
        None,
        owner=OWNER,
        repo=REPO,
        ref=HEAD_SHA,
        changed_paths=CHANGED,
        sources=changed_sources(),
    )

    assert found.contents == {} and found.degradations == ()


async def test_a_diff_with_no_readable_symbols_never_asks_for_the_tree(
    github_mock: respx.Router,
) -> None:
    """Nothing to search for is not a degradation — it is a request worth not making."""
    route = github_mock.get(TREES_URL).mock(return_value=tree_response("buggy_calc"))

    async with make_github_client() as client:
        found = await discover(client, changed_paths=("docs/README.md",), sources={})

    assert route.call_count == 0
    assert found.contents == {}


# ---------------------------------------------------------------------------
# Search terms
# ---------------------------------------------------------------------------


def test_changed_symbols_are_the_names_another_module_would_write() -> None:
    sources = {"app/billing.py": head_body("app/billing.py")}

    symbols = changed_symbols(sources)

    assert "apply_discount" in symbols and "Promotion" in symbols
    assert "Promotion.__init__" not in symbols, "a caller writes the leaf, not the qualified name"
    assert "__init__" not in symbols, "matches every class in the repository"
    assert symbols == tuple(sorted(symbols)), "deterministic order (AC-26)"


def test_an_unparsable_file_contributes_no_symbols_and_does_not_raise() -> None:
    """E28: a syntax error at head costs precision, never the run."""
    assert changed_symbols({"app/broken.py": "def oops(:\n"}) == ()


def test_only_python_bodies_are_mined_for_symbols() -> None:
    """The AST is the only symbol source this product has (§4.4, E28) and it speaks Python."""
    assert changed_symbols({"web/app.ts": "export function applyDiscount() {}"}) == ()
