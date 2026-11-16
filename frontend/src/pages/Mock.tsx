import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, Loader2, X } from "lucide-react";
import RichText from "../components/RichText";
import { SourceQuote } from "../components/QuestionCard";
import { Bars, LETTERS, fmt } from "../components/Live";
import { Loading } from "../components/States";
import { accessCode, api } from "../lib/api";
import { addExerciseAttempt, getKV, newId, setKV } from "../lib/storage";
import { useAI } from "../lib/useAI";
import { gradeBlank, gradeMatch, gradeMulti, halves, shuffled } from "../lib/grading";
import { FORMAT_INFO, FORMAT_ORDER, type Course, type Exercise, type Format, type Passage } from "../lib/types";

type WrittenFormat = Exclude<Format, "oral">;
const EXAM_FORMATS = FORMAT_ORDER.filter((f) => f !== "oral") as WrittenFormat[];
const MAX_TOTAL = 40;

/** Points a question is worth in the mock exam. */
export function maxPoints(q: Exercise): number {
  const k = q.answer.kind;
  if (k === "open") return q.format === "short" ? 2 : Math.max(2, q.answer.key_points.length);
  return k === "multi" || k === "match" ? 2 : 1;
}
import { CourseMissing, useCourse } from "./Course";
import { useT } from "../i18n";

const MATERIAL_BUDGET = 85_000; // characters sent to the AI, shared fairly between the chosen lessons

interface Grade { points: number; max: number; verdict: "correct" | "partial" | "incorrect" | "ungraded"; feedback?: string; covered?: number[] }
interface ExamState {
  courseId: string;
  questions: Exercise[];       // multiple choice first, then written
  minutes: number;
  started: number;
  deadline: number;
  answers: Record<string, string>; // mcq: option index as text; written: the answer text
  submitted?: number;
  grades?: Record<string, Grade>;
  lessonTitles: Record<string, string>;
}

const keyFor = (courseId: string) => `mock:${courseId}`;

/** Samples each chosen lesson's passages evenly so all lessons fit in one request, and renumbers them. */
export function buildMaterial(course: Course, lessonIds: string[]): { passages: Passage[]; lessonOf: Record<string, string> } {
  const chosen = course.lessons.filter((l) => lessonIds.includes(l.id) && l.passages.length);
  const budget = Math.floor(MATERIAL_BUDGET / Math.max(1, chosen.length));
  const passages: Passage[] = [];
  const lessonOf: Record<string, string> = {};
  for (const l of chosen) {
    const total = l.passages.reduce((n, p) => n + p.text.length, 0);
    const step = Math.max(1, Math.ceil(total / budget));
    let used = 0;
    for (let i = 0; i < l.passages.length && used < budget; i += step) {
      const id = `P${passages.length + 1}`;
      passages.push({ id, file: l.title, text: l.passages[i].text });
      lessonOf[id] = l.id;
      used += l.passages[i].text.length;
    }
  }
  return { passages, lessonOf };
}

export default function MockPage() {
  const id = useParams().courseId ?? "";
  const { course, save } = useCourse(id);
  const [exam, setExam] = useState<ExamState | null | undefined>(undefined);
  useEffect(() => { getKV<ExamState>(keyFor(id)).then((e) => setExam(e ?? null)); }, [id]);
  const update = (e: ExamState | null) => { setExam(e); setKV(keyFor(id), e); };

  if (course === undefined || exam === undefined) return <Loading />;
  if (!course) return <CourseMissing />;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6">
      <Link to={`/course/${course.id}`} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-mute hover:text-navy"><ArrowLeft size={16} aria-hidden /> {course.name}</Link>
      {!exam && <Setup course={course} onReady={update} />}
      {exam && !exam.submitted && <Exam exam={exam} update={update} />}
      {exam?.submitted && <Report course={course} exam={exam} update={update} save={save} />}
    </div>
  );
}

