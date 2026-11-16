import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BadgeCheck, ChevronDown, FileUp, Loader2, QrCode } from "lucide-react";
import TeX from "../components/Math";
import { ErrorState, Loading } from "../components/States";
import { usePack } from "../components/usePack";
import { LETTERS } from "../components/Live";
import { api, tokens } from "../lib/api";
import { listCourses } from "../lib/storage";
import type { Course, TopicId } from "../lib/types";
import { useT } from "../i18n";

export default function ProfessorDashboard() {
  const { t, lang } = useT();
  const { pack, error, retry } = usePack();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<TopicId>("closed-interval");
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [secs, setSecs] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  useEffect(() => { listCourses().then(setCourses); }, []);
  const quizLessons = courses.flatMap((c) => c.lessons.filter((l) => l.banks.quiz).map((l) => ({ c, l })));

  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!pack) return <Loading />;
  const qs = pack.exercises.filter((e) => e.topic === topic);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 20 ? [...p, id] : p));

  async function launch() {
    setBusy(true); setErr(null);
    try {
      const r = await api.createQuiz({ exercise_ids: picked, seconds_per_question: secs, lang });
      tokens.set("host", r.code, { token: r.host_token });
      navigate(`/host/${r.code}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-8">
      <h1 className="text-3xl font-bold sm:text-4xl">{t("Run a live class quiz")}</h1>
      <p className="mt-1 max-w-[42rem] text-navy-mute">
        {t("Pick exam-style questions, show the QR code, and teams answer on their phones one question at a time. After each one you see what the room got wrong, and why.")}
      </p>

      <section className="mt-8 rounded-xl border-2 border-violet bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">{t("Any subject: use your own course")}</h2>
            <p className="text-[15px] text-navy-soft">{t("Create a course, add a lesson with your slides, and create its multiple-choice questions. You approve each question before it reaches your class.")}</p>
          </div>
          <Link to="/student" className="btn-violet"><FileUp size={17} aria-hidden /> {t("Go to my courses")}</Link>
        </div>
        {quizLessons.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {quizLessons.map(({ c, l }) => <li key={l.id}><Link to={`/course/${c.id}/lesson/${l.id}`} className="inline-block rounded-full bg-violet-wash px-4 py-2 font-bold text-violet-ink hover:underline">{c.name}: {l.title}</Link></li>)}
          </ul>
        )}
      </section>

      <h2 className="mt-10 text-xl font-bold">{t("Ready-made questions: Calculus 1")}</h2>
      <p className="mt-1 text-[15px] text-navy-mute">{t("Handy for trying a class quiz before you've uploaded a course. Every answer is checked with SymPy, and every wrong option comes from a specific, common mistake.")}</p>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={t("Topic")}>
        {pack.topics.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === topic} onClick={() => setTopic(t.id)}
            className={`min-h-[44px] rounded-full px-4 font-bold ${t.id === topic ? "bg-navy text-white" : "border border-line bg-white text-navy-soft hover:border-navy-mute"}`}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[15px]">
        <button className="font-bold text-violet-ink underline underline-offset-4" onClick={() => setPicked((p) => [...new Set([...p, ...qs.map((q) => q.id)])].slice(0, 20))}>{t("Select all in this topic")}</button>
        {picked.length > 0 && <button className="font-bold text-navy-mute underline underline-offset-4" onClick={() => setPicked([])}>{t("Clear selection")}</button>}
      </div>

      <ul className="mt-4 grid gap-2.5">
        {qs.map((e) => {
          const m = e.mcq!;
          const on = picked.includes(e.id);
          return (
            <li key={e.id} className={`rounded-xl border-2 bg-white ${on ? "border-navy" : "border-line"}`}>
              <div className="flex items-start gap-3 p-4">
                <input type="checkbox" checked={on} onChange={() => toggle(e.id)} aria-label={`Include: ${m.prompt}`} className="mt-1.5 h-5 w-5 shrink-0 accent-navy" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{m.prompt} <span className="ml-1 text-sm font-normal text-navy-mute">{t("difficulty {d}", { d: e.difficulty })}</span></p>
                  <TeX tex={e.latex} />
                </div>
                <button className="inline-flex items-center gap-1 text-sm font-bold text-violet-ink" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                  {t("Options")} <ChevronDown size={16} className={open === e.id ? "rotate-180" : ""} aria-hidden />
                </button>
              </div>
              {open === e.id && (
                <ul className="grid gap-2 border-t border-line p-4">
                  {m.options.map((o, k) => (
                    <li key={k} className="flex items-start gap-3 text-[15px]">
                      <span className={`font-display font-bold ${k === m.correct ? "text-teal-ink" : "text-navy-mute"}`}>{LETTERS[k]}</span>
                      <span className="min-w-0"><TeX tex={o} />
                        <span className={`block text-sm ${k === m.correct ? "font-bold text-teal-ink" : "text-navy-mute"}`}>{k === m.correct ? t("Correct") : m.labels[k]}</span>
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-1.5 text-sm text-navy-mute"><BadgeCheck size={15} className="text-teal-ink" aria-hidden /> {t("Verified with {checker}", { checker: e.verification?.checker ?? "SymPy" })}</li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p>{t("{n} question selected|{n} questions selected", { n: picked.length })}{picked.length >= 20 && ` (${t("maximum")})`}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-line bg-white px-4">
              <span className="text-[15px] text-navy-mute">{t("Per question")}</span>
              <select value={secs} onChange={(e) => setSecs(Number(e.target.value))} className="bg-transparent font-bold outline-none">
                {[30, 45, 60, 90, 120].map((s) => <option key={s} value={s}>{s} s</option>)}
              </select>
            </label>
            <button className="btn-primary" disabled={!picked.length || busy} onClick={launch}>
              {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <QrCode size={17} aria-hidden />} {t("Create the quiz")}
            </button>
          </div>
          {err && <p className="w-full text-coral-ink" role="alert">{t(err)}</p>}
        </div>
      </div>
    </div>
  );
}
