"""The verified Calculus question bank.

Each question is answered by typing (graded exactly in the browser) and also has
a multiple-choice version for live class quizzes. Every wrong option is built
from a specific common mistake and SymPy confirms it really is wrong.

Students type their own answers, which are graded offline in the browser by
frontend/src/lib/mathcheck.ts. That checker does exact arithmetic over the
rationals on polynomials and powers of x (Laurent polynomials), so it can
*prove* equality for that class. Every exercise here is therefore chosen so its
answer lies in that class, and this module verifies that with SymPy before the
exercise is published.

It also writes test vectors (student inputs + SymPy's verdict) that the
frontend test-suite replays against mathcheck.ts, so the two checkers are
cross-validated.
"""
from __future__ import annotations

from typing import Any

import sympy as sp

import hashlib
import random

from .common import L
from .verify import parse, true_absolute_extremum, true_critical_points, x


class NotSupported(ValueError):
    pass


def laurent_coeffs(e: sp.Expr) -> dict[str, str]:
    """Exact {exponent: coefficient} map; raises if e is not a rational-coefficient
    Laurent polynomial in x (which the browser checker could not verify)."""
    e = sp.expand(e)
    out: dict[str, str] = {}
    for term in sp.Add.make_args(e):
        coeff, rest = term.as_independent(x)
        if rest == 1:
            k = 0
        elif rest == x:
            k = 1
        elif rest.is_Pow and rest.base == x and rest.exp.is_Integer:
            k = int(rest.exp)
        else:
            raise NotSupported(f"term {term} is not c*x^k")
        if not coeff.is_Rational:
            raise NotSupported(f"coefficient {coeff} is not rational")
        key = str(k)
        out[key] = str(sp.Rational(out.get(key, 0)) + coeff)
    return {k: v for k, v in out.items() if sp.Rational(v) != 0}


def rational(v: sp.Expr) -> str:
    v = sp.nsimplify(v)
    if not v.is_Rational:
        raise NotSupported(f"{v} is not rational")
    return str(v)


U = sp.Symbol("u", real=True)


def _rng(eid: str) -> random.Random:
    return random.Random(int(hashlib.sha256(eid.encode()).hexdigest(), 16))


def _finish_mcq(eid: str, prompt: str, truth_tex: str, distractors: list[tuple[str, str]]) -> dict[str, Any]:
    """distractors: (latex, mistake label). Needs at least 3; shuffled deterministically."""
    if len(distractors) < 3:
        raise ValueError(f"{eid}: only {len(distractors)} verified wrong options")
    opts = [(truth_tex, None)] + distractors[:3]
    order = list(range(4))
    _rng(eid).shuffle(order)
    return {"prompt": prompt, "options": [opts[i][0] for i in order],
            "labels": [opts[i][1] for i in order], "correct": order.index(0)}


def _neq(a: sp.Expr, b: sp.Expr) -> bool:
    return sp.simplify(sp.expand(a - b)) != 0


def _expr_mcq(eid: str, F: sp.Expr, d: sp.Expr, chain: tuple[str, str] | None) -> dict[str, Any]:
    cands: list[tuple[sp.Expr, str]] = []
    if chain:
        O, I = parse(chain[0]), parse(chain[1])
        dO = sp.diff(O, parse("u"))
        cands.append((dO.subs(parse("u"), I), "Forgot to multiply by the inner function's derivative"))
        cands.append((dO.subs(parse("u"), I) * I, "Multiplied by the inner function instead of its derivative"))
        cands.append((O.subs(parse("u"), I) * sp.diff(I, x), "Didn't differentiate the outer function"))
    terms = sp.Add.make_args(sp.expand(F))
    kept = sum((t.as_coeff_exponent(x)[0] * t.as_coeff_exponent(x)[1] * x ** t.as_coeff_exponent(x)[1] for t in terms), sp.Integer(0))
    cands.append((kept, "Power rule: forgot to lower the exponent"))
    if any(t.as_coeff_exponent(x)[1] < 0 for t in terms):
        neg = sum((c * n * x ** (n + 1 if n < 0 else n - 1) for c, n in (t.as_coeff_exponent(x) for t in terms)), sp.Integer(0))
        cands.append((neg, "Power rule applied incorrectly to a negative exponent"))
    lead = max(terms, key=lambda t: t.as_coeff_exponent(x)[1])
    cands.append((d - 2 * sp.diff(lead, x), "Sign error in one term"))
    cands.append((2 * d, "Arithmetic error with the coefficients"))
    chosen: list[tuple[str, str]] = []
    kept_exprs: list[sp.Expr] = [d]
    for e, label in cands:
        if all(_neq(e, k) for k in kept_exprs):
            kept_exprs.append(e)
            chosen.append((f"f'(x) = {sp.latex(e)}", label))
    return _finish_mcq(eid, "Which of these is f′(x)?", f"f'(x) = {sp.latex(d)}", chosen)


