import { useMemo, useRef, useState } from "react";
import { Check, Lightbulb, X } from "lucide-react";
import TeX from "./Math";
import { checkExpression, checkExtremum, checkPoints, type Verdict } from "../lib/mathcheck";
import { addExerciseAttempt } from "../lib/storage";
import type { Exercise, ExerciseAnswer } from "../lib/types";
import { useT } from "../i18n";

type MathAnswer = Extract<ExerciseAnswer, { kind: "expression" | "points" | "extremum" }>;

const MAX_ATTEMPTS = 2;

/** Independent exercise: no AI attempt to inspect, the student writes the answer.
 * Graded exactly and offline by lib/mathcheck.ts. */
export default function MathYourTurn({ exercise, onDone, header, nextLabel }: { exercise: Exercise; onDone: () => void; header: React.ReactNode; nextLabel: string }) {
  const { t } = useT();
  const a = exercise.answer as MathAnswer;
  const [main, setMain] = useState("");
  const [at, setAt] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [done, setDone] = useState<null | { correct: boolean }>(null);
  const [showHint, setShowHint] = useState(false);
  const saved = useRef(false);

  const check = (m: string, x: string): Verdict =>
    a.kind === "expression" ? checkExpression(m, a.coeffs)
    : a.kind === "points" ? checkPoints(m, a.values)
    : checkExtremum(m, x, a);

  // Live "read as" preview so students see how their input was understood.
  const preview = useMemo(() => {
    if (!main.trim() || (a.kind === "extremum" && !at.trim())) return null;
    const v = check(main, at);
    return "preview" in v ? v.preview : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main, at]);

  function finish(correct: boolean, n: number) {
    setDone({ correct });
    if (saved.current) return;
    saved.current = true;
    addExerciseAttempt({
      exerciseId: exercise.id, topic: exercise.topic, ts: Date.now(),
      attempts: n, correct, firstTry: correct && n === 1, usedHint: showHint,
    }).catch(() => undefined);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = check(main, at);
    setVerdict(v);
    if (v.status === "syntax" || v.status === "unsupported") return; // never graded, never counted
    const n = attempts + 1;
    setAttempts(n);
    if (v.status === "correct") finish(true, n);
    else if (n >= MAX_ATTEMPTS) finish(false, n);
  }

  const word = a.kind === "extremum" ? (a.extremum === "max" ? t("Maximum value") : t("Minimum value")) : null;

  return (
    <div className="grid gap-5">
      {header}

      <section className="rounded-xl border border-line bg-white p-5">
        <p className="text-navy-soft">{exercise.prompt}</p>
        <TeX tex={exercise.latex} block className="mt-1 text-xl" />
      </section>

      {!done ? (
        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="font-bold">{a.kind === "expression" ? "f′(x) =" : a.kind === "points" ? t("Critical points: x =") : word}</span>
            <input
              value={main}
              onChange={(e) => { setMain(e.target.value); setVerdict(null); }}
              autoComplete="off" autoCapitalize="off" spellCheck={false}
              inputMode={a.kind === "expression" ? "text" : "decimal"}
              className="min-h-[56px] rounded-xl border border-line bg-white px-4 font-mono text-lg outline-none focus:border-violet"
              aria-describedby="input-help"
            />
          </label>
          {a.kind === "extremum" && (
            <label className="grid gap-1.5">
              <span className="font-bold">{t("Happens at x =")}</span>
              <input
                value={at}
                onChange={(e) => { setAt(e.target.value); setVerdict(null); }}
                autoComplete="off" inputMode="decimal"
                className="min-h-[56px] rounded-xl border border-line bg-white px-4 font-mono text-lg outline-none focus:border-violet"
              />
            </label>
          )}
          <p id="input-help" className="text-[15px] text-navy-mute">{exercise.input_help}</p>
          {preview && (
            <p className="text-[15px]">
              <span className="text-navy-mute">{t("Read as")} </span><TeX tex={preview} />
            </p>
          )}

          {verdict && (verdict.status === "syntax" || verdict.status === "unsupported") && (
            <p className="rounded-lg bg-paper px-4 py-3 ring-1 ring-line" role="status">
              <b>{verdict.status === "syntax" ? t("Couldn't read that.") : t("Can't verify that form.")}</b> {t(verdict.message, verdict.params)} {t("This didn't count as an attempt.")}
            </p>
          )}
          {attempts > 0 && attempts < MAX_ATTEMPTS && (
            <div className="grid gap-3">
              {verdict?.status === "incorrect" && (
                <p className="flex gap-2 rounded-lg bg-coral-wash px-4 py-3" role="status">
                  <X size={20} className="mt-0.5 shrink-0 text-coral-ink" aria-hidden />
                  <span><b>{t("Not correct yet.")}</b> {t("You have one more attempt.")}</span>
                </p>
              )}
              {!showHint ? (
                <button type="button" className="justify-self-start font-bold text-violet-ink underline decoration-2 underline-offset-4" onClick={() => setShowHint(true)}>
                  {t("Need a hint?")}
                </button>
              ) : (
                <p className="flex gap-2"><Lightbulb size={18} className="mt-0.5 shrink-0 text-violet-ink" aria-hidden /><span><b>{t("Hint.")}</b> {exercise.hint}</span></p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={!main.trim() || (a.kind === "extremum" && !at.trim())}>{t("Check my answer")}</button>
            <button type="button" className="btn-ghost" onClick={() => finish(false, attempts)}>{t("I'm stuck, show the solution")}</button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          <div className={`flex gap-2.5 rounded-xl px-4 py-3 ${done.correct ? "bg-teal-wash" : "bg-coral-wash"}`} role="status">
            {done.correct ? <Check size={20} className="mt-0.5 shrink-0 text-teal-ink" aria-hidden /> : <X size={20} className="mt-0.5 shrink-0 text-coral-ink" aria-hidden />}
            <span>
              {done.correct
                ? <><b>{attempts === 1 ? t("Correct, first try.") : t("Correct.")}</b> {t("Checked exactly, not approximately.")}</>
                : <><b>{t("Not this time.")}</b> {t("Here's the worked solution.")}</>}
            </span>
          </div>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="text-lg font-bold">{t("Worked solution")}</h2>
            <ol className="mt-3 grid gap-3">
              {exercise.solution.map((st, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-display font-bold text-teal-ink">{i + 1}</span>
                  <span className="min-w-0"><span className="block text-[15px] text-navy-soft">{st.text}</span><TeX tex={st.latex} /></span>
                </li>
              ))}
            </ol>
          </section>
          <button className="btn-primary justify-self-start" onClick={onDone}>{nextLabel}</button>
        </div>
      )}
    </div>
  );
}
