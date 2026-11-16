"""Verify the Calculus question bank and export an immutable, versioned pack.

Usage (from content/):  python -m rehearsal.build_pack

Writes:
    content/packs/calculus1-v<version>.json   the verified pack
    content/packs/checker_vectors.json        SymPy verdicts replayed by the browser checker's tests
    frontend/public/packs/calculus1.json      copy served to the web app
    backend/packs/calculus1.json              copy used by the class quiz server
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import sympy as sp

from .common import TOPICS
from .exercises import all_exercises, check_exercise, check_mcq, checker_vectors, public
from .i18n import LANGS, localize_exercise, tr

PACK_VERSION = "2.1.0"
ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "content" / "packs"
COPIES = [ROOT / "frontend" / "public" / "packs", ROOT / "backend" / "packs"]


def build() -> dict[str, Any]:
    exercises = all_exercises()
    for e in exercises:
        check_exercise(e)  # raises: an unverified question must never ship
        check_mcq(e)
    pub = [{**public(e), "verification": {"checker": f"sympy {sp.__version__}", "status": "verified"}} for e in exercises]
    for e in pub:
        e["i18n"] = localize_exercise(e)  # raises if any text lacks a French or Italian translation
    body = json.dumps(pub, sort_keys=True, ensure_ascii=False)
    pack = {
        "pack_id": "calculus1",
        "subject": "Calculus 1",
        "pack_version": PACK_VERSION,
        "content_hash": hashlib.sha256(body.encode()).hexdigest()[:16],
        "topics": [{"id": k, "name": v, "i18n": {lang: tr(v, lang) for lang in LANGS}} for k, v in TOPICS.items()],
        "exercises": pub,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("calculus1-v*.json"):
        if old.name != f"calculus1-v{PACK_VERSION}.json":
            old.unlink()
    (OUT_DIR / "review_queue.json").unlink(missing_ok=True)
    out = OUT_DIR / f"calculus1-v{PACK_VERSION}.json"
    out.write_text(json.dumps(pack, indent=2, ensure_ascii=False))
    (OUT_DIR / "checker_vectors.json").write_text(json.dumps(checker_vectors(exercises), indent=2, ensure_ascii=False))
    for d in COPIES:
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(out, d / "calculus1.json")
    return {"pack": pack, "path": out}


if __name__ == "__main__":
    res = build()
    ex = res["pack"]["exercises"]
    for t in TOPICS:
        print(f"  {t:<16} {sum(e['topic'] == t for e in ex)} questions")
    print(f"Verified {len(ex)} questions, each with a multiple-choice version. Wrote {res['path']}")
