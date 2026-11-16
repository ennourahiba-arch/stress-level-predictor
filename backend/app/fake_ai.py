"""Scripted stand-in for an AI provider (LLM_PROVIDER=fake).

Used by the automated tests and for running the app locally without a key. It
builds structurally valid answers from the uploaded passages, quoting them
exactly, so the whole pipeline can be exercised. Its content is placeholder
text and every pack it produces is labelled as test mode.
"""
from __future__ import annotations

import json
import re


def _passages(user: str) -> list[tuple[str, str]]:
    m = re.search(r"<<<MATERIAL\n(.*?)\nMATERIAL>>>", user, re.S)
    if not m:
        return []
    parts = re.split(r"(?:^|\n\n)\[(P\d+)\] \([^)]*\)\n", m.group(1))
    return [(parts[i], parts[i + 1]) for i in range(1, len(parts) - 1, 2)]


def _quote(text: str) -> str:
    return " ".join(text.split()[:10])


def _n(user: str) -> int:
    m = re.search(r"Write (\d+) ", user)
    return int(m.group(1)) if m else 5


PROFILE = {"type_counts": {"multiple choice": 10, "true/false": 5, "short answer": 3, "problem solving": 1},
           "duration_minutes": 90, "number_of_questions": 19, "notes": "(Simulated) exam profile."}


def _sections(user: str) -> dict[str, int]:
    m = re.search(r"SECTIONS: (.*)", user)
    return {k: int(v) for k, v in (x.split("=") for x in m.group(1).split(", "))} if m else {}


def _question(fmt: str, i: int, pid: str, text: str) -> dict:
    q = _quote(text)
    base = {"explanation": f"Passage {pid} states it directly.", "hint": "Re-read that passage.", "difficulty": 1 + i % 3,
            "source_id": pid, "quote": q}
    if fmt == "quiz":
        return {**base, "question": f"(Simulated) Which statement does passage {pid} support? [{i + 1}]",
                "options": [f"It says: {q}", f"It says the opposite of: {q}", "It is not covered in the course", f"Only part {i + 1} is true"],
                "correct": 0, "wrong_reasons": [None, "Simulated: reversed the claim", "Simulated: skimmed the chapter", "Simulated: over-generalised"]}
    if fmt == "multi":
        return {**base, "question": f"(Simulated) Select every statement passage {pid} supports. [{i + 1}]",
                "options": [f"It says: {q}", "It mentions processes", f"It denies: {q}", "It is about cooking", "It is about the CPU"],
                "correct": [0, 1, 4], "wrong_reasons": [None, None, "Simulated: reversed the claim", "Simulated: off-topic", None]}
    if fmt == "tf":
        return {**base, "statement": f"(Simulated) Passage {pid} says: {q} [{i + 1}]", "answer": i % 2 == 0,
                "misconception": "Simulated: misread the passage"}
    if fmt == "blank":
        return {**base, "sentence": f"(Simulated) The component that picks the next process is the ____. [{i + 1}]",
                "answers": ["scheduler", "process scheduler", "CPU scheduler"]}
    if fmt == "match":
        return {**base, "instruction": f"(Simulated) Match each term with its meaning. [{i + 1}]",
                "pairs": [{"left": "Scheduler", "right": "Picks the next process"}, {"left": "Quantum", "right": "Time slice"},
                          {"left": "Context switch", "right": "Saves and loads registers"}]}
    if fmt == "written" and "PROBLEM" in text:
        return {**base, "question": f"(Simulated) Three jobs take 2, 4 and 6 ms. Compute the average waiting time under FCFS. [{i + 1}]",
                "key_points": ["waiting times 0, 2, 6", "average"], "model_answer": "Waits are 0, 2 and 6 ms, so the average is 8/3 = 2.67 ms.",
                "problem": True, "final_answer": "2.67 ms"}
    return {**base, "question": f"(Simulated) Explain what passage {pid} says. [{i + 1}]", "key_points": ["main idea", "an example"],
            "model_answer": f"It says {q}."}


def respond(system: str, user: str) -> str:
    task = re.search(r"TASK: (\w+)", system + "\n" + user)
    task = task.group(1) if task else ""
    ps = _passages(user) or [("P1", "placeholder text with enough words to quote from")]
    pick = lambda i: ps[i % len(ps)]

    if task == "generate_questions":
        sections = {fmt: [_question(fmt, i, *pick(i)) for i in range(n)] for fmt, n in _sections(user).items()}
        return json.dumps({"title": "Simulated course", "exam_profile": PROFILE, "sections": sections})

    if task == "check_items":
        items = json.loads(re.search(r"ITEMS:\n(.*?)\n\n<<<MATERIAL", user, re.S).group(1))
        def final(it):  # the reviewer "solves" problems; WRONG_SUM makes it disagree
            m = re.search(r"The final result is: (.*?)\"", json.dumps(it))
            return None if "solve" not in it else ("5 ms" if "WRONG_SUM" in json.dumps(it) else (m.group(1) if m else None))
        return json.dumps({"results": [{"id": it["id"], "ok": "REJECT_ME" not in json.dumps(it), "reason": "simulated review",
                                        "final_answer": final(it)} for it in items]})

    if task == "oral_examiner":
        if "GIVE_AWAY" in user:  # tests: simulate a model that tries to leak the answer
            ma = re.search(r"MODEL ANSWER: (.*)", user).group(1)
            return json.dumps({"reply": f"Fine, the answer is: {ma}", "close": False, "score": None})
        last = user.lower().split("conversation:")[-1]
        return json.dumps({"reply": "(Simulated) Good start. Can you give an example?", "close": "example" in last, "score": 1})

    if task == "grade_answer":
        ans = user.split("STUDENT ANSWER:")[-1].lower()
        verdict = "correct" if "main idea" in ans else "incorrect"
        return json.dumps({"verdict": verdict, "covered": [0] if verdict == "correct" else [], "feedback": "(Simulated) feedback."})

    return json.dumps({})
