"""Deterministic verification of structured mathematical claims with SymPy.

Every reasoning step in a round carries a machine-readable `claim`. This module
checks each claim against an independently computed result. The LLM (if one was
used to draft an attempt) is never trusted as ground truth.

Verdicts:
  "valid"         SymPy proved the claim (symbolic simplification to zero /
                  exact set equality).
  "invalid"       The claim is false. Inequality is shown either symbolically
                  or by an exact counterexample point.
  "unverifiable"  We could not decide. Rounds containing such a claim before
                  the first invalid step are rejected by the pack builder.

Numeric substitution is only ever used to *disprove* equality (a single
counterexample is a proof of inequality). It is never used to claim equality.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import sympy as sp

x = sp.Symbol("x", real=True)
u = sp.Symbol("u", real=True)
_LOCALS = {"x": x, "u": u, "E": sp.E, "pi": sp.pi, "e": sp.E}

VALID, INVALID, UNVERIFIABLE = "valid", "invalid", "unverifiable"

# Rational sample points used only to search for counterexamples.
_PROBE_POINTS = [sp.Rational(n, 7) for n in (-19, -11, -5, 3, 8, 13, 23)]


@dataclass
class Verdict:
    status: str
    reason: str

    def as_dict(self) -> dict[str, str]:
        return {"status": self.status, "reason": self.reason}


def parse(expr: str) -> sp.Expr:
    """Parse an expression string from our own authored/validated content.

    Content packs are produced by this pipeline, not typed by end users, so
    sympify is acceptable here. User input in Home Mode goes through a
    separate restricted parser (Phase 3).
    """
    return sp.sympify(expr, locals=_LOCALS)


def exprs_equal(a: sp.Expr, b: sp.Expr, var: sp.Symbol = x) -> str:
    diff = sp.simplify(sp.expand(a - b))
    if diff == 0:
        return VALID
    # Exact counterexample search (proof of inequality, never of equality).
    for p in _PROBE_POINTS:
        try:
            val = sp.simplify(diff.subs(var, p))
        except Exception:  # pragma: no cover - defensive
            continue
        if val.is_number and val.is_finite and val != 0:
            return INVALID
    return UNVERIFIABLE


def numbers_equal(a: sp.Expr, b: sp.Expr) -> bool:
    return sp.simplify(sp.nsimplify(a) - sp.nsimplify(b)) == 0


def same_point_set(claimed: list[sp.Expr], truth: list[sp.Expr]) -> bool:
    if len(claimed) != len(truth):
        return False
    remaining = list(truth)
    for c in claimed:
        match = next((t for t in remaining if numbers_equal(c, t)), None)
        if match is None:
            return False
        remaining.remove(match)
    return True


def _interval(claim: dict[str, Any]) -> sp.Interval | None:
    iv = claim.get("interval")
    if iv is None:
        return None
    return sp.Interval(parse(iv[0]), parse(iv[1]))


def true_critical_points(f: sp.Expr, interval: sp.Interval | None) -> list[sp.Expr] | None:
    domain = interval if interval is not None else sp.S.Reals
    sols = sp.solveset(sp.Eq(sp.diff(f, x), 0), x, domain)
    if not isinstance(sols, sp.FiniteSet):
        return None
    return sorted(sols, key=lambda v: float(v))


def true_absolute_extremum(f: sp.Expr, interval: sp.Interval, kind: str):
    crit = true_critical_points(f, interval)
    if crit is None:
        return None
    candidates = [interval.start, interval.end, *crit]
    values = [(c, sp.nsimplify(sp.simplify(f.subs(x, c)))) for c in candidates]
    pick = max if kind == "max" else min
    best = pick(values, key=lambda cv: float(cv[1]))[1]
    locations = sorted(
        {c for c, v in values if numbers_equal(v, best)}, key=lambda v: float(v)
    )
    return best, locations, values


# --------------------------------------------------------------------------
# Claim checkers
# --------------------------------------------------------------------------

def check_equivalent(c: dict[str, Any]) -> Verdict:
    var = u if c.get("var") == "u" else x
    status = exprs_equal(parse(c["expr"]), parse(c["to"]), var)
    return Verdict(status, f"{c['expr']} vs {c['to']}")


def check_derivative(c: dict[str, Any]) -> Verdict:
    var = u if c.get("var") == "u" else x
    truth = sp.diff(parse(c["f"]), var)
    status = exprs_equal(parse(c["expr"]), truth, var)
    return Verdict(status, f"d/d{var} of {c['f']} is {sp.simplify(truth)}")


def check_composition(c: dict[str, Any]) -> Verdict:
    composed = parse(c["outer"]).subs(u, parse(c["inner"]))
    status = exprs_equal(composed, parse(c["f"]))
    return Verdict(status, f"outer∘inner = {composed}")


def check_critical_points(c: dict[str, Any]) -> Verdict:
    f = parse(c["f"])
    truth = true_critical_points(f, _interval(c))
    if truth is None:
        return Verdict(UNVERIFIABLE, "critical points are not a finite set")
    claimed = [parse(p) for p in c["points"]]
    ok = same_point_set(claimed, truth)
    return Verdict(VALID if ok else INVALID, f"true critical points: {truth}")


def check_evaluations(c: dict[str, Any]) -> Verdict:
    f = parse(c["f"])
    for xv, yv in c["pairs"]:
        actual = sp.simplify(f.subs(x, parse(xv)))
        if not numbers_equal(actual, parse(yv)):
            return Verdict(INVALID, f"f({xv}) = {actual}, not {yv}")
    return Verdict(VALID, "all evaluations exact")


def check_local_extrema(c: dict[str, Any]) -> Verdict:
    f = parse(c["f"])
    crit = true_critical_points(f, _interval(c))
    if crit is None:
        return Verdict(UNVERIFIABLE, "critical points are not a finite set")
    f2 = sp.diff(f, x, 2)
    maxima, minima = [], []
    for p in crit:
        s = sp.simplify(f2.subs(x, p))
        if s.is_negative:
            maxima.append(p)
        elif s.is_positive:
            minima.append(p)
        else:
            return Verdict(UNVERIFIABLE, f"second-derivative test inconclusive at {p}")
    ok = same_point_set([parse(p) for p in c.get("max", [])], maxima) and same_point_set(
        [parse(p) for p in c.get("min", [])], minima
    )
    return Verdict(VALID if ok else INVALID, f"local max {maxima}, local min {minima}")


def check_absolute_extremum(c: dict[str, Any]) -> Verdict:
    f = parse(c["f"])
    interval = _interval(c)
    if interval is None:
        return Verdict(UNVERIFIABLE, "absolute extremum needs a closed interval")
    res = true_absolute_extremum(f, interval, c["kind"])
    if res is None:
        return Verdict(UNVERIFIABLE, "critical points are not a finite set")
    best, locations, _ = res
    ok = numbers_equal(parse(c["value"]), best) and same_point_set(
        [parse(p) for p in c["at"]], locations
    )
    return Verdict(VALID if ok else INVALID, f"absolute {c['kind']} is {best} at {locations}")


CHECKERS = {
    "equivalent": check_equivalent,
    "derivative": check_derivative,
    "composition": check_composition,
    "critical_points": check_critical_points,
    "evaluations": check_evaluations,
    "local_extrema": check_local_extrema,
    "absolute_extremum": check_absolute_extremum,
}


def check_claim(claim: dict[str, Any]) -> Verdict:
    checker = CHECKERS.get(claim.get("type", ""))
    if checker is None:
        return Verdict(UNVERIFIABLE, f"unsupported claim type {claim.get('type')!r}")
    try:
        return checker(claim)
    except Exception as exc:  # malformed claim → never a definitive grade
        return Verdict(UNVERIFIABLE, f"checker error: {exc}")


def first_invalid_step(steps: list[dict[str, Any]]) -> tuple[int | None, list[Verdict]]:
    """Return (1-based index of first invalid step or None, all verdicts).

    Raises ValueError if an unverifiable claim appears before the first invalid
    one, because then we cannot be sure which step is the *first* error.
    """
    verdicts = [check_claim(s["claim"]) for s in steps]
    for i, v in enumerate(verdicts, start=1):
        if v.status == UNVERIFIABLE:
            raise ValueError(f"step {i} unverifiable: {v.reason}")
        if v.status == INVALID:
            return i, verdicts
    return None, verdicts
