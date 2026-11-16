"""Live class quiz rules: judging, per-question results, final summary. No I/O.

Privacy: answer breakdowns for a question are shown only when at least
MIN_TEAMS teams answered it, and the scoreboard only when at least MIN_TEAMS
teams took part, so no small group can be singled out.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

MIN_TEAMS = 3
LETTERS = "ABCD"


def public_question(q: dict[str, Any], index: int, total: int) -> dict[str, Any]:
    """What teams see while answering: never the correct option or labels."""
    return {"index": index, "total": total, "prompt": q["prompt"], "latex": q.get("latex", ""),
            "options": [{"text": o.get("text", ""), "latex": o.get("latex", "")} for o in q["options"]]}


def question_results(q: dict[str, Any], answers: list[int]) -> dict[str, Any]:
    n = len(answers)
    out: dict[str, Any] = {
        "correct": q["correct"], "solution": q.get("solution", []),
        "answered": n, "min_teams": MIN_TEAMS, "locked": n < MIN_TEAMS,
    }
    if out["locked"]:
        return out
    counts = Counter(answers)
    out["counts"] = [counts.get(i, 0) for i in range(len(q["options"]))]
    out["pct_correct"] = round(100 * counts.get(q["correct"], 0) / n)
    wrong = [(i, c) for i, c in counts.items() if i != q["correct"] and c > 0]
    if wrong:
        i, c = max(wrong, key=lambda ic: ic[1])
        label = (q.get("labels") or [None] * 4)[i]
        out["top_wrong"] = {"option": i, "count": c, "label": label}
    return out


def summary(questions: list[dict[str, Any]], teams: list[dict[str, Any]]) -> dict[str, Any]:
    """teams: [{"name", "answers": {q_index: {"choice", "correct"}}}]"""
    played = [t for t in teams if t["answers"]]
    out: dict[str, Any] = {"teams": len(played), "min_teams": MIN_TEAMS, "locked": len(played) < MIN_TEAMS,
                           "total": len(questions)}
    if out["locked"]:
        return out
    per_q = []
    for i, q in enumerate(questions):
        ans = [t["answers"][i]["choice"] for t in played if i in t["answers"]]
        r = question_results(q, ans)
        per_q.append({"index": i, "prompt": q["prompt"], "answered": r["answered"],
                      "pct_correct": r.get("pct_correct"), "top_wrong": r.get("top_wrong")})
    out["questions"] = per_q
    out["scoreboard"] = sorted(
        ({"name": t["name"], "score": sum(1 for a in t["answers"].values() if a["correct"])} for t in played),
        key=lambda s: (-s["score"], s["name"].lower()))
    out["insights"] = insights(per_q, len(questions))
    return out


def insights(per_q: list[dict[str, Any]], total: int) -> list[dict[str, Any]]:
    """Teaching takeaways, each computed from the actual answers. Each is an English
    message key plus values, so the app can show it in the viewer's language."""
    scored = [q for q in per_q if q["pct_correct"] is not None]
    lines: list[dict[str, Any]] = []
    if not scored:
        return lines
    avg = round(sum(q["pct_correct"] for q in scored) / len(scored))
    lines.append({"key": "On average, {pct}% of teams answered each question correctly.", "params": {"pct": avg}})
    hardest = min(scored, key=lambda q: q["pct_correct"])
    if hardest["pct_correct"] < 100:
        lines.append({"key": "Hardest: question {q}, answered correctly by {pct}% of teams.",
                      "params": {"q": hardest["index"] + 1, "pct": hardest["pct_correct"]}})
    labels = Counter(q["top_wrong"]["label"] for q in scored if q.get("top_wrong") and q["top_wrong"].get("label"))
    if labels:
        label, n = labels.most_common(1)[0]
        lines.append({"key": "Most common mistake: “{label}” (top wrong answer in {n} questions)." if n > 1 else "Most common mistake: “{label}”.",
                      "params": {"label": label, "n": n}})
    return lines


# --- duels: two players, the first correct answer wins the point ---------------------

def duel_point(answers: list[tuple[int, dict[str, Any]]]) -> int | None:
    """answers: (team id, {"correct", "ms"}). Returns the team that answered correctly first, if any."""
    right = [(a["ms"], tid) for tid, a in answers if a["correct"]]
    return min(right)[1] if right else None


def duel_scores(total: int, teams: list[dict[str, Any]]) -> dict[int, int]:
    scores = {t["id"]: 0 for t in teams}
    for i in range(total):
        winner = duel_point([(t["id"], t["answers"][i]) for t in teams if i in t["answers"]])
        if winner is not None:
            scores[winner] += 1
    return scores
