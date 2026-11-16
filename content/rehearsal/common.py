"""Shared helpers for the Calculus question bank."""
from __future__ import annotations

import sympy as sp

from .verify import parse

TOPICS = {
    "derivatives": "Derivatives",
    "chain-rule": "The chain rule",
    "critical-points": "Critical points",
    "closed-interval": "Max & min on closed intervals",
}


def L(s: str | sp.Expr) -> str:
    """LaTeX for an expression string or SymPy expression."""
    e = parse(s) if isinstance(s, str) else sp.sympify(s)
    if e.is_number and e.is_Add:
        # Write "2 + √3/3" rather than SymPy's default "√3/3 + 2".
        rational = sum((t for t in e.args if t.is_Rational), sp.Integer(0))
        rest = e - rational
        if rational != 0 and rest != 0:
            sign = "-" if rest.could_extract_minus_sign() else "+"
            rest_tex = sp.latex(-rest) if sign == "-" else sp.latex(rest)
            return f"{sp.latex(rational)} {sign} {rest_tex}"
    return sp.latex(e)


def S(e: sp.Expr) -> str:
    """Canonical string for storing an expression in a claim."""
    return sp.sstr(sp.nsimplify(e) if e.is_number else e)


def approx(e: sp.Expr) -> str:
    v = float(sp.N(e))
    return f"{v:.3f}".rstrip("0").rstrip(".") if not float(v).is_integer() else str(int(v))
