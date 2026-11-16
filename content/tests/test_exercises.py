"""Your Turn exercises: every stored answer re-verified, and every answer inside
the class the browser checker can prove (rational Laurent polynomials / rationals)."""
import sympy as sp

from rehearsal.exercises import all_exercises, check_exercise, checker_vectors, laurent_coeffs, NotSupported
from rehearsal.verify import x


def test_all_exercises_verify():
    ex = all_exercises()
    assert len(ex) >= 32
    assert {e["topic"] for e in ex} == {"derivatives", "chain-rule", "critical-points", "closed-interval"}
    for e in ex:
        check_exercise(e)


def test_laurent_rejects_unprovable_forms():
    for bad in (sp.sin(x), sp.sqrt(x), 1 / (x + 1), sp.sqrt(2) * x):
        try:
            laurent_coeffs(bad)
        except NotSupported:
            continue
        raise AssertionError(f"{bad} should be unsupported")


def test_tie_and_double_root_cases_present():
    by = {e["id"]: e for e in all_exercises()}
    assert by["yt-int-03"]["answer"]["at"] == ["-1", "2"]        # tied maximum
    assert by["yt-crt-04"]["answer"]["values"] == ["2"]           # repeated factor


def test_vectors_cover_all_verdicts():
    v = checker_vectors(all_exercises())
    assert {x["expect"] for x in v} == {"correct", "incorrect", "unsupported"}