def _points_mcq(eid: str, F: sp.Expr, crit: list[sp.Expr]) -> dict[str, Any]:
    tex = lambda ps: ", ".join(f"x = {L(p)}" for p in sorted(ps, key=float))
    truth = frozenset(crit)
    cands: list[tuple[frozenset, str]] = []
    roots = [r for r in sp.solveset(sp.Eq(F, 0), x, sp.S.Reals) if r.is_Rational] if isinstance(sp.solveset(sp.Eq(F, 0), x, sp.S.Reals), sp.FiniteSet) else []
    if roots:
        cands.append((frozenset(roots), "Solved f(x) = 0 instead of f′(x) = 0"))
    cands.append((frozenset(-p for p in crit), "Sign error when solving f′(x) = 0"))
    if len(crit) > 1:
        cands.append((frozenset(crit[:-1]), "Missed one of the solutions"))
    cands.append((frozenset([*crit, max(crit) + 1]), "Included a value where f′(x) ≠ 0"))
    cands.append((frozenset(p + 1 for p in crit), "Factoring error"))
    seen = {truth}
    chosen = []
    for c, label in cands:
        if c and c not in seen and all(p.is_Rational for p in c):
            seen.add(c)
            chosen.append((tex(c), label))
    return _finish_mcq(eid, "Which list gives all the critical points of f?", tex(crit), chosen)


def _extremum_mcq(eid: str, F: sp.Expr, a: int, b: int, kind: str, best, locs, values) -> dict[str, Any]:
    word = "maximum" if kind == "max" else "minimum"
    tex = lambda v, at: f"\\text{{absolute {word} }} = {L(v)} \\text{{ at }} " + ", ".join(f"x = {L(p)}" for p in sorted(at, key=float))
    pick = max if kind == "max" else min
    other = min if kind == "max" else max
    crit_in = [c for c, _ in values if c not in (a, b)]
    cands = []
    if crit_in:
        v = pick((F.subs(x, c) for c in crit_in), key=float)
        cands.append((v, [c for c in crit_in if F.subs(x, c) == v], "Forgot to evaluate the interval endpoints"))
    ov = other((v for _, v in values), key=float)
    cands.append((ov, [c for c, v in values if v == ov], f"Found the {'minimum' if kind == 'max' else 'maximum'} instead"))
    alt = [c for c, _ in values if c not in locs]
    if alt:
        cands.append((best, [alt[0]], "Right value, wrong location"))
    allcrit = true_critical_points(F, None) or []
    outside = [c for c in allcrit if not a <= c <= b]
    if outside:
        v = pick([F.subs(x, c) for c in outside] + [v for _, v in values], key=float)
        cands.append((v, [c for c in outside + [c for c, _ in values] if F.subs(x, c) == v][:1], "Used a critical point outside the interval"))
    cands.append((best + (1 if kind == "max" else -1), locs, "Arithmetic error when evaluating f"))
    seen = {(best, frozenset(locs))}
    chosen = []
    for v, at, label in cands:
        key = (sp.nsimplify(v), frozenset(at))
        if at and key not in seen:
            seen.add(key)
            chosen.append((tex(v, at), label))
    return _finish_mcq(eid, f"What is the absolute {word} of f on the interval, and where?", tex(best, locs), chosen)


