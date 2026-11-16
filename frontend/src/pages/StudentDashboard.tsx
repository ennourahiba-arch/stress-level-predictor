import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, Plus, Swords, Users } from "lucide-react";
import ReadinessCard from "../components/ReadinessCard";
import StreakCard from "../components/StreakCard";
import OfflineStatus from "../components/OfflineStatus";
import { Loading } from "../components/States";
import { courseReadiness } from "../lib/readiness";
import { streakInfo } from "../lib/streak";
import { clearAll, getKV, listCourses, loadHistory, newId, saveCourse, setKV, type History } from "../lib/storage";
import type { Course } from "../lib/types";
import { useT } from "../i18n";

export default function StudentDashboard() {
  const { t } = useT();
  const navigate = useNavigate();
  const [history, setHistory] = useState<History | null>(null);
  const [nickname, setNickname] = useState<string | null | undefined>(undefined);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [draft, setDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const [courseName, setCourseName] = useState("");

  const refresh = () => {
    loadHistory().then(setHistory);
    getKV<string>("nickname").then((n) => setNickname(n ?? null));
    listCourses().then(setCourses);
  };
  useEffect(refresh, []);

  if (!history || !courses || nickname === undefined) return <Loading label={t("Loading your progress")} />;

  // "Continue" opens the course you practised most recently.
  const lessonToCourse = new Map(courses.flatMap((c) => c.lessons.map((l) => [l.id, c.id] as const)));
  const recentCourse = history.exercises.map((e) => lessonToCourse.get(e.topic)).find(Boolean) ?? courses[0]?.id;
  const withReadiness = courses.map((c) => ({ c, r: courseReadiness(c, history) }));

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    const name = courseName.trim().slice(0, 60);
    if (!name) return;
    const c: Course = { id: newId("c"), name, created_at: new Date().toISOString(), lessons: [], past_exams: null, exam_profile: null, mocks: [] };
    await saveCourse(c);
    navigate(`/course/${c.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8">
      {nickname === null ? (
        <form className="max-w-lg" onSubmit={(e) => { e.preventDefault(); const n = draft.trim().slice(0, 24); if (n) setKV("nickname", n).then(() => setNickname(n)); }}>
          <h1 className="text-3xl font-bold">{t("What should we call you?")}</h1>
          <p className="mt-1 text-navy-mute">{t("Any nickname works. It's stored on this device only, with no account.")}</p>
          <div className="mt-4 flex gap-2">
            <label htmlFor="nick" className="sr-only">{t("Nickname")}</label>
            <input id="nick" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={24} placeholder={t("e.g. Limit Breaker")}
              className="min-h-[48px] min-w-0 flex-1 rounded-full border border-line bg-white px-5 outline-none focus:border-violet" />
            <button className="btn-primary" disabled={!draft.trim()}>{t("Save")}</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">{t("Hi, {name}", { name: nickname })}</h1>
            <p className="mt-1 text-navy-mute">{t("Practice in the format of your real exam: short sessions, instant feedback, and a readiness score.")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {recentCourse
              ? <Link to={`/course/${recentCourse}`} className="btn-primary"><Play size={17} aria-hidden /> {t("Continue practicing")}</Link>
              : <button className="btn-primary" onClick={() => setNaming(true)}><Plus size={17} aria-hidden /> {t("Create your first course")}</button>}
            <Link to="/duel/new" className="btn-ghost"><Swords size={17} aria-hidden /> {t("Duel a friend")}</Link>
            <Link to="/join" className="btn-ghost"><Users size={17} aria-hidden /> {t("Join with a code")}</Link>
          </div>
        </div>
      )}

      {nickname !== null && <div className="mt-8"><StreakCard s={streakInfo(history.exercises)} /></div>}

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t("My courses")}</h2>
            <p className="text-[15px] text-navy-mute">{t("One per course you're taking, any subject. Add lessons and past exams, practice lesson by lesson, or take a mock exam.")}</p>
          </div>
          {!naming && <button className="btn-violet" onClick={() => setNaming(true)}><Plus size={17} aria-hidden /> {t("New course")}</button>}
        </div>
        {naming && (
          <form className="mt-4 flex max-w-lg flex-wrap gap-2" onSubmit={createCourse}>
            <label htmlFor="cname" className="sr-only">{t("Course name")}</label>
            <input id="cname" autoFocus value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder={t("e.g. Systems")} maxLength={60}
              className="min-h-[48px] min-w-[12rem] flex-1 rounded-full border border-line bg-white px-5 outline-none focus:border-violet" />
            <button className="btn-primary" disabled={!courseName.trim()}>{t("Create")}</button>
            <button type="button" className="btn-ghost" onClick={() => setNaming(false)}>{t("Cancel")}</button>
          </form>
        )}
        {courses.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withReadiness.map(({ c, r }) => {
              const lastMock = [...c.mocks].sort((a, b) => b.ts - a.ts)[0];
              return (
                <Link key={c.id} to={`/course/${c.id}`} className="rounded-xl border-2 border-line bg-white p-5 hover:border-navy">
                  <h3 className="text-lg font-bold">{c.name}</h3>
                  <p className="mt-1 text-[15px] text-navy-mute">{t("{n} lesson|{n} lessons", { n: c.lessons.length })}{c.past_exams ? `, ${t("past exams added")}` : ""}</p>
                  <p className="mt-3 text-[15px]">
                    {r.score !== null ? t("Readiness {pct}%", { pct: r.score }) : <span className="text-navy-mute">{t("No readiness yet")}</span>}
                    {lastMock && <span className="block text-navy-mute">{t("Last mock exam: {pct}%", { pct: Math.round((100 * lastMock.score) / lastMock.max) })}</span>}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : !naming && (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-white p-6">
            <p className="font-bold">{t("No courses yet.")}</p>
            <p className="mt-1 text-navy-soft">{t("Create one for each course you're taking, for example “Systems”. Then add its lessons and past exams, and practice in your exam's format.")}</p>
          </div>
        )}
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="text-xl font-bold">{t("Readiness")}</h2>
          {withReadiness.some(({ r }) => r.answered.of) ? (
            <div className="mt-4 grid gap-4">
              {withReadiness.filter(({ r }) => r.answered.of).map(({ c, r }) => <ReadinessCard key={c.id} r={r} compact />)}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-line bg-white p-6">
              <p className="font-bold">{t("Nothing to show yet.")}</p>
              <p className="mt-1 text-navy-mute">{t("Practice a lesson: rate your confidence, answer 5 exam-style questions with hints when you need them, and see how ready you are.")}</p>
            </div>
          )}
        </section>
        <aside className="grid content-start gap-4">
          <OfflineStatus />
          <button className="btn-ghost justify-self-start"
            onClick={() => { if (confirm(t("Delete your nickname, courses and all progress stored on this device?"))) clearAll().then(refresh); }}>
            {t("Reset everything on this device")}
          </button>
        </aside>
      </div>
    </div>
  );
}
