import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, Loader2, Play, QrCode, RefreshCw, Trash2 } from "lucide-react";
import ReadinessCard from "../components/ReadinessCard";
import RichText from "../components/RichText";
import { SourceQuote } from "../components/QuestionCard";
import { LETTERS } from "../components/Live";
import { ErrorState, Loading } from "../components/States";
import { accessCode, api } from "../lib/api";
import { readiness } from "../lib/readiness";
import { loadHistory, type History } from "../lib/storage";
import { useAI } from "../lib/useAI";
import { tokens } from "../lib/api";
import { FORMAT_INFO, FORMAT_ORDER, lessonPack, type Bank, type Course, type Exercise, type Format, type Lesson } from "../lib/types";
import { CourseMissing, useCourse } from "./Course";
import { useT } from "../i18n";

/** Generates a bank for one lesson in one format and saves it in the course. */
export async function createBank(course: Course, lesson: Lesson, format: Format, count: number): Promise<Course> {
  const res = await api.generate(format, lesson.passages, course.past_exams?.text ?? "", count);
  const bank: Bank = {
    format, created_at: res.created_at, generator: res.generator, dropped: res.dropped, approved: [],
    exercises: res.exercises.map((e) => ({ ...e, topic: lesson.id })),
  };
  return {
    ...course,
    exam_profile: course.exam_profile ?? (course.past_exams ? res.exam_profile : null),
    lessons: course.lessons.map((l) => (l.id === lesson.id ? { ...l, banks: { ...l.banks, [format]: bank } } : l)),
  };
}

export function useLesson() {
  const { courseId = "", lessonId = "" } = useParams();
  const c = useCourse(courseId);
  const lesson = c.course?.lessons.find((l) => l.id === lessonId);
  return { ...c, lesson };
}

