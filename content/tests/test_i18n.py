"""Every human-language string in the Calculus bank has a French and Italian version."""
import json
import re

import pytest

from rehearsal.build_pack import build
from rehearsal.i18n import tr, tr_latex


@pytest.fixture(scope="module")
def pack():
    return build()["pack"]


def test_every_exercise_is_translated(pack):
    for e in pack["exercises"]:
        for lang in ("fr", "it"):
            loc = e["i18n"][lang]
            assert loc["prompt"] and loc["prompt"] != e["prompt"]
            assert len(loc["solution"]) == len(e["solution"])
            assert len(loc["mcq"]["options"]) == 4 and loc["mcq"]["labels"][e["mcq"]["correct"]] is None
            # no English words left inside formulas
            blob = json.dumps(loc, ensure_ascii=False)
            assert not re.search(r"absolute (maximum|minimum)|\\\\text\{ at \}", blob), (e["id"], lang)


def test_topics_translated(pack):
    assert {t["i18n"]["fr"] for t in pack["topics"]} >= {"Dérivées", "Points critiques"}


def test_unknown_text_fails_the_build():
    with pytest.raises(KeyError):
        tr("A sentence nobody translated.", "fr")
    with pytest.raises(KeyError):
        tr_latex(r"\text{absolute value }", "it")


def test_formula_words():
    assert tr_latex(r"\text{absolute maximum } = 18 \text{ at } x = 3", "it") == r"\text{massimo assoluto } = 18 \text{ in } x = 3"
