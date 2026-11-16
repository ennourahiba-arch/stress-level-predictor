import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Swords } from "lucide-react";
import { Loading } from "../components/States";
import { usePack } from "../components/usePack";
import { api, tokens, type QuizQuestionIn } from "../lib/api";
import { getKV, listCourses } from "../lib/storage";
import type { Course, Exercise } from "../lib/types";
import { useT } from "../i18n";

/** Questions that work on phones in a live duel: multiple choice and true/false. */
export function toQuizQuestion(e: Exercise, t: (k: string, p?: Record<string, string | number>) => string): QuizQuestionIn | null {
  if (e.answer.kind === "tf") {
    return { id: e.id, prompt: t("True or false? {statement}", { statement: e.prompt }), options: [{ text: t("True"), latex: "" }, { text: t("False"), latex: "" }],
      correct: e.answer.value ? 0 : 1, labels: e.labels ?? [], solution: e.solution };
  }
  if (e.answer.kind === "mcq" && e.options) {
    return { id: e.id, prompt: e.prompt, options: e.options.map((o) => ({ text: o, latex: "" })), correct: e.answer.correct, labels: e.labels ?? [], solution: e.solution };
  }
  return null;
}

const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

export default function DuelNew() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { pack } = usePack();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("calc:closed-interval");
  const [count, setCount] = useState(8);
  const [secs, setSecs] = useState(20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listCourses().then(setCourses);
    getKV<string>("nickname").then((n) => n && setName(n));
  }, []);
  if (!pack || !courses) return <Loading />;

  const lessonSources = courses.flatMap((c) => c.lessons.map((l) => ({ id: `lesson:${c.id}:${l.id}`, label: `${c.name}: ${l.title}`,
    qs: [...(l.banks.quiz?.exercises ?? []), ...(l.banks.tf?.exercises ?? [])] })).filter((s) => s.qs.length >= 3));

  async function create() {
    setBusy(true); setErr(null);
    try {
      let body: Parameters<typeof api.createDuel>[0];
      if (source.startsWith("calc:")) {
        const topic = source.slice(5);
        const ids = shuffle(pack!.exercises.filter((e) => e.topic === topic).map((e) => e.id)).slice(0, count);
        body = { player_name: name, exercise_ids: ids, seconds_per_question: secs, lang };
      } else {
        const src = lessonSources.find((s) => s.id === source)!;
        const questions = shuffle(src.qs).map((q) => toQuizQuestion(q, t)).filter((q): q is QuizQuestionIn => !!q).slice(0, count);
        body = { player_name: name, title: src.label, questions, seconds_per_question: secs };
      }
      const r = await api.createDuel(body);
      tokens.set("host", r.code, { token: r.host_token });
      tokens.set("team", r.code, { token: r.team_token, name: r.team_name });
      navigate(`/duel/${r.code}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-6">
      <Link to="/student" className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-mute hover:text-navy"><ArrowLeft size={16} aria-hidden /> {t("Dashboard")}</Link>
      <h1 className="mt-4 flex items-center gap-2 text-3xl font-bold"><Swords size={28} className="text-coral-ink" aria-hidden /> {t("Duel a friend")}</h1>
      <p className="mt-2 text-navy-soft">{t("Same questions on both phones. The first correct answer wins the point.")}</p>
      <div className="mt-6 grid gap-4 rounded-xl border border-line bg-white p-5">
        <label className="grid gap-1.5"><span className="font-bold">{t("Your name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} className="min-h-[48px] rounded-lg border border-line bg-white px-3 outline-none focus:border-violet" />
        </label>
        <label className="grid gap-1.5"><span className="font-bold">{t("Questions from")}</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="min-h-[48px] w-full min-w-0 rounded-lg border border-line bg-white px-3">
            <optgroup label={t("Calculus 1 (verified)")}>
              {pack.topics.map((t) => <option key={t.id} value={`calc:${t.id}`}>{t.name}</option>)}
            </optgroup>
            {lessonSources.length > 0 && (
              <optgroup label={t("My courses")}>
                {lessonSources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
            )}
          </select>
          <span className="text-sm text-navy-mute">{t("Your lessons appear here once they have multiple-choice or true/false questions.")}</span>
        </label>
        <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
          <label className="grid gap-1.5"><span className="font-bold">{t("Questions")}</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="min-h-[48px] w-full min-w-0 rounded-lg border border-line bg-white px-3">
              {[5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5"><span className="font-bold">{t("Seconds each")}</span>
            <select value={secs} onChange={(e) => setSecs(Number(e.target.value))} className="min-h-[48px] w-full min-w-0 rounded-lg border border-line bg-white px-3">
              {[15, 20, 30, 45].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {err && <p className="rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}
        <button className="btn-primary" disabled={!name.trim() || busy} onClick={create}>
          {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Swords size={17} aria-hidden />} {t("Create the duel")}
        </button>
      </div>
      <p className="mt-4 text-sm text-navy-mute">{t("Duels need an internet connection. Your answers count toward your daily streak.")}</p>
    </div>
  );
}