function defaultParts(course: Course, minutes: number): Record<WrittenFormat, number> {
  const parts = Object.fromEntries(EXAM_FORMATS.map((f) => [f, 0])) as Record<WrittenFormat, number>;
  const fromPast = course.exam_profile?.parts ?? {};
  const known = EXAM_FORMATS.filter((f) => (fromPast[f] ?? 0) > 0);
  if (known.length) {
    const total = known.reduce((n, f) => n + (fromPast[f] ?? 0), 0);
    const scale = Math.min(1, MAX_TOTAL / total);
    for (const f of known) parts[f] = Math.max(1, Math.min(25, Math.round((fromPast[f] ?? 0) * scale)));
  } else {
    parts.quiz = Math.min(15, Math.max(5, Math.round(minutes / 5)));
    parts.short = Math.min(4, Math.max(2, Math.round(minutes / 20)));
  }
  return parts;
}

function Setup({ course, onReady }: { course: Course; onReady: (e: ExamState) => void }) {
  const { t } = useT();
  const ai = useAI();
  const prof = course.exam_profile;
  const [lessons, setLessons] = useState<string[]>(course.lessons.map((l) => l.id));
  const [minutes, setMinutes] = useState(Math.min(180, Math.max(15, prof?.duration_minutes ?? 45)));
  const [parts, setParts] = useState<Record<WrittenFormat, number>>(() => defaultParts(course, minutes));
  const [code, setCode] = useState(accessCode.get());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const durations = [...new Set([20, 30, 45, 60, 90, 120, 180, minutes])].sort((a, b) => a - b);
  const total = EXAM_FORMATS.reduce((n, f) => n + parts[f], 0);
  const fromPast = !!prof?.parts && Object.keys(prof.parts).length > 0;

  async function start() {
    setBusy(true); setErr(null);
    if (ai.status?.access_code_required) accessCode.set(code.trim());
    try {
      const { passages, lessonOf } = buildMaterial(course, lessons);
      const res = await api.mockExam({ passages, past_exams: course.past_exams?.text ?? "", parts: Object.fromEntries(EXAM_FORMATS.filter((f) => parts[f]).map((f) => [f, parts[f]])) });
      const tag = (e: Exercise) => ({ ...e, topic: lessonOf[e.source_ids?.[0] ?? ""] ?? lessons[0] });
      const questions = EXAM_FORMATS.flatMap((f) => res.exercises.filter((e) => e.format === f).map(tag));
      if (!questions.length) throw new Error(t("No questions could be created. Try again."));
      const now = Date.now();
      onReady({
        courseId: course.id, questions, minutes, started: now, deadline: now + minutes * 60_000, answers: {},
        lessonTitles: Object.fromEntries(course.lessons.map((l) => [l.id, l.title])),
      });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  const aiReady = !!ai.status?.enabled && ai.consent && (!ai.status.access_code_required || code.trim());
  return (
    <div className="mt-4 grid gap-6">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{t("Mock exam")}</h1>
        <p className="mt-1 text-navy-soft">{t("Timed, across your lessons, with no hints and no feedback until you hand it in.")}
          {" "}{fromPast ? t("The mix below copies your past exams; adjust it if needed.") : t("Add past exams to the course and the mix will copy your real exam.")}</p>
      </div>

      <fieldset className="rounded-xl border border-line bg-white p-5">
        <legend className="px-1 font-bold">{t("Lessons included")}</legend>
        <ul className="grid gap-2">
          {course.lessons.map((l) => (
            <li key={l.id}>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={lessons.includes(l.id)} disabled={!l.passages.length} className="h-5 w-5 accent-navy"
                  onChange={(e) => setLessons(e.target.checked ? [...lessons, l.id] : lessons.filter((x) => x !== l.id))} />
                <span>{l.title}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="rounded-xl border border-line bg-white p-5">
        <legend className="px-1 font-bold">{t("Time and questions")}</legend>
        <label className="inline-flex items-center gap-3"><span className="text-navy-soft">{t("Time")}</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="min-h-[44px] rounded-lg border border-line bg-white px-3 font-bold">
            {durations.map((d) => <option key={d} value={d}>{t("{n} minutes", { n: d })}</option>)}
          </select>
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {EXAM_FORMATS.map((f) => (
            <label key={f} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
              <span>{t(FORMAT_INFO[f].name)}</span>
              <select value={parts[f]} onChange={(e) => setParts({ ...parts, [f]: Number(e.target.value) })} className="rounded-md border border-line bg-white px-2 py-1 font-bold">
                {[...new Set([0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, parts[f]])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className={`mt-3 text-[15px] ${total > MAX_TOTAL ? "font-bold text-coral-ink" : "text-navy-mute"}`}>{total > MAX_TOTAL ? t("{n} questions: the maximum is {max}.", { n: total, max: MAX_TOTAL }) : t("{n} question.|{n} questions.", { n: total })}</p>
      </fieldset>

      {ai.status && !ai.status.enabled && <p className="rounded-lg bg-paper px-4 py-3 ring-1 ring-line">{t("A mock exam is written by AI from your lessons, and no AI is set up on the server yet.")}</p>}
      {ai.status?.enabled && (!ai.consent || ai.status.access_code_required) && (
        <div className="grid gap-3 rounded-xl border border-line bg-white p-5">
          {!ai.consent && (
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={ai.consent} onChange={(e) => ai.setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-violet-ink" />
              <span className="text-[15px]">{t("I understand that this sends my lessons' text and past exams to {provider}. My material contains no personal data.", { provider: t(ai.provider) })}</span>
            </label>
          )}
          {ai.status.access_code_required && (
            <label className="grid max-w-xs gap-1.5"><span className="font-bold">{t("Access code")}</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="min-h-[44px] rounded-lg border border-line px-3" autoComplete="off" />
            </label>
          )}
        </div>
      )}
      {ai.status?.test_mode && <p className="font-bold text-coral-ink">{t("Test mode: the server uses a simulated AI, so questions will be placeholder text.")}</p>}
      {err && <p className="rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}
      <div>
        <button className="btn-primary" disabled={!aiReady || busy || !lessons.length || total === 0 || total > MAX_TOTAL} onClick={start}>
          {busy ? <><Loader2 size={17} className="animate-spin" aria-hidden /> {t("Writing your exam")}</> : <><Clock size={17} aria-hidden /> {t("Create the exam and start the clock")}</>}
        </button>
        {busy && <p className="mt-2 text-sm text-navy-mute" role="status">{t("Questions are written from your lessons, every quote is matched against them, and a second AI review checks the answers (and re-solves any problems). This can take a minute. The clock starts when the exam appears.")}</p>}
      </div>
    </div>
  );
}

function useClock(deadline: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function Exam({ exam, update }: { exam: ExamState; update: (e: ExamState) => void }) {
  const { t } = useT();
  const left = useClock(exam.deadline);
  const submitted = useRef(false);
  const answered = exam.questions.filter((q) => (exam.answers[q.id] ?? "").trim()).length;
  const submit = () => { if (!submitted.current) { submitted.current = true; update({ ...exam, submitted: Date.now() }); } };
  useEffect(() => { if (left === 0) submit(); }); // time's up: hand in automatically
  const set = (qid: string, v: string) => update({ ...exam, answers: { ...exam.answers, [qid]: v } });
  let n = 0;
  const sections = EXAM_FORMATS.map((f) => ({ format: f, items: exam.questions.filter((q) => (q.format ?? (q.answer.kind === "mcq" ? "quiz" : "written")) === f).map((q) => ({ q, n: ++n })) }))
    .filter((sec) => sec.items.length);

  return (
    <div className="mt-2">
      <div className="sticky top-[57px] z-20 -mx-4 mb-6 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <span className={`font-display text-2xl font-extrabold tabular-nums ${left <= 300 ? "text-coral-ink" : ""}`} role="timer" aria-label={t("{n} minute left|{n} minutes left", { n: Math.ceil(left / 60) })}>{fmt(left)}</span>
        <span className="text-[15px] text-navy-mute">{t("{done} of {n} answered", { done: answered, n: exam.questions.length })}</span>
        <button className="btn-primary" onClick={() => { if (confirm(answered < exam.questions.length ? t("Some questions are unanswered. Hand in anyway?") : t("Hand in your exam?"))) submit(); }}>{t("Hand in")}</button>
      </div>
      <h1 className="text-2xl font-bold">{t("Mock exam")}</h1>
      <p className="text-navy-mute">{t("{n} minutes. Your answers are saved on this device as you go; if you reload, the clock keeps running.", { n: exam.minutes })}</p>

      {sections.map((sec, si) => (
        <section key={sec.format} className="mt-8">
          <h2 className="text-xl font-bold">{t("Part {letter}: {format}", { letter: "ABCDEFG"[si], format: t(FORMAT_INFO[sec.format].name).toLowerCase() })}</h2>
          <ol className="mt-3 grid gap-4">
            {sec.items.map(({ q, n }) => (
              <li key={q.id} className="rounded-xl border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-bold"><span className="text-navy-mute">{n}. </span>{q.answer.kind !== "blank" && <RichText text={q.prompt} />}</span>
                  <span className="shrink-0 text-sm text-navy-mute">{t("{n} point|{n} points", { n: maxPoints(q) })}</span>
                </div>
                <div className="mt-3"><ExamInput q={q} value={exam.answers[q.id] ?? ""} onChange={(v) => set(q.id, v)} /></div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <button className="btn-primary mt-8" onClick={() => { if (confirm(t("Hand in your exam?"))) submit(); }}>{t("Hand in")}</button>
    </div>
  );
}

function Report({ course, exam, update, save }: { course: Course; exam: ExamState; update: (e: ExamState | null) => void; save: (c: Course) => Promise<void> }) {
  const { t } = useT();
  const [progress, setProgress] = useState(0);
  const started = useRef(false);
  const grades = exam.grades;

  // Grade once: multiple choice exactly, written answers with AI against the lesson material.
  useEffect(() => {
    if (grades || started.current) return;
    started.current = true;
    (async () => {
      const g: Record<string, Grade> = {};
      for (const q of exam.questions) {
        const raw = exam.answers[q.id] ?? "";
        const max = maxPoints(q);
        const a = q.answer;
        if (a.kind === "mcq" || a.kind === "tf") {
          const ok = raw !== "" && (a.kind === "mcq" ? Number(raw) === a.correct : (raw === "true") === a.value);
          g[q.id] = { points: ok ? max : 0, max, verdict: ok ? "correct" : "incorrect" };
        } else if (a.kind === "multi") {
          const r = gradeMulti(raw ? (JSON.parse(raw) as number[]) : [], a.correct);
          g[q.id] = { points: halves(r.fraction * max), max, verdict: r.exact ? "correct" : r.fraction > 0 ? "partial" : "incorrect" };
        } else if (a.kind === "blank") {
          const ok = gradeBlank(raw, a.accepted);
          g[q.id] = { points: ok ? max : 0, max, verdict: ok ? "correct" : "incorrect" };
        } else if (a.kind === "match") {
          const r = gradeMatch(raw ? (JSON.parse(raw) as (string | null)[]) : a.pairs.map(() => null), a.pairs);
          g[q.id] = { points: halves(r.fraction * max), max, verdict: r.exact ? "correct" : r.right ? "partial" : "incorrect" };
        } else if (a.kind === "open") {
          const ans = raw.trim();
          if (!ans) g[q.id] = { points: 0, max, verdict: "incorrect", feedback: t("No answer was given.") };
          else {
            try {
              const r = await api.grade({ question: q.prompt, key_points: a.key_points, model_answer: a.model_answer, final_answer: a.final_answer ?? "",
                sources: q.solution.map((s) => s.quote ?? "").filter(Boolean), answer: ans });
              const points = q.format === "short"
                ? (r.verdict === "correct" ? 2 : r.verdict === "partial" ? 1 : 0)
                : Math.min(max, r.covered.length || (r.verdict === "correct" ? max : 0));
              g[q.id] = { points, max, verdict: r.verdict, feedback: r.feedback, covered: r.covered };
            } catch {
              g[q.id] = { points: 0, max, verdict: "ungraded", feedback: t("This answer couldn't be graded (no connection to the AI). Compare it with the model answer below.") };
            }
          }
          setProgress((p) => p + 1);
        }
      }
      // Count every answer toward each lesson's readiness, and keep the result in the course.
      for (const q of exam.questions) {
        const gr = g[q.id];
        if (gr.verdict === "ungraded") continue;
        await addExerciseAttempt({ exerciseId: q.id, topic: q.topic, ts: Date.now(), attempts: 1, correct: gr.verdict !== "incorrect",
          firstTry: gr.verdict === "correct", usedHint: false, mistake: gr.verdict === "incorrect" ? mistakeFor(q, exam.answers[q.id] ?? "") : null });
      }
      const byLesson: Record<string, { score: number; max: number }> = {};
      for (const q of exam.questions) {
        const b = (byLesson[q.topic] ??= { score: 0, max: 0 });
        b.score += g[q.id].points; b.max += g[q.id].max;
      }
      const score = Object.values(g).reduce((n, x) => n + x.points, 0);
      const max = Object.values(g).reduce((n, x) => n + x.max, 0);
      await save({ ...course, mocks: [...course.mocks, {
        id: newId("m"), ts: Date.now(), minutes_allowed: exam.minutes, minutes_used: Math.round(((exam.submitted ?? Date.now()) - exam.started) / 60000),
        score, max, by_lesson: Object.entries(byLesson).map(([lesson_id, v]) => ({ lesson_id, title: exam.lessonTitles[lesson_id] ?? "Lesson", ...v })),
      }] });
      update({ ...exam, grades: g });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const writtenCount = exam.questions.filter((q) => q.answer.kind === "open").length;
  const summary = useMemo(() => {
    if (!grades) return null;
    const by: Record<string, { score: number; max: number }> = {};
    for (const q of exam.questions) { const b = (by[q.topic] ??= { score: 0, max: 0 }); b.score += grades[q.id].points; b.max += grades[q.id].max; }
    const score = Object.values(grades).reduce((n, x) => n + x.points, 0);
    const max = Object.values(grades).reduce((n, x) => n + x.max, 0);
    return { by, score, max };
  }, [grades, exam]);

  if (!grades || !summary) {
    return (
      <div className="py-16 text-center" role="status">
        <Loader2 className="mx-auto animate-spin text-violet" size={28} aria-hidden />
        <p className="mt-4 text-xl font-bold">{t("Marking your exam")}</p>
        {writtenCount > 0 && <p className="mt-1 text-navy-mute">{t("Written answers graded: {done} of {n}", { done: progress, n: writtenCount })}</p>}
      </div>
    );
  }
  const used = Math.round(((exam.submitted ?? 0) - exam.started) / 60000);
  const ungraded = Object.values(grades).some((g) => g.verdict === "ungraded");
  return (
    <div className="mt-4 grid gap-6">
      <div className="rounded-xl bg-navy px-6 py-5 text-white">
        <p className="text-white/70">{t("Mock exam result")}</p>
        <p className="font-display text-5xl font-extrabold">{Math.round((100 * summary.score) / summary.max)}%</p>
        <p className="mt-1 text-white/80">{used < 1
            ? t("{score} of {max} points, in under a minute.", { score: summary.score, max: summary.max })
            : t("{score} of {max} points, in {used} of {total} minutes.", { score: summary.score, max: summary.max, used, total: exam.minutes })}
          {writtenCount > 0 && ` ${t("Written answers were graded by AI against your lessons; it can make mistakes.")}`}</p>
      </div>
      {ungraded && <p className="rounded-lg bg-paper px-4 py-3 ring-1 ring-line">{t("Some written answers couldn't be graded and count as 0 for now. Check them against the model answers below.")}</p>}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-bold">{t("By lesson")}</h2>
        <div className="mt-3">
          <Bars rows={Object.entries(summary.by).map(([lid, v]) => ({ key: lid, count: Math.round((100 * v.score) / v.max), label: <span>{exam.lessonTitles[lid] ?? t("Lesson")} <span className="text-navy-mute">({v.score}/{v.max})</span></span> }))} />
        </div>
        <p className="mt-3 text-sm text-navy-mute">{t("Percent of points per lesson. Weakest lessons are the ones to practice next.")}</p>
      </section>

      <h2 className="text-xl font-bold">{t("Your answers")}</h2>
      <ol className="grid gap-4">
        {exam.questions.map((q, i) => {
          const g = grades[q.id];
          const ans = exam.answers[q.id] ?? "";
          return (
            <li key={q.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold"><span className="text-navy-mute">{i + 1}. </span><RichText text={q.prompt} /> <span className="text-sm font-normal text-navy-mute">({t(FORMAT_INFO[q.format ?? "quiz"].name)})</span></p>
                <span className={`shrink-0 font-display font-bold ${g.verdict === "correct" ? "text-teal-ink" : g.verdict === "partial" ? "" : "text-coral-ink"}`}>{g.points}/{g.max}</span>
              </div>
              <p className="mt-1 text-sm text-navy-mute">{exam.lessonTitles[q.topic]}</p>
              <ReviewAnswer q={q} raw={ans} grade={g} />
              {q.solution[0]?.quote && <SourceQuote quote={q.solution[0].quote} source={q.solution[0].source} />}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={() => update(null)}>{t("Set up another mock exam")}</button>
        <Link to={`/course/${course.id}`} className="btn-ghost">{t("Back to {course}", { course: course.name })}</Link>
      </div>
    </div>
  );
}

function mistakeFor(q: Exercise, raw: string): string | null {
  if (!raw) return null;
  if (q.answer.kind === "mcq") return q.labels?.[Number(raw)] ?? null;
  if (q.answer.kind === "tf") return q.labels?.[raw === "true" ? 0 : 1] ?? null;
  if (q.answer.kind === "multi") {
    const correct = q.answer.correct;
    const wrong = (JSON.parse(raw) as number[]).find((i) => !correct.includes(i));
    return wrong !== undefined ? q.labels?.[wrong] ?? null : null;
  }
  return null;
}

/** The answer field for each format, with no feedback (it's an exam). */
function ExamInput({ q, value, onChange }: { q: Exercise; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const a = q.answer;
  if (a.kind === "mcq" || a.kind === "tf") {
    const opts = a.kind === "tf" ? [t("True"), t("False")] : q.options ?? [];
    const val = (k: number) => (a.kind === "tf" ? String(k === 0) : String(k));
    return (
      <div className={`grid gap-2 ${a.kind === "tf" ? "grid-cols-2" : ""}`} role="radiogroup" aria-label={t("Answer")}>
        {opts.map((o, k) => {
          const on = value === val(k);
          return (
            <button key={k} role="radio" aria-checked={on} onClick={() => onChange(val(k))}
              className={`flex items-start gap-3 rounded-lg border-2 px-3 py-2 text-left ${on ? "border-navy bg-paper" : "border-line hover:border-navy-mute"}`}>
              {a.kind === "mcq" && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${on ? "bg-navy text-white" : "bg-paper"}`}>{LETTERS[k]}</span>}
              <span className={`pt-0.5 ${a.kind === "tf" ? "w-full text-center font-bold" : ""}`}><RichText text={o} /></span>
            </button>
          );
        })}
      </div>
    );
  }
  if (a.kind === "multi") {
    const sel: number[] = value ? JSON.parse(value) : [];
    return (
      <div className="grid gap-2">
        <p className="text-sm text-navy-mute">{t("Select every correct answer.")}</p>
        {(q.options ?? []).map((o, k) => {
          const on = sel.includes(k);
          return (
            <button key={k} role="checkbox" aria-checked={on} onClick={() => onChange(JSON.stringify(on ? sel.filter((x) => x !== k) : [...sel, k]))}
              className={`flex items-start gap-3 rounded-lg border-2 px-3 py-2 text-left ${on ? "border-navy bg-paper" : "border-line hover:border-navy-mute"}`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${on ? "border-navy bg-navy" : "border-line"}`} aria-hidden>{on && <Check size={12} className="text-white" strokeWidth={3} />}</span>
              <RichText text={o} />
            </button>
          );
        })}
      </div>
    );
  }
  if (a.kind === "blank") {
    const [before, after] = q.prompt.split("____");
    return (
      <p className="leading-loose">
        <RichText text={before ?? ""} />
        <input value={value} onChange={(e) => onChange(e.target.value.slice(0, 200))} aria-label={t("Missing word or phrase")} autoComplete="off"
          className="mx-1 inline-block w-48 border-b-2 border-navy bg-transparent px-1 font-bold outline-none focus:border-violet" />
        <RichText text={after ?? ""} />
      </p>
    );
  }
  if (a.kind === "match") {
    const chosen: (string | null)[] = value ? JSON.parse(value) : a.pairs.map(() => null);
    const rights = shuffled(a.pairs.map((p) => p.right), q.id);
    return (
      <ul className="grid gap-2">
        {a.pairs.map((p, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
            <span className="font-bold"><RichText text={p.left} /></span>
            <select value={chosen[i] ?? ""} aria-label={`Match for ${p.left}`} className="min-h-[44px] rounded-lg border border-line bg-white px-2"
              onChange={(e) => onChange(JSON.stringify(chosen.map((c, k) => (k === i ? e.target.value || null : c))))}>
              <option value="">{t("Choose…")}</option>
              {rights.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <textarea rows={q.format === "short" ? 3 : 8} value={value} onChange={(e) => onChange(e.target.value.slice(0, 6000))} aria-label={t("Your answer")}
      className="w-full rounded-lg border border-line p-3 outline-none focus:border-violet" />
  );
}

/** After grading: what you answered and what was expected. */
function ReviewAnswer({ q, raw, grade }: { q: Exercise; raw: string; grade: Grade }) {
  const { t } = useT();
  const a = q.answer;
  const ok = grade.verdict === "correct";
  const mark = ok ? <Check size={18} className="shrink-0 text-teal-ink" aria-hidden /> : <X size={18} className="shrink-0 text-coral-ink" aria-hidden />;
  if (a.kind === "open") {
    return (
      <div className="mt-3 grid gap-2 text-[15px]">
        <p className="whitespace-pre-line rounded-md bg-paper p-3">{raw || <span className="text-navy-mute">{t("No answer.")}</span>}</p>
        {grade.feedback && <p><b>{t("Feedback:")}</b> {grade.feedback}</p>}
        {q.format !== "short" && a.key_points.length > 1 && grade.covered && (
          <ul className="grid gap-1">
            {a.key_points.map((k, i) => (
              <li key={i} className="flex gap-2">{grade.covered!.includes(i) ? <Check size={16} className="mt-0.5 text-teal-ink" aria-label={t("mark earned")} /> : <X size={16} className="mt-0.5 text-coral-ink" aria-label={t("mark missed")} />}<RichText text={k} /></li>
            ))}
          </ul>
        )}
        <p><b>{t("Model answer:")}</b> <RichText text={a.model_answer} /></p>
        {a.problem && <p className="text-sm text-navy-mute">{t("Final answer: {answer}. Computed by AI and solved a second time to check it.", { answer: a.final_answer ?? "" })}</p>}
      </div>
    );
  }
  let yours = t("none");
  if (raw) {
    if (a.kind === "mcq") yours = `${LETTERS[Number(raw)]}) ${q.options?.[Number(raw)] ?? ""}`;
    else if (a.kind === "tf") yours = raw === "true" ? t("True") : t("False");
    else if (a.kind === "multi") yours = (JSON.parse(raw) as number[]).sort().map((i) => LETTERS[i]).join(", ") || t("none");
    else if (a.kind === "blank") yours = raw;
    else if (a.kind === "match") yours = (JSON.parse(raw) as (string | null)[]).map((c, i) => `${a.pairs[i].left} → ${c ?? "?"}`).join("; ");
  }
  return (
    <div className="mt-3 grid gap-1.5 text-[15px]">
      {q.answer.kind === "blank" && <p className="text-navy-soft"><RichText text={q.prompt} /></p>}
      <p className="flex gap-2">{mark}<span>{t("Your answer:")} <b>{yours}</b></span></p>
      {!ok && <p>{t("Correct:")} <b>{a.kind === "tf" ? t(q.answer_text ?? "") : q.answer_text}</b></p>}
    </div>
  );
}
