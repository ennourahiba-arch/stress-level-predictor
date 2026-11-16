"""Turns uploaded course material into exam-style practice questions, for any subject.

Formats (ids used everywhere):
  quiz     multiple choice, one correct option         graded exactly
  multi    multiple response, select all that apply    graded exactly (partial credit)
  tf       true / false                                graded exactly
  blank    fill in the blank                           graded exactly against accepted answers
  match    matching pairs                              graded exactly (partial credit)
  short    short answer                                graded by AI against the course
  written  long answer, including problem solving      graded by AI against the course
  oral     oral exam questions (AI examiner chat)      graded by AI

One request can ask for a mix of formats (a mock exam), which costs one
generation call plus one review call.

Trust model (there is no SymPy for history or biology, so it's layered):
  1. Grounding: every question quotes its source passage; the quote must appear
     word for word (spacing/punctuation ignored) or the question is dropped.
  2. Structure: answer keys must be internally consistent (indices exist, options
     distinct, exactly one blank, ...).
  3. Independent review: a second AI call checks every question against its
     passage. For problems it also solves them again from scratch, and its final
     answer must match the generated one, so arithmetic slips are caught.
  4. Professors approve questions before they reach a class quiz.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from . import llm

Format = Literal["quiz", "multi", "tf", "blank", "match", "short", "written", "oral"]
FORMATS: tuple[str, ...] = ("quiz", "multi", "tf", "blank", "match", "short", "written", "oral")
LETTERS = "ABCDEF"
BLANK = "____"


# --- grounding ---------------------------------------------------------------

def _norm(s: str) -> str:
    return re.sub(r"[^0-9a-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0600-\u06ff]+", "", s.lower())


def quote_found(quote: str, passage_text: str) -> bool:
    q = _norm(quote)
    return len(q) >= 12 and q in _norm(passage_text)


def material_block(passages: list[dict[str, Any]]) -> str:
    return "<<<MATERIAL\n" + "\n\n".join(f"[{p['id']}] ({p['file']})\n{p['text']}" for p in passages) + "\nMATERIAL>>>"


# --- expected AI output, one model per format ----------------------------------------

class Base(BaseModel):
    source_id: str = Field(max_length=12)
    quote: str = Field(min_length=12, max_length=400)
    explanation: str = Field(default="", max_length=1500)
    hint: str = Field(default="", max_length=400)
    difficulty: int = Field(default=2, ge=1, le=3)


class MCQ(Base):
    question: str = Field(min_length=5, max_length=800)
    options: list[str] = Field(min_length=4, max_length=4)
    correct: int = Field(ge=0, le=3)
    wrong_reasons: list[str | None] = Field(default_factory=list, max_length=4)


class Multi(Base):
    question: str = Field(min_length=5, max_length=800)
    options: list[str] = Field(min_length=4, max_length=6)
    correct: list[int] = Field(min_length=1, max_length=5)
    wrong_reasons: list[str | None] = Field(default_factory=list, max_length=6)


class TF(Base):
    statement: str = Field(min_length=5, max_length=600)
    answer: bool
    misconception: str | None = Field(default=None, max_length=200)


class Blank(Base):
    sentence: str = Field(min_length=8, max_length=600)
    answers: list[str] = Field(min_length=1, max_length=6)


class Pair(BaseModel):
    left: str = Field(min_length=1, max_length=200)
    right: str = Field(min_length=1, max_length=300)


class Match(Base):
    instruction: str = Field(min_length=5, max_length=300)
    pairs: list[Pair] = Field(min_length=3, max_length=6)


class Open(Base):
    question: str = Field(min_length=5, max_length=1200)
    key_points: list[str] = Field(min_length=1, max_length=6)
    model_answer: str = Field(min_length=3, max_length=3000)
    problem: bool = False
    final_answer: str | None = Field(default=None, max_length=300)


MODELS: dict[str, type[Base]] = {"quiz": MCQ, "multi": Multi, "tf": TF, "blank": Blank, "match": Match,
                                 "short": Open, "written": Open, "oral": Open}

SPECS: dict[str, str] = {
    "quiz": 'multiple-choice questions with exactly 4 options and ONE correct option (index 0-3). Wrong options are tempting '
            'mistakes real students make; give in wrong_reasons a short misconception label per option (null for the correct one). '
            'Shape: {"question":"","options":["","","",""],"correct":0,"wrong_reasons":[null,"","",""]}',
    "multi": '"select all that apply" questions with 4 to 6 options, of which AT LEAST ONE and NOT ALL are correct (list their indices). '
             'Give wrong_reasons per option (null for correct ones). '
             'Shape: {"question":"","options":["","","","",""],"correct":[0,2],"wrong_reasons":[null,"",null,"",""]}',
    "tf": 'true/false statements, about half true and half false. False ones must be clearly false according to the material, not '
          'debatable. misconception: why a student might believe the wrong answer. Shape: {"statement":"","answer":true,"misconception":""}',
    "blank": f'fill-in-the-blank sentences containing exactly one blank written as {BLANK}. The missing part is a key term, value or '
             'short phrase. answers lists every acceptable fill (synonyms, abbreviations, singular/plural), most standard first. '
             f'Shape: {{"sentence":"The ... is the {BLANK}.","answers":["",""]}}',
    "match": 'matching exercises: an instruction and 3 to 6 pairs (left item, its correct right item); every left matches exactly one '
             'right and the rights are all different. Shape: {"instruction":"Match each ... with ...","pairs":[{"left":"","right":""}]}',
    "short": 'short-answer questions (a definition, a brief explanation or a one-line calculation) with 1 to 3 key_points a full-marks '
             'answer must contain and a short model_answer. Shape: {"question":"","key_points":[""],"model_answer":""}',
    "written": 'long-answer questions: structured explanations, comparisons, and (when the material allows) problems that need a '
               'calculation or a worked procedure. Give 2 to 6 key_points (each worth one mark) and a full model_answer with the working. '
               'For problems set problem=true and put only the final result in final_answer (numbers with units). '
               'Shape: {"question":"","key_points":["",""],"model_answer":"","problem":false,"final_answer":null}',
    "oral": 'oral exam questions an examiner would ask aloud, with 2 to 5 key_points and a model_answer. '
            'Shape: {"question":"","key_points":[""],"model_answer":""}',
}

TYPE_LABELS = {"multiple choice": "quiz", "multiple response": "multi", "true/false": "tf", "fill in the blanks": "blank",
               "matching": "match", "short answer": "short", "long answer": "written", "problem solving": "written",
               "case study": "written", "oral": "oral"}


class GenerationError(Exception):
    pass


# --- prompts --------------------------------------------------------------------

SYSTEM = (
    "You write exam practice questions for university students from THEIR course material. "
    "Use only facts stated in the MATERIAL. Write in the same language as the MATERIAL. "
    "Every question must cite a passage id like P3 in source_id and copy a short exact quote (12 to 200 characters) "
    "from that passage into quote, character for character. Never invent sources. Return only JSON."
)


def _style(past: str) -> str:
    if not past.strip():
        return "\n\nNo past exams were provided: write questions typical of a university exam on this material."
    return ("\n\nPAST EXAMS (follow their wording, difficulty and level of detail as closely as possible, "
            "but take every fact from the MATERIAL, never from these):\n<<<PAST\n" + past + "\nPAST>>>")


def prompt(parts: dict[str, int], passages: list[dict[str, Any]], past: str) -> str:
    sections = "\n".join(f'- "{f}": {n} {SPECS[f]}' for f, n in parts.items())
    common = ('Every question object also has: "explanation" (why the answer is right), "hint" (helps without giving the answer), '
              '"difficulty" (1-3), "source_id" and "quote".')
    profile = ('"exam_profile": {"type_counts": {"<one of: ' + ", ".join(TYPE_LABELS) + '>": <number of such questions in a '
               'typical past exam>}, "duration_minutes": null, "number_of_questions": null, "notes": "one sentence on the exam style"}')
    files = list(dict.fromkeys(p["file"] for p in passages))
    spread = ("\n\nThe MATERIAL comes from several lessons (named in brackets after each passage id): "
              + "; ".join(files[:20]) + ". Spread the questions evenly across all of them.") if len(files) > 1 else ""
    return f"""TASK: generate_questions
