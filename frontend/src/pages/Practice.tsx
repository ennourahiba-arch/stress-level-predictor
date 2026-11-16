import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, X } from "lucide-react";
import QuestionCard from "../components/QuestionCard";
import ReadinessCard from "../components/ReadinessCard";
import RichText from "../components/RichText";
import { Loading } from "../components/States";
import { pickSession, readiness } from "../lib/readiness";
import { DAILY_GOAL, streakInfo } from "../lib/streak";
import { Flame } from "lucide-react";
import { addConfidence, loadHistory, setKV, type History } from "../lib/storage";
import { lessonPack, type Course, type Exercise, type Format, type Lesson, type Pack, type Passage, type TopicId } from "../lib/types";
import { useT } from "../i18n";

export const LABELS = ["Not at all", "A little", "Somewhat", "Quite", "Very"]; // translated at display

/** Practice one lesson of a course, in one format. */
export function PracticeLesson({ course, lesson, format }: { course: Course; lesson: Lesson; format: Format }) {
  const { t } = useT();
  return <PracticeSession pack={lessonPack(course, lesson, format)} topic={lesson.id} passages={lesson.passages}
    backTo={`/course/${course.id}/lesson/${lesson.id}`} backLabel={t("Back to {lesson}", { lesson: lesson.title })} />;
}

export function ConfidenceCheck({ title, last, onPick, backTo }: { title: string; last?: number; onPick: (n: number) => void; backTo: string }) {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-xl py-6">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-mute hover:text-navy"><ArrowLeft size={16} aria-hidden /> {t("Back")}</Link>
      <h1 className="mt-6 text-3xl font-bold">{t("How confident are you about “{topic}”?", { topic: title })}</h1>
      <p className="mt-2 text-navy-mute">{t("Be honest: you'll compare this with how you actually do. It stays on this device.")}</p>
      <div className="mt-6 grid grid-cols-5 gap-2" role="radiogroup" aria-label={t("Confidence from 1 to 5")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={last === n} onClick={() => onPick(n)}
            className={`flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-xl border-2 bg-white px-1 transition-colors hover:border-navy ${last === n ? "border-violet" : "border-line"}`}>
            <span className="font-display text-3xl font-extrabold">{n}</span>
            <span className="text-center text-xs leading-tight text-navy-mute sm:text-sm">{t(LABELS[n - 1])}</span>
          </button>
        ))}
      </div>
      {last && <p className="mt-3 text-sm text-navy-mute">{t("Last time you said {n}.", { n: last })}</p>}
    </div>
  );
}

function PracticeSession({ pack, topic, passages, backTo = "/student", backLabel }: { pack: Pack; topic: TopicId; passages?: Passage[]; backTo?: string; backLabel?: string }) {
  const { t } = useT();
  const [history, setHistory] = useState<History | null>(null);
  const [stage, setStage] = useState<"confidence" | "questions" | "summary">("confidence");
  const [session, setSession] = useState<Exercise[]>([]);
  const [i, setI] = useState(0);
  const startedAt = useRef(0);
  const reload = useCallback(() => loadHistory().then((h) => { setHistory(h); return h; }), []);
  useEffect(() => { reload(); }, [reload]);

  if (!history) return <Loading label={t("Preparing your practice")} />;
  const pool = pack.exercises.filter((e) => e.topic === topic);
  const topicName = pack.topics.find((t) => t.id === topic)!.name;
  const begin = (h: History) => {
    setSession(pickSession(pool, h));
    setI(0);
    startedAt.current = Date.now();
    setStage("questions");
  };
  const sourcesFor = (e: Exercise) => (passages ?? []).filter((p) => (e.source_ids ?? []).includes(p.id)).map((p) => p.text.slice(0, 1500));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      {stage === "confidence" && (
        <ConfidenceCheck title={topicName} backTo={backTo} last={history.confidence.find((c) => c.topic === topic)?.rating}
          onPick={async (n) => {
            await addConfidence({ topic, ts: Date.now(), rating: n as 1 | 2 | 3 | 4 | 5 });
            if (!passages) await setKV("lastTopic", topic);
            begin(await reload());
          }} />
      )}

      {stage === "questions" && session[i] && (
        <div className="mx-auto max-w-2xl">
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-mute hover:text-navy"><ArrowLeft size={16} aria-hidden /> {t("Stop")}</Link>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(i / session.length) * 100}%` }} />
          </div>
          <div className="mt-6">
            <QuestionCard key={session[i].id} exercise={session[i]} index={i} total={session.length} sources={sourcesFor(session[i])}
              nextLabel={i + 1 < session.length ? t("Next question") : t("See my results")}
              onNext={async () => { if (i + 1 < session.length) setI(i + 1); else { await reload(); setStage("summary"); } }} />
          </div>
        </div>
      )}

      {stage === "summary" && (
        <div className="mx-auto grid max-w-2xl gap-5 py-4">
          <h1 className="text-3xl font-bold">{t("Session complete")}</h1>
          <StreakLine history={history} />
          <SessionResults session={session} history={history} since={startedAt.current} />
          <ReadinessCard r={readiness(pack, history, topic)} />
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => begin(history)}>{t("Practice again")}</button>
            <Link to={backTo} className="btn-ghost">{backLabel ?? t("Back to dashboard")}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionResults({ session, history, since }: { session: Exercise[]; history: History; since: number }) {
  const { t } = useT();
  const result = (id: string) => history.exercises.find((e) => e.exerciseId === id && e.ts >= since);
  const right = session.filter((e) => result(e.id)?.correct).length;
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <p className="font-display text-4xl font-extrabold">{right}<span className="text-xl text-navy-mute"> / {session.length}</span></p>
      <ol className="mt-3 divide-y divide-line">
        {session.map((e, k) => {
          const r = result(e.id);
          return (
            <li key={e.id} className="flex items-start gap-3 py-2.5">
              {r?.correct ? <Check size={18} className="mt-0.5 shrink-0 text-teal-ink" aria-label={t("right")} /> : <X size={18} className="mt-0.5 shrink-0 text-coral-ink" aria-label={t("not right")} />}
              <span className="min-w-0 flex-1 text-[15px]">
                <span className="text-navy-mute">Q{k + 1}. </span><RichText text={e.prompt} />
                {r && !r.firstTry && r.correct && <span className="text-navy-mute"> {t("(second try)")}</span>}
                {r?.mistake && <span className="block text-sm text-coral-ink">{r.mistake}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StreakLine({ history }: { history: History }) {
  const { t } = useT();
  const s = streakInfo(history.exercises);
  return (
    <p className="flex items-center gap-2 rounded-xl bg-coral-wash px-4 py-3 text-coral-ink" role="status">
      <Flame size={20} aria-hidden fill={s.metToday ? "currentColor" : "none"} />
      <span className="text-navy">
        {s.metToday
          ? <><b>{t("{n}-day streak.", { n: s.current })}</b> {t("Today's goal is done.")}</>
          : <b>{s.atRisk
              ? t("{n} more answer today to keep your streak.|{n} more answers today to keep your streak.", { n: Math.max(0, DAILY_GOAL - s.today) })
              : t("{n} more answer today to start a streak.|{n} more answers today to start a streak.", { n: Math.max(0, DAILY_GOAL - s.today) })}</b>}
      </span>
    </p>
  );
}
