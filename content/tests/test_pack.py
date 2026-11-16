"""Integrity of the published Calculus bank."""
import json
from pathlib import Path

import pytest
import sympy as sp

from rehearsal.build_pack import build
from rehearsal.verify import x

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def pack():
    return build()["pack"]


def test_bank_size_and_topics(pack):
    ex = pack["exercises"]
    assert len(ex) >= 32
    for t in ("derivatives", "chain-rule", "critical-points", "closed-interval"):
        assert sum(e["topic"] == t for e in ex) >= 8


def test_every_question_has_a_valid_multiple_choice_version(pack):
    for e in pack["exercises"]:
        m = e["mcq"]
        assert len(set(m["options"])) == 4 and 0 <= m["correct"] <= 3
        assert m["options"][m["correct"]] == e["answer_latex"]
        assert all(m["labels"][i] for i in range(4) if i != m["correct"])


def test_stored_answers_match_sympy():
    """Rebuild each typed answer from its stored exact form and compare with SymPy's own result."""
    from rehearsal.exercises import all_exercises
    for e in all_exercises():
        a = e["answer"]
        if a["kind"] == "expression":
            rebuilt = sum(sp.Rational(c) * x ** int(k) for k, c in a["coeffs"].items())
            assert sp.simplify(rebuilt - e["_truth"]) == 0, e["id"]
        elif a["kind"] == "points":
            assert sorted(map(sp.Rational, a["values"])) == sorted(e["_truth"]), e["id"]
        else:
            best, locs, _ = e["_truth"]
            assert sp.Rational(a["value"]) == best and sorted(map(sp.Rational, a["at"])) == sorted(locs), e["id"]


def test_deterministic(pack):
    assert build()["pack"]["content_hash"] == pack["content_hash"]


def test_copies_match(pack):
    for d in ("frontend/public/packs", "backend/packs"):
        assert json.loads((ROOT / d / "calculus1.json").read_text())["content_hash"] == pack["content_hash"]
