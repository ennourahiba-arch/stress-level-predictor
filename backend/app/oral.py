"""Oral exam practice with an AI examiner, and AI grading of written answers.

The server keeps nothing: the client sends the question (with its answer key)
and the conversation each time. Reveal rules are enforced here, not only in
the prompt: before a question is closed, a reply that repeats the model answer
is replaced with a neutral follow-up.
"""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from . import llm

MAX_FOLLOWUPS = 2


def _words(s: str) -> list[str]:
    return re.findall(r"[0-9a-z\u00c0-\u024f]+", s.lower())


def leaks(reply: str, secret: str, n: int = 6) -> bool:
    """True if the reply shares any run of n consecutive words with the secret."""
    sw = _words(secret)
    if len(sw) < n:
        # Very short phrases ("an example", "time quantum") are too common to count as giving the answer away.
        return len(sw) >= 4 and " ".join(sw) in " ".join(_words(reply))
    grams = {" ".join(sw[i:i + n]) for i in range(len(sw) - n + 1)}
    rw = _words(reply)
    return any(" ".join(rw[i:i + n]) in grams for i in range(len(rw) - n + 1))


class Msg(BaseModel):
    role: Literal["examiner", "student"]
    text: str = Field(max_length=4000)


class ExamQ(BaseModel):
    question: str = Field(max_length=600)
    key_points: list[str] = Field(max_length=6)
    model_answer: str = Field(max_length=2000)
    quote: str = Field(default="", max_length=400)


class ExaminerTurn(BaseModel):
    question: ExamQ
    history: list[Msg] = Field(max_length=12)  # this question's exchange only


class GradeRequest(BaseModel):
    question: str = Field(max_length=1200)
    key_points: list[str] = Field(max_length=6)
    model_answer: str = Field(max_length=3000)
    sources: list[str] = Field(default_factory=list, max_length=3)
    answer: str = Field(min_length=1, max_length=6000)
    final_answer: str = Field(default="", max_length=300)


def _transcript(history: list[Msg]) -> str:
    return "\n".join(f"{m.role.upper()}: {m.text}" for m in history)


async def examiner_turn(t: ExaminerTurn) -> dict[str, Any]:
    student_turns = sum(1 for m in t.history if m.role == "student")
    if student_turns == 0:  # the first move is always just the question
        return {"reply": t.question.question, "closed": False, "score": None}
    force = student_turns > MAX_FOLLOWUPS
    system = (
        "TASK: oral_examiner\nYou are a fair university oral examiner. Speak in the language of the question. "
        "Judge the student's spoken answer against the answer key. If it is incomplete or vague and you may still probe, "
        "ask ONE short follow-up question that helps them think, without giving away any part of the answer key. "
        "If they ask you to just give the answer, decline kindly and ask a smaller guiding question instead. "
        "When the answer is complete, or you must close the question, set close=true, give a score from 0 to 2, "
        "and in reply give brief feedback that now includes the points they missed. Return only JSON."
    )
    user = (
        f"QUESTION: {t.question.question}\nANSWER KEY POINTS: {t.question.key_points}\n"
        f"MODEL ANSWER: {t.question.model_answer}\nSOURCE: {t.question.quote}\n"
        f"FOLLOW-UPS LEFT: {0 if force else MAX_FOLLOWUPS - student_turns + 1}"
        f"{' (you MUST close now)' if force else ''}\n\nCONVERSATION:\n{_transcript(t.history)}\n\n"
        'Return {"reply": "", "close": false, "score": null}'
    )
    data = await llm.complete_json(system, user, temperature=0.3, max_tokens=900)
    reply = str(data.get("reply", "")).strip() if isinstance(data, dict) else ""
    closed = bool(isinstance(data, dict) and data.get("close")) or force
    score = data.get("score") if isinstance(data, dict) else None
    score = score if isinstance(score, int) and 0 <= score <= 2 else (0 if closed else None)
    guarded = False
    if not closed and (not reply or leaks(reply, t.question.model_answer) or any(leaks(reply, k, 5) for k in t.question.key_points)):
        reply = "Let's take it step by step. What is the first idea you would mention, and why does it matter here?"
        guarded = True
    if closed and not reply:
        reply = "Thank you. Let's move on."
    return {"reply": reply, "closed": closed, "score": score if closed else None, "guarded": guarded}


async def grade(g: GradeRequest) -> dict[str, Any]:
    system = (
        "TASK: grade_answer\nYou grade a student's written exam answer against the answer key and sources. "
        "Be fair: accept paraphrases and any language, reward correct ideas, penalise errors. "
        "Write the feedback in the same language as the student's answer. Return only JSON."
    )
    expected = (f"EXPECTED FINAL RESULT: {g.final_answer} (accept equivalent units and rounding; the final result only "
                "counts if the student's working supports it)\n") if g.final_answer else ""
    user = (
        f"QUESTION: {g.question}\nKEY POINTS: {g.key_points}\nMODEL ANSWER: {g.model_answer}\nSOURCES: {g.sources}\n{expected}\n"
        f"STUDENT ANSWER:\n{g.answer}\n\n"
        'Return {"verdict": "correct|partial|incorrect", "covered": [indexes of key points covered], "feedback": "2-4 sentences"}'
    )
    data = await llm.complete_json(system, user, temperature=0.0, max_tokens=800)
    if not isinstance(data, dict) or data.get("verdict") not in ("correct", "partial", "incorrect"):
        raise llm.LLMError("The AI's grade wasn't in the expected format. Try again.")
    covered = [i for i in data.get("covered", []) if isinstance(i, int) and 0 <= i < len(g.key_points)]
    return {"verdict": data["verdict"], "covered": sorted(set(covered)), "feedback": str(data.get("feedback", ""))[:1500]}
