# Rehearsal

**Practice in the format of your real exam.**

Students create a course for each subject they take (e.g. "Systems"), add its lessons and past exams, and either
practice one lesson in a chosen format (multiple choice, written or oral) or take a timed mock exam across all lessons.
Professors run live class quizzes and see, after every question, what the room got wrong and why.
The home page has a try-it-now demo with mathematically verified Calculus 1 questions (multiple choice, typed answer,
true/false), which also serve as ready-made questions for class quizzes and duels. The app is in English, French and Italian.

## What works

| Area | Status |
|---|---|
| Home page demo: verified Calculus questions in 3 formats (multiple choice, typed, true/false), answerable in place | Working |
| Calculus 1 bank (33 SymPy-verified questions) as ready-made questions for class quizzes and duels | Working |
| Interface in English, French and Italian, picker in the header; Calculus content translated exactly | Working |
| Multiple-choice versions of every Calculus question; each wrong option comes from a named common mistake | Working |
| Practice sessions: confidence check, 5 questions, hints, worked solutions, readiness, recurring mistake | Working |
| Courses → lessons: upload each lesson's material (PDF, Word, PowerPoint, text); past exams per course | Working |
| Per lesson, per format question banks, created on demand in the past exams' style, any subject | Working (needs an AI key) |
| Formats graded exactly: multiple choice, multiple response (partial credit), true/false, fill in the blanks (accepted variants), matching | Working |
| Formats graded by AI against the lesson: short answer, long answer & problems (marked point by point), oral | Working |
| Problems: the reviewer AI solves each one again; if its final answer differs, the problem is discarded | Working |
| Timed mock exam across chosen lessons, in any mix of the 7 written formats, defaulting to the past exams' mix; report by lesson | Working (needs an AI key) |
| Exam profile read from past exams (question types, length, duration), used to set up the mock exam | Working |
| Live class quiz: QR join, per-question timer, reveal with answer breakdown, class summary, scores | Working |
| Privacy: breakdowns and scores hidden below 3 teams; no accounts; uploads not stored on the server | Working |
| Offline: installable app; Calculus and multiple-choice practice work with no internet | Working |
| Light and dark themes (follows the device, or chosen in the header) | Working |
| Duel: two phones, same questions, first correct answer wins the point; runs itself, link/QR invite | Working (needs the server) |
| Daily streak: a day counts at 5 answers anywhere in the app; current and best streak, 7-day strip | Working (on this device) |

## Repository layout

```
├── content/                   Python: Calculus question bank
│   ├── rehearsal/verify.py      SymPy maths checker
│   ├── rehearsal/exercises.py   Questions, multiple-choice versions, checker test vectors
│   ├── rehearsal/build_pack.py  Verifies everything and exports the pack
│   └── tests/
├── backend/                   FastAPI server (Render)
│   ├── app/main.py              Live quiz routes, upload + AI routes
│   ├── app/quiz.py              Quiz rules, per-question results, summary, insights
│   ├── app/genpack.py           Question generation, quote check, independent review
│   │                            (POST /api/generate per lesson, POST /api/mock-exam across lessons)
│   ├── app/oral.py              Oral examiner (with answer-leak guard) and written grading
│   ├── app/llm.py               Gemini / Claude / simulated AI, retries and fallback model
│   └── tests/
└── frontend/                  React app (Vercel)
    ├── src/lib/mathcheck.ts     Exact typed-answer checker (cross-tested against SymPy)
    ├── src/lib/readiness.ts     Readiness and session picking
    └── vite.config.ts           Also generates the offline service worker
```

## How questions are made trustworthy

**Calculus (no AI):** every answer is computed and checked with SymPy before the pack is published. Typed answers
are compared with exact fractions, so `0.333` is never accepted for `1/3`, and anything the checker can't prove
gets "can't verify that form" instead of a grade. Every wrong multiple-choice option is built from a specific
mistake (forgot the endpoints, solved f(x) = 0, forgot the inner derivative...) and SymPy confirms it's wrong.

**Uploaded material (AI):**
1. Every question must quote the passage it comes from; the quote must appear word for word, or the question is dropped.
2. A second, independent AI call reviews each question against its passage; anything it doesn't approve is dropped.
3. Professors approve each question before it can be used in class.

These questions are labelled "generated from your document and checked against it", never "verified".
Written answers and oral scores are graded by AI and labelled as such.

## Privacy

- No accounts, no real names. Courses, lessons, practice history and mock results stay in the browser;
  professors never see them. Uploading a lesson only extracts its text; no AI is used until you create questions.
- Uploaded files are read in memory on the server and not stored. Generated questions are saved only in the
  uploader's browser. Uploaders confirm that their text will be sent to the AI provider.
- Class quizzes store team nicknames and answers only, and are deleted after 3 hours. The server keeps no
  request logs. Breakdowns appear only when at least 3 teams answered.

---

## Run locally

```bash
cd frontend && npm install && npm run dev          # http://localhost:5173
cd backend  && pip install -r requirements-dev.txt && LLM_PROVIDER=fake uvicorn app.main:app --reload --port 8000
cd content  && pip install -r requirements.txt && python -m rehearsal.build_pack && pytest
```

`LLM_PROVIDER=fake` runs a simulated AI so everything can be tried without a key; its output is labelled test mode.
Tests: `npm run check` (frontend), `pytest` in `backend/` and `content/`.

## Deploy

**Vercel (website):** Root Directory `frontend`, preset Vite, environment variable `VITE_API_URL` = your Render URL.
Redeploy after changing variables.

**Render (server):** Root Directory `backend`, build `pip install -r requirements.txt`,
start `uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log`. Environment variables:

| Key | Value |
|---|---|
| `ALLOWED_ORIGINS` | your Vercel address |
| `LLM_PROVIDER` | `gemini` (or `anthropic`) |
| `GEMINI_API_KEY` | key from aistudio.google.com |
| `LLM_MODEL` | current model name from your model list |
| `LLM_FALLBACK_MODEL` | optional lighter model used when the main one is overloaded |
| `ACCESS_CODE` | optional: required before anyone can use AI features |

Render's free plan sleeps after 15 idle minutes (first request takes about a minute) and loses open quizzes on restart.
Open `/api/health` a few minutes before a demo.

## Languages

The interface is in English, French and Italian (`frontend/src/i18n/`). English text is the key; `fr.ts` and `it.ts`
hold the translations, with `{placeholders}` and `singular|plural` forms chosen by each language's plural rules.
`npm run check` fails if any visible text is not wrapped in `t()`, if a key has no French or Italian entry, or if a
translation drops a placeholder. The Calculus bank's texts are translated exactly in `content/rehearsal/i18n.py`
(the pack build fails on any untranslated string). Questions generated from uploads stay in the language of the
uploaded material; AI feedback follows the language of the student's answer.

## Known limitations

- Scanned PDFs have no text to read. Long material is cut to about 90,000 characters per upload.
- Generated questions are carefully checked, not proven: professors should approve before class.
- On Google's free tier, Google may use what's sent to improve its products.