SECTIONS: {", ".join(f"{f}={n}" for f, n in parts.items())}
Write these exam questions, varying topics across the material:
{sections}
{common}
Return JSON: {{"title": "short title for this material", {profile}, "sections": {{{", ".join(f'"{f}": [...]' for f in parts)}}}}}{spread}

{material_block(passages)}{_style(past)}"""


CHECK_SYSTEM = (
    "You are a strict, independent exam reviewer. You did not write these questions. Judge each ONLY against its cited "
    "MATERIAL passage. Mark ok=false if anything is unsupported or ambiguous, or if the stated answer key is not the only "
    "correct one. For items with a \"solve\" field, solve that problem yourself from scratch, step by step, and put only "
    "your final result in final_answer. Return only JSON."
)


# --- validation -------------------------------------------------------------------

def _distinct(xs: list[str]) -> bool:
    return len({x.strip().lower() for x in xs}) == len(xs)


def _structure_ok(fmt: str, q: Base) -> str | None:
    """None if the answer key is internally consistent, else a reason."""
    if isinstance(q, MCQ) and not _distinct(q.options):
        return "duplicate options"
    if isinstance(q, Multi):
        if not _distinct(q.options):
            return "duplicate options"
        if len(set(q.correct)) != len(q.correct) or any(not 0 <= i < len(q.options) for i in q.correct):
            return "invalid correct options"
        if len(q.correct) == len(q.options):
            return "every option was marked correct"
    if isinstance(q, Blank):
        q.sentence = re.sub(r"_{3,}", BLANK, q.sentence)
        if q.sentence.count(BLANK) != 1:
            return "needs exactly one blank"
        if not all(a.strip() for a in q.answers):
            return "empty accepted answer"
    if isinstance(q, Match):
        if not _distinct([p.left for p in q.pairs]) or not _distinct([p.right for p in q.pairs]):
            return "matching items repeat"
    if isinstance(q, Open) and fmt == "written" and q.problem and not (q.final_answer or "").strip():
        return "problem without a final answer"
    return None


def _must_hold(fmt: str, q: Base) -> list[str]:
    if isinstance(q, MCQ):
        return [f"'{q.question}': option '{q.options[q.correct]}' is correct and is the only correct option among {q.options}."]
    if isinstance(q, Multi):
        right = [q.options[i] for i in q.correct]
        wrong = [o for i, o in enumerate(q.options) if i not in q.correct]
        return [f"'{q.question}': exactly these options are correct: {right}; these are incorrect: {wrong}."]
    if isinstance(q, TF):
        return [f"This statement is {'TRUE' if q.answer else 'FALSE'}: '{q.statement}'"]
    if isinstance(q, Blank):
        return [f"Filling the blank in '{q.sentence}' with '{q.answers[0]}' makes it correct, and each of {q.answers} is acceptable."]
    if isinstance(q, Match):
        return [f"Each pair is correct and no left item fits a different right item better: {[(p.left, p.right) for p in q.pairs]}"]
    assert isinstance(q, Open)
    holds = [f"This model answer to '{q.question}' is correct: '{q.model_answer}'", f"These key points are all correct: {q.key_points}"]
    if q.problem:
        holds.append(f"The final result is: {q.final_answer}")
    return holds


_NUM = re.compile(r"-?\d+(?:[.,]\d+)?")


def answers_agree(a: str, b: str) -> bool:
    """Compare two final answers by their numbers (1% tolerance); without numbers, by normalised text."""
    na = [float(x.replace(",", ".")) for x in _NUM.findall(a or "")]
    nb = [float(x.replace(",", ".")) for x in _NUM.findall(b or "")]
    if not na and not nb:
        return bool(_norm(a)) and _norm(a) == _norm(b)
    if not na or not nb:
        return False
    close = lambda x, y: abs(x - y) <= max(0.01, 0.01 * max(abs(x), abs(y)))
    small, big = (na, nb) if len(na) <= len(nb) else (nb, na)
    return all(any(close(x, y) for y in big) for x in small)


async def independent_check(items: list[dict[str, Any]], passages: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Returns {item id: result} for the items the reviewer approved."""
    if not items:
        return {}
    cited = {c for it in items for c in it["cites"]}
    user = f"""TASK: check_items
For each item, verify every statement in "must_hold" against the cited passages.
Return {{"results":[{{"id":"","ok":true,"reason":"short reason","final_answer":null}}]}} with one result per item.

ITEMS:
{json.dumps([{k: v for k, v in it.items() if k != 'cites'} for it in items], ensure_ascii=False)}

{material_block([p for p in passages if p['id'] in cited])}"""
    data = await llm.complete_json(CHECK_SYSTEM, user, temperature=0.0, max_tokens=16000)
    results = data.get("results", []) if isinstance(data, dict) else []
    return {str(r.get("id")): r for r in results if isinstance(r, dict) and r.get("ok") is True}