def ex_derivative(eid: str, topic: str, f: str, difficulty: int, hint: str, solution: list[tuple[str, str]],
                  chain: tuple[str, str] | None = None) -> dict[str, Any]:
    F = parse(f)
    d = sp.diff(F, x)
    return {
        "id": eid, "topic": topic, "difficulty": difficulty,
        "prompt": "Find f′(x). Type your answer in terms of x.",
        "latex": f"f(x) = {L(F) if topic != 'chain-rule' else sp.latex(F)}",
        "answer": {"kind": "expression", "coeffs": laurent_coeffs(d)},
        "answer_latex": f"f'(x) = {sp.latex(d)}",
        "input_help": "Use ^ for powers and * or nothing for multiplication, e.g. 12x^3 - 6x^(-4) or 8(2x+3)^3.",
        "hint": hint,
        "solution": [{"text": t, "latex": l} for t, l in solution] + [
            {"text": "Answer.", "latex": f"f'(x) = {sp.latex(d)}"}],
        "mcq": _expr_mcq(eid, F, d, chain),
        "_truth": d,
    }


def ex_points(eid: str, f: str, difficulty: int, hint: str) -> dict[str, Any]:
    F = parse(f)
    d = sp.diff(F, x)
    crit = true_critical_points(F, None)
    pts = ", ".join(f"x = {L(p)}" for p in crit)
    return {
        "id": eid, "topic": "critical-points", "difficulty": difficulty,
        "prompt": "Find every critical point of f. List the x-values, separated by commas.",
        "latex": f"f(x) = {sp.latex(F)}",
        "answer": {"kind": "points", "values": [rational(p) for p in crit]},
        "answer_latex": pts,
        "input_help": "Separate values with commas, e.g. -1, 3. Fractions like 2/3 are fine.",
        "hint": hint,
        "solution": [
            {"text": "Differentiate.", "latex": f"f'(x) = {sp.latex(d)} = {sp.latex(sp.factor(d))}"},
            {"text": "Set f′(x) = 0 and solve.", "latex": pts},
        ],
        "mcq": _points_mcq(eid, F, crit),
        "_truth": crit,
    }


def ex_extremum(eid: str, f: str, a: int, b: int, kind: str, difficulty: int, hint: str) -> dict[str, Any]:
    F = parse(f)
    d = sp.diff(F, x)
    best, locs, values = true_absolute_extremum(F, sp.Interval(a, b), kind)
    crit_in = true_critical_points(F, sp.Interval(a, b))
    word = "maximum" if kind == "max" else "minimum"
    cands = sorted({sp.Integer(a), sp.Integer(b), *crit_in}, key=float)
    evals = ",\\; ".join(f"f({L(c)}) = {L(sp.nsimplify(F.subs(x, c)))}" for c in cands)
    at = ", ".join(f"x = {L(p)}" for p in locs)
    return {
        "id": eid, "topic": "closed-interval", "difficulty": difficulty,
        "prompt": f"Find the absolute {word} of f on the interval, and every x where it happens.",
        "latex": f"f(x) = {sp.latex(F)},\\quad x \\in [{a},\\,{b}]",
        "answer": {"kind": "extremum", "extremum": kind, "value": rational(best), "at": [rational(p) for p in locs]},
        "answer_latex": f"\\text{{absolute {word} }} = {L(best)} \\text{{ at }} {at}",
        "input_help": "Enter the value, then the x-value(s). Separate several x-values with commas.",
        "hint": hint,
        "solution": [
            {"text": "Differentiate.", "latex": f"f'(x) = {sp.latex(d)} = {sp.latex(sp.factor(d))}"},
            {"text": f"Critical points inside [{a}, {b}].", "latex": ", ".join(f"x = {L(p)}" for p in crit_in) or "\\text{none}"},
            {"text": "Evaluate at the critical points and both endpoints.", "latex": evals},
            {"text": "Compare.", "latex": f"\\text{{absolute {word} }} = {L(best)} \\text{{ at }} {at}"},
        ],
        "mcq": _extremum_mcq(eid, F, a, b, kind, best, locs, values),
        "_truth": (best, locs, values),
    }


