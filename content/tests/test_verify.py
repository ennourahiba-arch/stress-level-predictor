"""Acceptance Test H: known Calculus cases produce the correct verdict."""
import pytest

from rehearsal.verify import INVALID, UNVERIFIABLE, VALID, check_claim, first_invalid_step

DEMO_F = "x**3 - 6*x**2 + 11*x - 6"


def v(claim):
    return check_claim(claim).status


def test_demo_derivative():
    assert v({"type": "derivative", "f": DEMO_F, "expr": "3*x**2 - 12*x + 11"}) == VALID
    assert v({"type": "derivative", "f": DEMO_F, "expr": "3*x**2 - 12*x"}) == INVALID


def test_demo_critical_points_exact():
    pts = ["2 - sqrt(3)/3", "2 + sqrt(3)/3"]
    assert v({"type": "critical_points", "f": DEMO_F, "interval": ["0", "4"], "points": pts}) == VALID
    # Decimal approximations are NOT accepted as exact critical points.
    assert v({"type": "critical_points", "f": DEMO_F, "interval": ["0", "4"],
              "points": ["1.423", "2.577"]}) == INVALID


def test_demo_endpoint_maximum():
    base = {"type": "absolute_extremum", "f": DEMO_F, "interval": ["0", "4"], "kind": "max"}
    assert v({**base, "value": "6", "at": ["4"]}) == VALID
    assert v({**base, "value": "2*sqrt(3)/9", "at": ["2 - sqrt(3)/3"]}) == INVALID  # ignored endpoints


def test_demo_endpoint_values():
    assert v({"type": "evaluations", "f": DEMO_F, "pairs": [["0", "-6"], ["4", "6"]]}) == VALID


def test_equivalent_forms_accepted():
    f = "(3*x + 1)**5"
    assert v({"type": "derivative", "f": f, "expr": "15*(3*x + 1)**4"}) == VALID
    expanded = "15*(81*x**4 + 108*x**3 + 54*x**2 + 12*x + 1)"
    assert v({"type": "derivative", "f": f, "expr": expanded}) == VALID
    assert v({"type": "derivative", "f": f, "expr": "5*(3*x + 1)**4"}) == INVALID


def test_negative_exponent_power_rule():
    assert v({"type": "derivative", "f": "5*x**(-2)", "expr": "-10/x**3"}) == VALID
    assert v({"type": "derivative", "f": "5*x**(-2)", "expr": "-10*x**(-1)"}) == INVALID


def test_multiple_critical_points_and_outside_interval():
    f = "x**3 - 12*x"
    assert v({"type": "critical_points", "f": f, "points": ["-2", "2"]}) == VALID
    assert v({"type": "critical_points", "f": f, "interval": ["0", "3"], "points": ["2"]}) == VALID
    assert v({"type": "critical_points", "f": f, "interval": ["0", "3"], "points": ["-2", "2"]}) == INVALID


def test_tied_absolute_extremum_needs_all_locations():
    # f = x^3 - 3x^2 + 2 on [-1, 3]: max 2 at x = 0 and x = 3
    base = {"type": "absolute_extremum", "f": "x**3 - 3*x**2 + 2", "interval": ["-1", "3"],
            "kind": "max", "value": "2"}
    assert v({**base, "at": ["0", "3"]}) == VALID
    assert v({**base, "at": ["0"]}) == INVALID


def test_correct_final_answer_from_flawed_reasoning():
    """Solving f(x)=0 instead of f'(x)=0 still reaches max 16 at x=4."""
    f = "x**3 - 3*x**2"
    steps = [
        {"claim": {"type": "derivative", "f": f, "expr": "3*x**2 - 6*x"}},
        {"claim": {"type": "critical_points", "f": f, "interval": ["-1", "4"], "points": ["0", "3"]}},
        {"claim": {"type": "evaluations", "f": f,
                   "pairs": [["-1", "-4"], ["0", "0"], ["3", "0"], ["4", "16"]]}},
        {"claim": {"type": "absolute_extremum", "f": f, "interval": ["-1", "4"], "kind": "max",
                   "value": "16", "at": ["4"]}},
    ]
    first, verdicts = first_invalid_step(steps)
    assert first == 2
    assert verdicts[3].status == VALID  # final answer right, reasoning wrong


def test_local_extrema_classification():
    f = "2*x**3 - 3*x**2 - 12*x"
    assert v({"type": "local_extrema", "f": f, "max": ["-1"], "min": ["2"]}) == VALID
    assert v({"type": "local_extrema", "f": f, "max": ["2"], "min": ["-1"]}) == INVALID


def test_unknown_or_malformed_claims_are_never_graded():
    assert v({"type": "integral", "f": "x"}) == UNVERIFIABLE
    assert v({"type": "derivative", "f": "x**2", "expr": "2*x +* 1"}) == UNVERIFIABLE


def test_unverifiable_before_error_rejects_round():
    steps = [{"claim": {"type": "mystery"}},
             {"claim": {"type": "derivative", "f": "x**2", "expr": "x"}}]
    with pytest.raises(ValueError):
        first_invalid_step(steps)