# --- assembly ---------------------------------------------------------------------

def _profile(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    counts = raw.get("type_counts") if isinstance(raw.get("type_counts"), dict) else {}
    parts: dict[str, int] = {}
    for label, n in counts.items():
        fmt = TYPE_LABELS.get(str(label).strip().lower())
        if fmt and isinstance(n, int) and 0 < n <= 100:
            parts[fmt] = parts.get(fmt, 0) + n
    dur, num = raw.get("duration_minutes"), raw.get("number_of_questions")
    return {"question_types": [k for k in counts if str(k).strip().lower() in TYPE_LABELS][:10], "parts": parts,
            "duration_minutes": dur if isinstance(dur, int) and 5 <= dur <= 600 else None,
            "number_of_questions": num if isinstance(num, int) and 1 <= num <= 200 else None,
            "notes": str(raw.get("notes", ""))[:300]}


def _exercise(fmt: str, q: Base, eid: str, topic: str, src: str, who: str) -> dict[str, Any]:
    base = {"id": eid, "topic": topic, "format": fmt, "difficulty": q.difficulty, "latex": "", "answer_latex": "",
            "source_ids": [q.source_id], "hint": q.hint or "Re-read the part of your course this question is about.",
            "provenance": f"Generated by {who} from your document and checked against it."}
    sol = lambda text: [{"text": text, "latex": "", "quote": q.quote, "source": src}]
    if isinstance(q, MCQ):
        labels = (q.wrong_reasons + [None] * 4)[:4]
        labels[q.correct] = None
        return {**base, "prompt": q.question, "options": q.options, "answer": {"kind": "mcq", "correct": q.correct}, "labels": labels,
                "answer_text": f"{LETTERS[q.correct]}) {q.options[q.correct]}", "input_help": "Choose one answer.",
                "solution": sol(q.explanation or f"The answer is {LETTERS[q.correct]}.")}
    if isinstance(q, Multi):
        labels = (q.wrong_reasons + [None] * len(q.options))[:len(q.options)]
        for i in q.correct:
            labels[i] = None
        right = sorted(q.correct)
        return {**base, "prompt": q.question, "options": q.options, "answer": {"kind": "multi", "correct": right}, "labels": labels,
                "answer_text": ", ".join(f"{LETTERS[i]}) {q.options[i]}" for i in right), "input_help": "Select every correct answer.",
                "solution": sol(q.explanation or "")}
    if isinstance(q, TF):
        word = "True" if q.answer else "False"
        return {**base, "prompt": q.statement, "options": ["True", "False"], "answer": {"kind": "tf", "value": q.answer},
                "labels": [None, q.misconception] if q.answer else [q.misconception, None],
                "answer_text": word, "input_help": "True or false?", "solution": sol(q.explanation or f"The statement is {word.lower()}.")}
    if isinstance(q, Blank):
        return {**base, "prompt": q.sentence, "answer": {"kind": "blank", "accepted": q.answers}, "answer_text": q.answers[0],
                "input_help": "Type the missing word or phrase.", "solution": sol(q.explanation or f"The missing part is {q.answers[0]}.")}
    if isinstance(q, Match):
        pairs = [p.model_dump() for p in q.pairs]
        return {**base, "prompt": q.instruction, "answer": {"kind": "match", "pairs": pairs},
                "answer_text": "; ".join(f"{p['left']} → {p['right']}" for p in pairs), "input_help": "Pick the matching item for each line.",
                "solution": sol(q.explanation or "")}
    assert isinstance(q, Open)
    ans: dict[str, Any] = {"kind": "open", "key_points": q.key_points, "model_answer": q.model_answer}
    if q.problem:
        ans |= {"problem": True, "final_answer": q.final_answer}
    help_text = {"short": "Answer in a few sentences.", "oral": "Answer as you would out loud."}.get(fmt, "Answer as you would in the exam, showing your working.")
    return {**base, "prompt": q.question, "answer": ans, "answer_text": q.model_answer, "input_help": help_text,
            "solution": sol(q.model_answer + (f"\n\nFinal answer: {q.final_answer}" if q.problem else ""))}


async def generate(parts: dict[str, int], passages: list[dict[str, Any]], past: str) -> dict[str, Any]:
    parts = {f: n for f, n in parts.items() if f in FORMATS and n > 0}
    if not parts:
        raise GenerationError("Choose at least one question.")
    by_id = {p["id"]: p for p in passages}
    pack_id = "u-" + uuid.uuid4().hex[:10]
    data = await llm.complete_json(SYSTEM, prompt(parts, passages, past), temperature=0.5, max_tokens=32000)
    if not isinstance(data, dict):
        raise GenerationError("The AI's reply wasn't usable. Try again.")
    title = str(data.get("title") or "My course").strip()[:80]
    sections = data.get("sections") if isinstance(data.get("sections"), dict) else {}
    dropped: list[str] = []

    parsed: list[tuple[str, Base]] = []
    for fmt in parts:
        raw_list = sections.get(fmt) if isinstance(sections.get(fmt), list) else []
        for i, raw in enumerate(raw_list):
            label = f"{fmt} question {i + 1}"
            try:
                q = MODELS[fmt].model_validate(raw)
            except ValidationError:
                dropped.append(f"{label}: malformed"); continue
            p = by_id.get(q.source_id)
            if not p or not quote_found(q.quote, p["text"]):
                dropped.append(f"{label}: its quote wasn't found in the cited passage"); continue
            if reason := _structure_ok(fmt, q):
                dropped.append(f"{label}: {reason}"); continue
            parsed.append((fmt, q))

    items = []
    for k, (fmt, q) in enumerate(parsed):
        item: dict[str, Any] = {"id": f"q{k}", "cites": [q.source_id], "must_hold": _must_hold(fmt, q)}
        if isinstance(q, Open) and q.problem:
            item["solve"] = q.question
        items.append(item)
    approved = await independent_check(items, passages)

    st = llm.status()
    who = "a simulated AI (test mode)" if st["test_mode"] else str(st["model"])
    exercises = []
    for k, (fmt, q) in enumerate(parsed):
        r = approved.get(f"q{k}")
        if r is None:
            dropped.append(f"{fmt} question: rejected by the independent review"); continue
        if isinstance(q, Open) and q.problem and not answers_agree(q.final_answer or "", str(r.get("final_answer") or "")):
            dropped.append(f"{fmt} question: the reviewer solved the problem and got a different answer"); continue
        exercises.append(_exercise(fmt, q, f"{pack_id}-q{len(exercises) + 1}", pack_id, by_id[q.source_id]["file"], who))
    if not exercises:
        raise GenerationError("None of the generated questions passed the checks against your document. Try again, or upload more detailed material.")
    return {
        "id": pack_id, "version": 2, "title": title, "format": next(iter(parts)) if len(parts) == 1 else "mixed",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "generator": {"provider": llm.provider(), "model": llm.model(), "test_mode": st["test_mode"]},
        "exercises": exercises, "exam_profile": _profile(data.get("exam_profile")), "dropped": dropped,
    }