def all_exercises() -> list[dict[str, Any]]:
    E: list[dict[str, Any]] = []
    neg = "Rewrite each fraction as a power of x first, e.g. 2/x^3 = 2x^(-3)."
    E.append(ex_derivative("yt-der-01", "derivatives", "3*x**4 + 2/x**3 - 5*x", 1, neg,
                           [("Rewrite as powers of x.", "f(x) = 3x^{4} + 2x^{-3} - 5x"),
                            ("Power rule on each term.", "12x^{3} - 6x^{-4} - 5")]))
    E.append(ex_derivative("yt-der-02", "derivatives", "x**5 - 4/x + 7", 1, neg,
                           [("Rewrite as powers of x.", "f(x) = x^{5} - 4x^{-1} + 7"),
                            ("Power rule; the constant 7 differentiates to 0.", "5x^{4} + 4x^{-2}")]))
    E.append(ex_derivative("yt-der-03", "derivatives", "2*x**3 - 6/x**2 + x", 2, neg,
                           [("Rewrite as powers of x.", "f(x) = 2x^{3} - 6x^{-2} + x"),
                            ("Power rule on each term.", "6x^{2} + 12x^{-3} + 1")]))
    E.append(ex_derivative("yt-der-04", "derivatives", "5*x**2 + 3/x**4", 2, neg,
                           [("Rewrite as powers of x.", "f(x) = 5x^{2} + 3x^{-4}"),
                            ("Power rule on each term.", "10x - 12x^{-5}")]))
    ch = "Name the inner function u, differentiate the outside, then multiply by du/dx."
    E.append(ex_derivative("yt-chn-01", "chain-rule", "(2*x + 3)**4", 1, ch, chain=("u**4", "2*x + 3"), solution=
                           [("Outer u^4, inner u = 2x + 3.", "\\frac{d}{du}u^{4} = 4u^{3},\\quad \\frac{du}{dx} = 2")]))
    E.append(ex_derivative("yt-chn-02", "chain-rule", "(x**2 + 1)**3", 2, ch, chain=("u**3", "x**2 + 1"), solution=
                           [("Outer u^3, inner u = x^2 + 1.", "\\frac{d}{du}u^{3} = 3u^{2},\\quad \\frac{du}{dx} = 2x")]))
    E.append(ex_derivative("yt-chn-03", "chain-rule", "(5 - 3*x)**5", 2, ch, chain=("u**5", "5 - 3*x"), solution=
                           [("Outer u^5, inner u = 5 − 3x.", "\\frac{d}{du}u^{5} = 5u^{4},\\quad \\frac{du}{dx} = -3")]))
    E.append(ex_derivative("yt-chn-04", "chain-rule", "(x**3 - 2*x)**2", 3, ch, chain=("u**2", "x**3 - 2*x"), solution=
                           [("Outer u^2, inner u = x^3 − 2x.", "\\frac{d}{du}u^{2} = 2u,\\quad \\frac{du}{dx} = 3x^{2} - 2")]))
    cp = "Solve f′(x) = 0, not f(x) = 0. Factor f′(x) first."
    E.append(ex_points("yt-crt-01", "x**3 - 3*x**2 - 9*x + 4", 1, cp))
    E.append(ex_points("yt-crt-02", "2*x**3 + 3*x**2 - 12*x", 2, cp))
    E.append(ex_points("yt-crt-03", "x**4 - 8*x**2", 2, cp))
    E.append(ex_points("yt-crt-04", "x**3 - 6*x**2 + 12*x", 3, "Factor f′(x) completely. A repeated factor gives one critical point, not two."))
    ci = "Candidates are the critical points inside the interval and both endpoints. Evaluate f at all of them."
    E.append(ex_extremum("yt-int-01", "x**3 - 3*x", 0, 3, "max", 1, ci))
    E.append(ex_extremum("yt-int-02", "x**3 - 3*x**2", 1, 4, "min", 2, ci))
    E.append(ex_extremum("yt-int-03", "-x**3 + 3*x**2 + 1", -1, 3, "max", 3, ci + " Two candidates can tie."))
    E.append(ex_extremum("yt-int-04", "2*x**3 - 9*x**2 + 12*x", 0, 3, "min", 2, ci))
    E.append(ex_extremum("yt-int-05", "x**4 - 2*x**2", -2, 1, "max", 2, ci))
    # --- expanded bank -----------------------------------------------------
    E.append(ex_derivative("yt-der-05", "derivatives", "4*x**3 - 2/x**5 + 3", 2, neg,
                           [("Rewrite as powers of x.", "f(x) = 4x^{3} - 2x^{-5} + 3"),
                            ("Power rule; the constant differentiates to 0.", "12x^{2} + 10x^{-6}")]))
    E.append(ex_derivative("yt-der-06", "derivatives", "x**6/3 - 5/x**2", 2, neg,
                           [("Rewrite as powers of x.", "f(x) = \\tfrac{1}{3}x^{6} - 5x^{-2}"),
                            ("Power rule on each term.", "2x^{5} + 10x^{-3}")]))
    E.append(ex_derivative("yt-der-07", "derivatives", "7*x - 3/x**3 + 2*x**4", 1, neg,
                           [("Rewrite as powers of x.", "f(x) = 7x - 3x^{-3} + 2x^{4}"),
                            ("Power rule on each term.", "7 + 9x^{-4} + 8x^{3}")]))
    E.append(ex_derivative("yt-der-08", "derivatives", "6/x - x**3/2", 3, neg,
                           [("Rewrite as powers of x.", "f(x) = 6x^{-1} - \\tfrac{1}{2}x^{3}"),
                            ("Power rule on each term.", "-6x^{-2} - \\tfrac{3}{2}x^{2}")]))
    E.append(ex_derivative("yt-chn-05", "chain-rule", "(3*x - 2)**4", 1, ch, chain=("u**4", "3*x - 2"), solution=
                           [("Outer u^4, inner u = 3x − 2.", "\\frac{d}{du}u^{4} = 4u^{3},\\quad \\frac{du}{dx} = 3")]))
    E.append(ex_derivative("yt-chn-06", "chain-rule", "(1 - x**2)**4", 2, ch, chain=("u**4", "1 - x**2"), solution=
                           [("Outer u^4, inner u = 1 − x^2.", "\\frac{d}{du}u^{4} = 4u^{3},\\quad \\frac{du}{dx} = -2x")]))
    E.append(ex_derivative("yt-chn-07", "chain-rule", "(2*x**2 + 3*x)**3", 3, ch, chain=("u**3", "2*x**2 + 3*x"), solution=
                           [("Outer u^3, inner u = 2x^2 + 3x.", "\\frac{d}{du}u^{3} = 3u^{2},\\quad \\frac{du}{dx} = 4x + 3")]))
    E.append(ex_derivative("yt-chn-08", "chain-rule", "(x**4 + 2)**2", 2, ch, chain=("u**2", "x**4 + 2"), solution=
                           [("Outer u^2, inner u = x^4 + 2.", "\\frac{d}{du}u^{2} = 2u,\\quad \\frac{du}{dx} = 4x^{3}")]))
    E.append(ex_points("yt-crt-05", "x**3 - 3*x", 1, cp))
    E.append(ex_points("yt-crt-06", "x**3 + 3*x**2 - 24*x", 2, cp))
    E.append(ex_points("yt-crt-07", "x**4 - 4*x**3", 3, "Factor f′(x) completely, including any power of x."))
    E.append(ex_points("yt-crt-08", "2*x**3 - 9*x**2 + 12*x + 1", 2, cp))
    E.append(ex_extremum("yt-int-06", "x**3 - 6*x**2 + 9*x + 1", 0, 4, "max", 3, ci + " Two candidates can tie."))
    E.append(ex_extremum("yt-int-07", "x**3 - 3*x**2 + 1", -1, 3, "min", 3, ci + " Two candidates can tie."))
    E.append(ex_extremum("yt-int-08", "-x**3 + 12*x", 0, 3, "max", 1, ci))
    E.append(ex_extremum("yt-int-09", "x**3 - 12*x + 3", -3, 1, "min", 2, ci))
    return E