export default function LessonPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { course, lesson, save } = useLesson();
  const ai = useAI();
  const [history, setHistory] = useState<History | null>(null);
  const [counts, setCounts] = useState(() => Object.fromEntries(FORMAT_ORDER.map((f) => [f, FORMAT_INFO[f].counts[1]])) as Record<Format, number>);
  const [busy, setBusy] = useState<Format | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState(accessCode.get());
  useEffect(() => { loadHistory().then(setHistory); }, []);

  if (course === undefined || !history) return <Loading />;
  if (!course) return <CourseMissing />;
  if (!lesson) return <ErrorState message={t("This lesson isn't in the course any more.")} />;
  const base = `/course/${course.id}/lesson/${lesson.id}`;

  async function generate(f: Format) {
    setBusy(f); setErr(null);
    if (ai.status?.access_code_required) accessCode.set(code.trim());
    try { await save(await createBank(course!, lesson!, f, counts[f])); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  const aiReady = !!ai.status?.enabled && ai.consent && (!ai.status.access_code_required || code.trim());

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6">
      <Link to={`/course/${course.id}`} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-mute hover:text-navy"><ArrowLeft size={16} aria-hidden /> {course.name}</Link>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{lesson.title}</h1>
      <p className="mt-1 text-navy-mute">{t("From {files}. Saved only on this device.", { files: lesson.sources.join(", ") })}</p>
      {lesson.truncated && <p className="mt-3 rounded-lg bg-paper px-4 py-3 ring-1 ring-line">{t("These files were long, so only the first part is used. Split very long material into several lessons.")}</p>}

      <h2 className="mt-8 text-xl font-bold">{t("Practice this lesson")}</h2>
      <p className="mt-1 text-navy-soft">{t("Pick the formats your exam uses. Questions are created the first time you open a format.")}</p>
      {[{ title: t("Graded instantly and exactly"), list: FORMAT_ORDER.filter((f) => FORMAT_INFO[f].exact) },
        { title: t("Graded against your lesson by AI"), list: FORMAT_ORDER.filter((f) => !FORMAT_INFO[f].exact) }].map((group) => (
        <div key={group.title} className="mt-6">
          <h3 className="text-sm font-bold uppercase tracking-wide text-navy-mute">{group.title}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.list.map((f) => {
              const bank = lesson.banks[f];
              const info = FORMAT_INFO[f];
              return (
                <div key={f} className={`flex flex-col rounded-xl border-2 bg-white p-4 ${bank ? "border-navy" : "border-line"}`}>
                  <h4 className="font-display text-lg font-bold">{t(info.name)}</h4>
                  <p className="mt-1 flex-1 text-[15px] text-navy-soft">{t(info.text)}</p>
                  {bank ? (
                    <div className="mt-3 grid gap-2">
                      <p className="text-sm text-navy-mute">{t("{n} question|{n} questions", { n: bank.exercises.length })}{bank.generator.test_mode && ` (${t("test mode")})`}</p>
                      <Link to={`${base}/practice/${f}`} className="btn-primary"><Play size={17} aria-hidden /> {t("Practice")}</Link>
                      <button className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-navy-mute hover:text-navy disabled:opacity-50" disabled={!aiReady || !!busy}
                        onClick={() => { if (confirm(t("Replace these questions with a new set?"))) generate(f); }}>
                        {busy === f ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />} {t("New questions")}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      <label className="inline-flex items-center gap-2 text-[15px]"><span className="text-navy-mute">{t("Questions")}</span>
                        <select value={counts[f]} onChange={(e) => setCounts({ ...counts, [f]: Number(e.target.value) })} className="rounded-md border border-line bg-white px-2 py-1 font-bold">
                          {info.counts.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <button className="btn-violet" disabled={!aiReady || !!busy} onClick={() => generate(f)}>
                        {busy === f ? <><Loader2 size={17} className="animate-spin" aria-hidden /> {t("Writing and checking")}</> : t("Create questions")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {busy && <p className="mt-3 text-sm text-navy-mute" role="status">{t("The AI writes the questions, then every quote is matched against this lesson and a second AI review checks the answers. This usually takes under a minute.")}</p>}
      {err && <p className="mt-3 rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}

      {ai.status && !ai.status.enabled && <p className="mt-4 rounded-lg bg-paper px-4 py-3 ring-1 ring-line">{t("Creating questions needs an AI connection on the server, which isn't set up yet. Lessons are saved and ready for when it is.")}</p>}
      {ai.status?.enabled && (!ai.consent || ai.status.access_code_required) && (
        <div className="mt-4 grid gap-3 rounded-xl border border-line bg-white p-5">
          {ai.status.test_mode && <p className="font-bold text-coral-ink">{t("Test mode: the server uses a simulated AI, so questions will be placeholder text.")}</p>}
          {!ai.consent && (
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={ai.consent} onChange={(e) => ai.setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-violet-ink" />
              <span className="text-[15px]">{ai.status.provider === "gemini"
                ? t("I understand that creating questions sends this lesson's text (and the course's past exams) to {provider}, which on Google's free tier may use it to improve its products. My material contains no personal data.", { provider: t(ai.provider) })
                : t("I understand that creating questions sends this lesson's text (and the course's past exams) to {provider}. My material contains no personal data.", { provider: t(ai.provider) })}</span>
            </label>
          )}
          {ai.status.access_code_required && (
            <label className="grid max-w-xs gap-1.5"><span className="font-bold">{t("Access code")}</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="min-h-[44px] rounded-lg border border-line px-3" autoComplete="off" />
            </label>
          )}
        </div>
      )}

      <div className="mt-10"><ReadinessCard r={readiness(lessonPack(course, lesson), history, lesson.id)} /></div>

      {(lesson.banks.quiz || lesson.banks.tf) && <ClassQuiz course={course} lesson={lesson} save={save} />}

      <button className="btn-ghost mt-12" onClick={async () => {
        if (!confirm(t("Delete the lesson “{lesson}”?", { lesson: lesson.title }))) return;
        await save({ ...course, lessons: course.lessons.filter((l) => l.id !== lesson.id) });
        navigate(`/course/${course.id}`);
      }}><Trash2 size={16} aria-hidden /> {t("Delete this lesson")}</button>
    </div>
  );
}

function ClassQuiz({ course, lesson, save }: { course: Course; lesson: Lesson; save: (c: Course) => Promise<void> }) {
  const { t } = useT();
  const banks = (["quiz", "tf"] as const).filter((f) => lesson.banks[f]).map((f) => lesson.banks[f]!);
  const exercises: Exercise[] = banks.flatMap((b) => b.exercises);
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [secs, setSecs] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const approved = new Set(banks.flatMap((b) => b.approved ?? []));
  const setApproved = (ids: string[]) => save({
    ...course, lessons: course.lessons.map((l) => (l.id === lesson.id ? { ...l, banks: Object.fromEntries(
      Object.entries(l.banks).map(([f, b]) => [f, b && (f === "quiz" || f === "tf") ? { ...b, approved: b.exercises.filter((e) => ids.includes(e.id)).map((e) => e.id) } : b]),
    ) } : l)),
  });
  async function launch() {
    setBusy(true); setErr(null);
    const questions = exercises.filter((e) => approved.has(e.id)).slice(0, 20).map((e) => ({
      id: e.id, prompt: e.answer.kind === "tf" ? t("True or false? {statement}", { statement: e.prompt }) : e.prompt, options: (e.options ?? []).map((o) => ({ text: o, latex: "" })),
      correct: e.answer.kind === "tf" ? (e.answer.value ? 0 : 1) : (e.answer as { correct: number }).correct, labels: e.labels ?? [], solution: e.solution,
    }));
    try {
      const r = await api.createQuiz({ title: `${course.name}: ${lesson.title}`, questions, seconds_per_question: secs });
      tokens.set("host", r.code, { token: r.host_token });
      navigate(`/host/${r.code}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">{t("Using questions in class")}</h2>
      <p className="mt-1 max-w-[46rem] text-navy-soft">{t("Multiple-choice and true/false questions work on phones in a live class quiz. Professors: open a question, check it and its answer, and approve it.")}</p>
      <ul className="mt-4 grid gap-2.5">
        {exercises.map((e, i) => (
          <li key={e.id} className={`rounded-xl border-2 bg-white ${approved.has(e.id) ? "border-teal" : "border-line"}`}>
            <button className="flex w-full items-start justify-between gap-3 p-4 text-left" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
              <span className="min-w-0"><span className="text-navy-mute">Q{i + 1}. </span><RichText text={e.prompt} />{approved.has(e.id) && <span className="ml-2 text-sm font-bold text-teal-ink">{t("approved")}</span>}</span>
              <ChevronDown size={18} className={`mt-1 shrink-0 text-navy-mute ${open === e.id ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {open === e.id && (
              <div className="grid gap-3 border-t border-line p-4">
                <ul className="grid gap-2">
                  {(e.options ?? []).map((o, k) => {
                    const right = e.answer.kind === "tf" ? (k === 0) === e.answer.value : k === (e.answer as { correct: number }).correct;
                    return (
                      <li key={k} className="flex gap-3 text-[15px]">
                        <span className={`font-display font-bold ${right ? "text-teal-ink" : "text-navy-mute"}`}>{LETTERS[k]}</span>
                        <span><RichText text={o} /><span className={`block text-sm ${right ? "font-bold text-teal-ink" : "text-navy-mute"}`}>{right ? t("Correct") : e.labels?.[k] ?? ""}</span></span>
                      </li>
                    );
                  })}
                </ul>
                {e.solution[0]?.quote && <SourceQuote quote={e.solution[0].quote} source={e.solution[0].source} />}
                <button className={`justify-self-start ${approved.has(e.id) ? "btn-ghost" : "btn-violet"}`}
                  onClick={() => setApproved(approved.has(e.id) ? [...approved].filter((x) => x !== e.id) : [...approved, e.id])}>
                  <Check size={17} aria-hidden /> {approved.has(e.id) ? t("Approved (undo)") : t("I checked it: approve")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-line bg-white px-4">
          <span className="text-[15px] text-navy-mute">{t("Per question")}</span>
          <select value={secs} onChange={(e) => setSecs(Number(e.target.value))} className="bg-transparent font-bold outline-none">
            {[30, 45, 60, 90, 120].map((s) => <option key={s} value={s}>{s} s</option>)}
          </select>
        </label>
        <button className="btn-primary" disabled={!approved.size || busy} onClick={launch}>
          {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <QrCode size={17} aria-hidden />} {t("Create a class quiz ({n} approved)", { n: Math.min(approved.size, 20) })}
        </button>
        {err && <p className="w-full text-coral-ink" role="alert">{t(err)}</p>}
      </div>
    </section>
  );
}
