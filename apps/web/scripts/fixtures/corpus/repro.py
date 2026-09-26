"""Helpers for writing repro tests and describing how pytest reports them.

A repro is the file the proof generator writes (§4.6): a docstring stating the claim, the imports
it needs, optional helpers, and one test function. Test functions never take fixture arguments,
because pytest would print their ``repr`` (with a memory address) into the captured output, and
every call on a failing line takes literal arguments and is imported by name, so pytest's
``where`` lines are deterministic.

The failure shapes below are the ones pytest 9.1.1 was observed to print (``check_pytest_text.py``
re-runs the demo repros; the shapes were captured from live runs of minimal cases):

* ``assert f(1200, 'jpy') == 808`` → ``assert 0 == 808`` / `` +  where 0 = f(1200, 'jpy')``
* ``assert f('eur') is not None`` → ``assert None is not None`` / `` +  where None = f('eur')``
* ``assert f(False)`` → ``assert False`` / `` +  where False = f(False)``
* ``assert f('91') < 90`` → ``assert 91 < 90`` / `` +  where 91 = f('91')``
* an exception raised by the failing line itself — carets under the sub-expression
* ``with pytest.raises(X):`` — ``Failed: DID NOT RAISE X``, carets under ``pytest.raises(X)``,
  and the printed source stops at the ``with`` line

pytest strips ``AssertionError: `` from the first ``E`` line only when the explanation contains
no single quote, or contains both quote kinds.
"""

from __future__ import annotations

from corpus.model import FailureSpec, Proof


def repro_file(
    *,
    target: str,
    claim: str,
    imports: tuple[str, ...],
    test_name: str,
    body: tuple[str, ...],
    setup: tuple[str, ...] = (),
) -> str:
    """The whole test file. ``body`` lines are the test's statements, unindented."""
    lines = [f'"""Repro for a prguard finding in {target}.', "", f"Claim: {claim}", '"""', ""]
    lines.extend(imports)
    if setup:
        lines.extend(["", ""])
        lines.extend(setup)
    lines.extend(["", "", f"def {test_name}():"])
    lines.extend(f"    {statement}" if statement else "" for statement in body)
    return "\n".join(lines) + "\n"


def assertion(*message: str) -> FailureSpec:
    """An ``assert`` that pytest rewrote."""
    joined = "\n".join(message)
    keep_prefix = "'" in joined and '"' not in joined
    first, *rest = message
    return FailureSpec(
        exception="AssertionError",
        explanation=(("AssertionError: " if keep_prefix else "") + first, *rest),
    )


def eq_call(actual: str, expected: str, call: str) -> FailureSpec:
    """``assert f(x) == y``: the value, then pytest's ``where`` line naming the call."""
    return assertion(f"assert {actual} == {expected}", f" +  where {actual} = {call}")


def none_call(call: str) -> FailureSpec:
    """``assert f(x) is not None`` when ``f(x)`` returned ``None``."""
    return assertion("assert None is not None", f" +  where None = {call}")


def falsy_call(value: str, call: str) -> FailureSpec:
    """``assert f(x)`` when ``f(x)`` returned a falsy value."""
    return assertion(f"assert {value}", f" +  where {value} = {call}")


def not_call(value: str, call: str) -> FailureSpec:
    """``assert not f(x)`` when ``f(x)`` returned a truthy value: pytest explains the value."""
    return assertion(f"assert not {value}", f" +  where {value} = {call}")


def str_eq(left: str, right: str) -> FailureSpec:
    """``assert <expr> == 'right'`` between two short strings.

    pytest prints no ``where`` line for a string comparison, only the diff it builds with
    ``difflib.ndiff(right, left)`` — including ``?`` hint lines when the strings are similar —
    each line indented two spaces under a blank one.
    """
    import difflib

    diff = [line.rstrip("\n") for line in difflib.ndiff([right], [left])]
    return assertion(f"assert {left!r} == {right!r}", "  ", *(f"  {line}" for line in diff))


def cmp_call(actual: str, op: str, bound: str, call: str) -> FailureSpec:
    """``assert f(x) < n`` (or ``>``, ``<=``, ``>=``, ``!=``)."""
    return assertion(f"assert {actual} {op} {bound}", f" +  where {actual} = {call}")


def list_has_extra(item: str) -> FailureSpec:
    """``assert leaked == []`` where ``leaked`` holds one item."""
    return assertion(
        f"assert [{item}] == []", "  ", f"  Left contains one more item: {item}",
        "  Use -v to get more diff",
    )


def raised(exception: str, message: str, caret: str, *, line: str | None = None) -> FailureSpec:
    """An exception raised by the failing line itself; pytest underlines ``caret``."""
    return FailureSpec(
        exception=exception, explanation=(f"{exception}: {message}",), caret=caret, line=line
    )


def did_not_raise(exception: str) -> FailureSpec:
    return FailureSpec(
        exception="Failed",
        explanation=(f"Failed: DID NOT RAISE {exception}",),
        caret=f"pytest.raises({exception})",
        line="with pytest.raises(",
    )


def proof(
    kind: str,
    *,
    target: str,
    claim: str,
    imports: tuple[str, ...],
    test_name: str,
    body: tuple[str, ...],
    signal: str,
    failure: FailureSpec | None = None,
    setup: tuple[str, ...] = (),
    base_seconds: float = 0.31,
    head_seconds: float = 0.29,
    missing_module: str | None = None,
) -> Proof:
    return Proof(
        kind=kind,
        test_name=test_name,
        test_code=repro_file(
            target=target, claim=claim, imports=imports, test_name=test_name, body=body,
            setup=setup,
        ),
        signal=signal,
        failure=failure,
        base_seconds=base_seconds,
        head_seconds=head_seconds,
        missing_module=missing_module,
    )


def test_function_source(
    test_code: str, test_name: str, line: str | None = None
) -> tuple[tuple[str, ...], int]:
    """The failing entry pytest prints (``def`` → failing statement) and its line number.

    The failing statement is the function's last line, or the last line containing ``line``.
    """
    lines = test_code.splitlines()
    start = next(i for i, text in enumerate(lines) if text.startswith(f"def {test_name}("))
    end = start
    for index in range(start + 1, len(lines)):
        if lines[index].startswith("    "):
            end = index
        elif lines[index].strip():
            break
    if line is not None:
        end = max(i for i in range(start, end + 1) if line in lines[i])
    return tuple(lines[start : end + 1]), end + 1