def check_mcq(e: dict[str, Any]) -> None:
    """The multiple-choice version must have 4 distinct options, exactly one correct."""
    m = e["mcq"]
    if len(m["options"]) != 4 or len(set(m["options"])) != 4:
        raise ValueError(f"{e['id']}: multiple-choice options not distinct")
    if m["options"][m["correct"]] != (e["answer_latex"] if e["answer"]["kind"] != "expression" else e["answer_latex"]):
        raise ValueError(f"{e['id']}: correct option doesn't match the verified answer")
    if m["labels"][m["correct"]] is not None or not all(m["labels"][i] for i in range(4) if i != m["correct"]):
        raise ValueError(f"{e['id']}: every wrong option needs a mistake label")


def check_exercise(e: dict[str, Any]) -> None:
    """Re-verify an exercise's stored answer independently. Raises on mismatch."""
    a = e["answer"]
    if a["kind"] == "expression":
        rebuilt = sum(sp.Rational(c) * x ** int(k) for k, c in a["coeffs"].items())
        if sp.simplify(rebuilt - e["_truth"]) != 0:
            raise ValueError(f"{e['id']}: stored coefficients disagree with SymPy")
    elif a["kind"] == "points":
        if sorted(sp.Rational(v) for v in a["values"]) != sorted(sp.Rational(p) for p in e["_truth"]):
            raise ValueError(f"{e['id']}: stored critical points disagree")
    elif a["kind"] == "extremum":
        best, locs, _ = e["_truth"]
        if sp.Rational(a["value"]) != best or sorted(map(sp.Rational, a["at"])) != sorted(locs):
            raise ValueError(f"{e['id']}: stored extremum disagrees")


