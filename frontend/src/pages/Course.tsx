import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ChevronRight, Clock, FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import FilePicker from "../components/FilePicker";
import { ErrorState, Loading } from "../components/States";
import { api } from "../lib/api";
import { courseReadiness, readiness } from "../lib/readiness";
import { deleteCourse, getCourse, loadHistory, newId, saveCourse, type History } from "../lib/storage";
import { FORMAT_INFO, FORMAT_ORDER, lessonPack, type Course, type Format } from "../lib/types";
import { useT } from "../i18n";

export const FORMAT_NAME = Object.fromEntries(FORMAT_ORDER.map((f) => [f, FORMAT_INFO[f].name])) as Record<Format, string>;

/** Loads a course from this device and keeps it in sync after saves. */
export function useCourse(id: string) {
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const reload = useCallback(() => { getCourse(id).then((c) => setCourse(c ?? null)); }, [id]);
  useEffect(reload, [reload]);
  const save = useCallback(async (c: Course) => { await saveCourse(c); setCourse(c); }, []);
  return { course, save, reload };
}

export const CourseMissing = () => <ErrorState message="This course isn't on this device. Courses are stored only in the browser where you created them." />;

export default function CoursePage() {
  const { t } = useT();
  const id = useParams().courseId ?? "";
  const navigate = useNavigate();
  const { course, save } = useCourse(id);
  const [history, setHistory] = useState<History | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { loadHistory().then(setHistory); }, []);

  if (course === undefined || !history) return <Loading />;
  if (!course) return <CourseMissing />;
  const overall = courseReadiness(course, history);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6">
      <Link to="/student" className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-mute hover:text-navy"><ArrowLeft size={16} aria-hidden /> {t("All courses")}</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{course.name}</h1>
          <p className="mt-1 text-navy-mute">
            {t("{n} lesson|{n} lessons", { n: course.lessons.length })}
            {overall.score !== null && <>. {t("Readiness across all lessons: {pct}%", { pct: overall.score })}</>}
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-mute hover:text-navy"
          onClick={() => { const n = prompt(t("Rename this course"), course.name)?.trim(); if (n) save({ ...course, name: n.slice(0, 60) }); }}>
          <Pencil size={15} aria-hidden /> {t("Rename")}
        </button>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t("Lessons")}</h2>
          {!adding && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={17} aria-hidden /> {t("Add a lesson")}</button>}
        </div>
        {adding && <AddLesson course={course} save={save} onDone={(lid) => { setAdding(false); if (lid) navigate(`/course/${course.id}/lesson/${lid}`); }} />}
        {course.lessons.length === 0 && !adding && (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-white p-6">
            <p className="font-bold">{t("No lessons yet.")}</p>
            <p className="mt-1 text-navy-mute">{t("Add one lesson at a time (for example \"Scheduling\" with its slides), so you can practice them separately and take a mock exam across all of them.")}</p>
          </div>
        )}
        <ul className="mt-4 grid gap-3">
          {course.lessons.map((l) => {
            const r = readiness(lessonPack(course, l), history, l.id);
            const formats = FORMAT_ORDER.filter((f) => l.banks[f]);
            return (
              <li key={l.id}>
                <Link to={`/course/${course.id}/lesson/${l.id}`} className="flex items-center gap-4 rounded-xl border-2 border-line bg-white p-4 hover:border-navy">
                  <BookOpen size={20} className="shrink-0 text-violet-ink" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{l.title}</span>
                    <span className="block text-[15px] text-navy-soft">{formats.length ? formats.map((f) => t(FORMAT_NAME[f])).join(", ") : t("No questions yet")}</span>
                    <span className="block truncate text-sm text-navy-mute">{l.sources.join(", ")}</span>
                  </span>
                  {r.score !== null && <span className={`font-display text-xl font-bold ${r.score >= 80 ? "text-teal-ink" : r.score < 50 ? "text-coral-ink" : ""}`}>{r.score}%</span>}
                  <ChevronRight size={18} className="shrink-0 text-navy-mute" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <MockCard course={course} />
      <PastExams course={course} save={save} />

      <button className="btn-ghost mt-12" onClick={async () => { if (confirm(t("Delete “{course}” and all its lessons from this device?", { course: course.name }))) { await deleteCourse(course.id); navigate("/student"); } }}>
        <Trash2 size={16} aria-hidden /> {t("Delete this course")}
      </button>
    </div>
  );
}

function AddLesson({ course, save, onDone }: { course: Course; save: (c: Course) => Promise<void>; onDone: (lessonId: string | null) => void }) {
  const { t } = useT();
  const [title, setTitle] = useState(t("Lesson {n}", { n: course.lessons.length + 1 }));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function add() {
    setBusy(true); setErr(null);
    try {
      const r = await api.extract(files, "material");
      const lesson = { id: newId("l"), title: title.trim().slice(0, 80) || t("Lesson"), created_at: new Date().toISOString(),
        sources: r.documents.map((d) => d.file), passages: r.passages ?? [], truncated: r.truncated, banks: {} };
      await save({ ...course, lessons: [...course.lessons, lesson] });
      onDone(lesson.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <div className="mt-4 grid gap-4 rounded-xl border-2 border-navy bg-white p-5">
      <label className="grid gap-1.5">
        <span className="font-bold">{t("Lesson name")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="min-h-[48px] max-w-md rounded-lg border border-line px-3 outline-none focus:border-violet" />
      </label>
      <FilePicker label={t("Material for this lesson")} help={t("Slides, notes or a chapter. Only this lesson's material.")} files={files} setFiles={setFiles} max={6} />
      <p className="text-sm text-navy-mute">{t("Files are read on the server to get their text, then the text is saved on this device only. No AI is used until you create questions.")}</p>
      {err && <p className="rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={!files.length || busy} onClick={add}>{busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <FileUp size={17} aria-hidden />} {t("Save lesson")}</button>
        <button className="btn-ghost" onClick={() => onDone(null)}>{t("Cancel")}</button>
      </div>
    </div>
  );
}

function MockCard({ course }: { course: Course }) {
  const { t, lang } = useT();
  const last = [...course.mocks].sort((a, b) => b.ts - a.ts).slice(0, 3);
  const p = course.exam_profile;
  return (
    <section className="mt-10 rounded-xl bg-navy p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white"><Clock size={20} aria-hidden /> {t("Mock exam")}</h2>
          <p className="mt-1 max-w-[36rem] text-white/80">
            {p?.duration_minutes
              ? t("A timed exam across all your lessons, shaped like your past exams (about {n} minutes). No hints, no feedback until you hand it in.", { n: p.duration_minutes })
              : t("A timed exam across all your lessons. No hints, no feedback until you hand it in.")}
          </p>
        </div>
        {course.lessons.length > 0
          ? <Link to={`/course/${course.id}/mock`} className="btn bg-white text-navy hover:bg-paper">{t("Set up a mock exam")}</Link>
          : <span className="text-white/70">{t("Add a lesson first")}</span>}
      </div>
      {last.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {last.map((m) => <li key={m.id} className="rounded-full bg-white/10 px-3 py-1 text-sm">{new Date(m.ts).toLocaleDateString(lang)}: <b>{Math.round((100 * m.score) / m.max)}%</b></li>)}
        </ul>
      )}
    </section>
  );
}

function PastExams({ course, save }: { course: Course; save: (c: Course) => Promise<void> }) {
  const { t } = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const p = course.exam_profile;
  async function upload() {
    setBusy(true); setErr(null);
    try {
      const r = await api.extract(files, "past");
      await save({ ...course, past_exams: { files: r.documents.map((d) => d.file), text: r.text ?? "" }, exam_profile: null });
      setFiles([]); setReplacing(false);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="mt-10 rounded-xl border border-line bg-white p-5">
      <h2 className="text-xl font-bold">{t("Past exams")}</h2>
      {course.past_exams && !replacing ? (
        <>
          <p className="mt-1 text-navy-soft">{t("{files}. Every lesson's questions and the mock exam follow their style and difficulty.", { files: course.past_exams.files.join(", ") })}</p>
          {p && (p.question_types.length > 0 || p.duration_minutes) && (
            <p className="mt-2 text-[15px] text-navy-soft">
              <b>{t("Read from them:")}</b> {p.question_types.join(", ")}{p.number_of_questions ? `, ${t("about {n} questions", { n: p.number_of_questions })}` : ""}{p.duration_minutes ? `, ${t("{n} minutes", { n: p.duration_minutes })}` : ""}. {p.notes}
            </p>
          )}
          <button className="mt-3 font-bold text-violet-ink underline underline-offset-4" onClick={() => setReplacing(true)}>{t("Replace past exams")}</button>
        </>
      ) : (
        <div className="mt-2 grid gap-3">
          <FilePicker label={t("Upload past exams for this course")} help={t("Recommended. Questions will copy their style, wording and difficulty, but every fact comes from your lessons.")} files={files} setFiles={setFiles} max={6} />
          {err && <p className="rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}
          <button className="btn-ghost justify-self-start" disabled={!files.length || busy} onClick={upload}>{busy && <Loader2 size={17} className="animate-spin" aria-hidden />} {t("Save past exams")}</button>
        </div>
      )}
    </section>
  );
}