def public(e: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in e.items() if not k.startswith("_")}


# ---------------------------------------------------------------------------
# Cross-validation vectors for the browser checker
# ---------------------------------------------------------------------------

def _sym_equal(student: str, truth: sp.Expr) -> bool:
    s = student.replace("^", "**")
    s = sp.parsing.sympy_parser.parse_expr(
        s, local_dict={"x": x},
        transformations=sp.parsing.sympy_parser.standard_transformations
        + (sp.parsing.sympy_parser.implicit_multiplication_application,))
    return sp.simplify(s - truth) == 0


def checker_vectors(exercises: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Student-style inputs with the verdict SymPy gives. 'unsupported' marks
    inputs outside the browser checker's provable class: it must refuse to grade
    those rather than guess."""
    by = {e["id"]: e for e in exercises}
    raw: list[tuple[str, str, str | None]] = [
        # (exercise, input, forced verdict or None to ask SymPy)
        ("yt-der-01", "12x^3 - 6x^(-4) - 5", None),
        ("yt-der-01", "12*x**3 - 6/x^4 - 5", None),
        ("yt-der-01", "-5 + 12x^3 - 6x^-4", None),
        ("yt-der-01", "12x^3 - 6x^(-2) - 5", None),
        ("yt-der-01", "12x^3 + 6x^(-4) - 5", None),
        ("yt-der-01", "12x^3 - 6x^(-4)", None),
        ("yt-der-02", "5x^4 + 4/x^2", None),
        ("yt-der-02", "5x^4 + 4x^(-2) + 0", None),
        ("yt-der-02", "5x^4 - 4/x^2", None),
        ("yt-der-03", "6x^2 + 12/x^3 + 1", None),
        ("yt-der-03", "6x^2 + 12x^(-3) + 1.0", None),
        ("yt-der-03", "6x^2 + 12x^(-3)", None),
        ("yt-der-04", "10x - 12x^(-5)", None),
        ("yt-der-04", "10x - 12/x^5", None),
        ("yt-der-04", "10x - 12x^(-3)", None),
        ("yt-chn-01", "8(2x+3)^3", None),
        ("yt-chn-01", "4(2x+3)^3*2", None),
        ("yt-chn-01", "64x^3 + 288x^2 + 432x + 216", None),
        ("yt-chn-01", "4(2x+3)^3", None),
        ("yt-chn-02", "6x(x^2+1)^2", None),
        ("yt-chn-02", "3(x^2+1)^2(2x)", None),
        ("yt-chn-02", "3(x^2+1)^2", None),
        ("yt-chn-03", "-15(5-3x)^4", None),
        ("yt-chn-03", "15(5-3x)^4", None),
        ("yt-chn-03", "5(5-3x)^4*(-3)", None),
        ("yt-chn-04", "2(x^3-2x)(3x^2-2)", None),
        ("yt-chn-04", "6x^5 - 16x^3 + 8x", None),
        ("yt-chn-04", "2(x^3-2x)", None),
        ("yt-der-01", "12x^3 - 6/x^4 - 5 + sin(0)", "unsupported"),
        ("yt-chn-02", "6x(x^2+1)^2/(x+1)*(x+1)", "unsupported"),
        ("yt-der-02", "5x^4 + 4/x^2 + sqrt(4) - 2", "unsupported"),
    ]
    out = []
    for eid, inp, forced in raw:
        e = by[eid]
        verdict = forced or ("correct" if _sym_equal(inp, e["_truth"]) else "incorrect")
        out.append({"exercise": eid, "input": inp, "expect": verdict})
    # points / extremum vectors (exact numbers only; decimals are compared exactly)
    out += [
        {"exercise": "yt-crt-01", "input": "-1, 3", "expect": "correct"},
        {"exercise": "yt-crt-01", "input": "x = 3, x = -1", "expect": "correct"},
        {"exercise": "yt-crt-01", "input": "3", "expect": "incorrect"},
        {"exercise": "yt-crt-01", "input": "-1, 3, 4", "expect": "incorrect"},
        {"exercise": "yt-crt-03", "input": "-2, 0, 2", "expect": "correct"},
        {"exercise": "yt-crt-03", "input": "2, -2", "expect": "incorrect"},
        {"exercise": "yt-crt-04", "input": "2", "expect": "correct"},
        {"exercise": "yt-crt-04", "input": "2, 2", "expect": "correct"},
        {"exercise": "yt-crt-04", "input": "0, 2", "expect": "incorrect"},
        {"exercise": "yt-crt-02", "input": "1, -4/2", "expect": "correct"},
        {"exercise": "yt-crt-02", "input": "1, -2.0", "expect": "correct"},
        {"exercise": "yt-crt-02", "input": "1, -1.999", "expect": "incorrect"},
        {"exercise": "yt-int-01", "input": "18 | 3", "expect": "correct"},
        {"exercise": "yt-int-01", "input": "-2 | 1", "expect": "incorrect"},
        {"exercise": "yt-int-01", "input": "18 | 0", "expect": "incorrect"},
        {"exercise": "yt-int-03", "input": "5 | -1, 2", "expect": "correct"},
        {"exercise": "yt-int-03", "input": "5 | 2", "expect": "incorrect"},
        {"exercise": "yt-int-02", "input": "-4 | 2", "expect": "correct"},
        {"exercise": "yt-int-05", "input": "8 | -2", "expect": "correct"},
        {"exercise": "yt-int-05", "input": "0 | 0", "expect": "incorrect"},
    ]
    # sanity: SymPy agrees with the hand-labelled numeric vectors
    for v in out:
        e = by[v["exercise"]]
        a = e["answer"]
        if a["kind"] == "points":
            vals = [sp.Rational(sp.nsimplify(s.replace("x =", "").strip(), rational=True)) for s in v["input"].split(",")]
            ok = set(vals) == {sp.Rational(p) for p in a["values"]}
            assert ok == (v["expect"] == "correct"), v
        elif a["kind"] == "extremum":
            val, locs = v["input"].split("|")
            ok = sp.Rational(sp.nsimplify(val, rational=True)) == sp.Rational(a["value"]) and \
                {sp.Rational(sp.nsimplify(s, rational=True)) for s in locs.split(",")} == {sp.Rational(p) for p in a["at"]}
            assert ok == (v["expect"] == "correct"), v
    return out
