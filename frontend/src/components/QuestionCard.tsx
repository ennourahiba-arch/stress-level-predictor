import { useRef, useState } from "react";
import { Check, Lightbulb, Loader2, Quote, X } from "lucide-react";
import MathYourTurn from "./MathYourTurn";
import OptionList from "./OptionList";
import RichText from "./RichText";
import TeX from "./Math";
import { api } from "../lib/api";
import { addExerciseAttempt } from "../lib/storage";
import { gradeBlank, gradeMatch, gradeMulti, shuffled } from "../lib/grading";
import type { Exercise, SolutionLine } from "../lib/types";
import { useT } from "../i18n";

interface CardProps { exercise: Exercise; index: number; total: number; onNext: () => void; nextLabel: string; sources?: string[] }

/** One practice question, in the format of the exam. */
export default function QuestionCard({ exercise, index, total, onNext, nextLabel, sources }: CardProps) {
  const { t } = useT();
  const header = (
    <div className="flex items-baseline justify-between gap-3">
      <p className="font-bold text-violet-ink">{t("Question {i} of {total}", { i: index + 1, total })}</p>
      <p className="text-sm text-navy-mute">{t("Difficulty {d} of 3", { d: exercise.difficulty })}</p>
    </div>
  );
  const p = { exercise, onDone: onNext, header, nextLabel };
  if (exercise.answer.kind === "mcq") return <McqQuestion {...p} />;
  if (exercise.answer.kind === "multi") return <MultiQuestion {...p} />;
  if (exercise.answer.kind === "tf") return <TFQuestion {...p} />;
  if (exercise.answer.kind === "blank") return <BlankQuestion {...p} />;
  if (exercise.answer.kind === "match") return <MatchQuestion {...p} />;
  if (exercise.answer.kind === "open") return <OpenQuestion {...p} sources={sources ?? []} />;
  return <MathYourTurn {...p} />;
}

export function WorkedSolution({ lines, title }: { lines: SolutionLine[]; title?: string }) {
  const { t } = useT();
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">{title ?? t("Worked solution")}</h2>
      <ol className="mt-3 grid gap-3">
        {lines.map((st, i) => (
          <li key={i} className="flex gap-3">
            <span className="font-display font-bold text-teal-ink">{i + 1}</span>
            <span className="min-w-0">
              <RichText text={st.text} className="block" />
              {st.latex && <TeX tex={st.latex} />}
              {st.quote && <SourceQuote quote={st.quote} source={st.source} />}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SourceQuote({ quote, source }: { quote: string; source?: string }) {
  return (
    <span className="mt-2 flex gap-2 rounded-md bg-paper px-3 py-2 text-[15px] text-navy-soft">
      <Quote size={15} className="mt-1 shrink-0 text-navy-mute" aria-hidden />
      <span>“{quote}”{source && <span className="text-navy-mute"> ({source})</span>}</span>
    </span>
  );
}

function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2.5 rounded-xl px-4 py-3 ${ok ? "bg-teal-wash" : "bg-coral-wash"}`} role="status">
      {ok ? <Check size={20} className="mt-0.5 shrink-0 text-teal-ink" aria-hidden /> : <X size={20} className="mt-0.5 shrink-0 text-coral-ink" aria-hidden />}
      <span>{children}</span>
    </div>
  );
}

function useRecorder(exercise: Exercise) {
  const saved = useRef(false);
  return (correct: boolean, attempts: number, usedHint: boolean, firstTry = correct && attempts === 1, mistake: string | null = null) => {
    if (saved.current) return;
    saved.current = true;
    addExerciseAttempt({ exerciseId: exercise.id, topic: exercise.topic, ts: Date.now(), attempts, correct, firstTry, usedHint, mistake }).catch(() => undefined);
  };
}

type BodyProps = { exercise: Exercise; onDone: () => void; header: React.ReactNode; nextLabel: string };

function McqQuestion({ exercise, onDone, header, nextLabel }: BodyProps) {
  const { t } = useT();
  const correct = (exercise.answer as { kind: "mcq"; correct: number }).correct;
  const opts = (exercise.options ?? []).map((o, i) => ({ id: String(i), text: `${"ABCD"[i]}) ${o}` }));
  const [pick, setPick] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [done, setDone] = useState<null | boolean>(null);
  const [hint, setHint] = useState(false);
  const record = useRecorder(exercise);

  function submit() {
    if (pick === null) return;
    const n = wrong.length + 1;
    if (Number(pick) === correct) { setDone(true); record(true, n, hint); }
    else if (n >= 2) { setWrong([...wrong, pick]); setDone(false); record(false, n, hint, false, exercise.labels?.[Number(wrong[0] ?? pick)] ?? null); }
    else { setWrong([...wrong, pick]); setPick(null); }
  }

  return (
    <div className="grid gap-5">
      {header}
      <section className="rounded-xl border border-line bg-white p-5"><RichText text={exercise.prompt} className="text-lg" /></section>
      {done === null ? (
        <>
          {wrong.length > 0 && <Verdict ok={false}><b>{t("Not that one.")}</b> {t("One more attempt.")}</Verdict>}
          <OptionList legend={t("Answer options")} options={opts.filter((o) => !wrong.includes(o.id))} selected={pick} onSelect={setPick} />
          {wrong.length > 0 && (hint
            ? <p className="flex gap-2"><Lightbulb size={18} className="mt-0.5 shrink-0 text-violet-ink" aria-hidden /><span><b>{t("Hint.")}</b> {exercise.hint}</span></p>
            : <button className="justify-self-start font-bold text-violet-ink underline decoration-2 underline-offset-4" onClick={() => setHint(true)}>{t("Need a hint?")}</button>)}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={pick === null} onClick={submit}>{t("Check my answer")}</button>
            <button className="btn-ghost" onClick={() => { setDone(false); record(false, wrong.length, hint); }}>{t("I'm stuck, show the answer")}</button>
          </div>
        </>
      ) : (
        <>
          <Verdict ok={done}>{done ? <b>{wrong.length === 0 ? t("Correct, first try.") : t("Correct.")}</b> : <b>{t("The answer is {answer}.", { answer: exercise.answer_text ?? "" })}</b>}</Verdict>
          <WorkedSolution lines={exercise.solution} title={t("Why")} />
          <button className="btn-primary justify-self-start" onClick={onDone}>{nextLabel}</button>
        </>
      )}
    </div>
  );
}

function OpenQuestion({ exercise, onDone, header, nextLabel, sources }: BodyProps & { sources: string[] }) {
  const { t } = useT();
  const a = exercise.answer as { kind: "open"; key_points: string[]; model_answer: string; problem?: boolean; final_answer?: string | null };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<null | { verdict: "correct" | "partial" | "incorrect"; covered: number[]; feedback: string; self?: boolean }>(null);
  const record = useRecorder(exercise);

  async function gradeWithAI() {
    setBusy(true); setErr(null);
    try {
      const r = await api.grade({ question: exercise.prompt, key_points: a.key_points, model_answer: a.model_answer, sources, answer: text,
        final_answer: a.final_answer ?? "" });
      setResult(r);
      record(r.verdict !== "incorrect", 1, false, r.verdict === "correct");
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }
  function selfMark(v: "correct" | "partial" | "incorrect") {
    setResult({ verdict: v, covered: [], feedback: "", self: true });
    record(v !== "incorrect", 1, false, v === "correct");
  }

  return (
    <div className="grid gap-5">
      {header}
      <section className="rounded-xl border border-line bg-white p-5"><RichText text={exercise.prompt} className="text-lg" /></section>
      {!result ? (
        <>
          <label className="grid gap-1.5">
            <span className="font-bold">{t("Your answer")}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 5000))} rows={8}
              className="rounded-xl border border-line bg-white p-4 outline-none focus:border-violet" />
          </label>
          {err && (
            <div className="rounded-lg bg-paper p-4 ring-1 ring-line" role="status">
              <p><b>{t("AI grading isn't available right now.")}</b> {t(err)}</p>
              <p className="mt-2">{t("You can compare with the model answer and mark yourself instead:")}</p>
              <p className="mt-2 rounded-md bg-white p-3"><RichText text={a.model_answer} /></p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => selfMark("correct")}>{t("I got it")}</button>
                <button className="btn-ghost" onClick={() => selfMark("partial")}>{t("Partly")}</button>
                <button className="btn-ghost" onClick={() => selfMark("incorrect")}>{t("Not yet")}</button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={!text.trim() || busy} onClick={gradeWithAI}>
              {busy && <Loader2 size={17} className="animate-spin" aria-hidden />} {t("Grade my answer")}
            </button>
            <button className="btn-ghost" onClick={() => selfMark("incorrect")}>{t("I'm stuck, show the answer")}</button>
          </div>
          <p className="text-sm text-navy-mute">{t("Written answers are graded by AI against your course material, which needs an internet connection.")}</p>
        </>
      ) : (
        <>
          <Verdict ok={result.verdict === "correct"}>
            <b>{result.verdict === "correct" ? t("Full marks.") : result.verdict === "partial" ? t("Partly there.") : t("Not yet.")}</b>{" "}
            {result.self ? t("You marked this yourself.") : result.feedback}
          </Verdict>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="text-lg font-bold">
              {t("What a full answer contains")}{!result.self && a.key_points.length > 1 && <span className="ml-2 font-normal text-navy-mute">{t("({right} of {total} marks)", { right: result.covered.length, total: a.key_points.length })}</span>}
            </h2>
            <ul className="mt-2 grid gap-1.5">
              {a.key_points.map((k, i) => (
                <li key={i} className="flex gap-2">
                  {result.self ? <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-mute" aria-hidden />
                    : result.covered.includes(i) ? <Check size={18} className="mt-0.5 shrink-0 text-teal-ink" aria-label={t("covered")} />
                    : <X size={18} className="mt-0.5 shrink-0 text-coral-ink" aria-label={t("missing")} />}
                  <RichText text={k} />
                </li>
              ))}
            </ul>
          </section>
          <WorkedSolution lines={exercise.solution} title={t("Model answer")} />
          {a.problem && <p className="text-sm text-navy-mute">{t("The model answer to this problem was computed by AI and solved a second time independently to check it. If something looks off, trust your course.")}</p>}
          {!result.self && <p className="text-sm text-navy-mute">{t("Graded by AI against your course material. It can make mistakes: check the model answer.")}</p>}
          <button className="btn-primary justify-self-start" onClick={onDone}>{nextLabel}</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- exact formats

function Prompt({ text }: { text: string }) {
  return <section className="rounded-xl border border-line bg-white p-5"><RichText text={text} className="text-lg" /></section>;
}

function HintLine({ exercise, shown, onShow }: { exercise: Exercise; shown: boolean; onShow: () => void }) {
  const { t } = useT();
  return shown
    ? <p className="flex gap-2"><Lightbulb size={18} className="mt-0.5 shrink-0 text-violet-ink" aria-hidden /><span><b>{t("Hint.")}</b> {exercise.hint}</span></p>
    : <button className="justify-self-start font-bold text-violet-ink underline decoration-2 underline-offset-4" onClick={onShow}>{t("Need a hint?")}</button>;
}

function Done({ ok, children, exercise, onDone, nextLabel }: { ok: boolean; children: React.ReactNode; exercise: Exercise; onDone: () => void; nextLabel: string }) {
  const { t } = useT();
  return (
    <>
      <Verdict ok={ok}>{children}</Verdict>
      <WorkedSolution lines={exercise.solution} title={t("Why")} />
      <button className="btn-primary justify-self-start" onClick={onDone}>{nextLabel}</button>
    </>
  );
}

function MultiQuestion({ exercise, onDone, header, nextLabel }: BodyProps) {
  const { t } = useT();
  const correct = (exercise.answer as { kind: "multi"; correct: number[] }).correct;
  const opts = exercise.options ?? [];
  const [sel, setSel] = useState<number[]>([]);
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState<null | ReturnType<typeof gradeMulti>>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const record = useRecorder(exercise);
  const toggle = (i: number) => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  function check() {
    const g = gradeMulti(sel, correct);
    const n = tries + 1;
    setTries(n);
    if (g.exact || n >= 2) {
      setDone(g);
      const wrongPick = sel.find((i) => !correct.includes(i));
      record(g.exact, n, hint, g.exact && n === 1, g.exact ? null : wrongPick !== undefined ? exercise.labels?.[wrongPick] ?? null : null);
    } else {
      setFeedback(t("Not quite: {right} of your {n} choice is right.|Not quite: {right} of your {n} choices are right.", { right: g.right, n: sel.length })
        + (g.missed ? " " + t("{n} correct option is missing.|{n} correct options are missing.", { n: g.missed }) : "") + " " + t("One more try."));
    }
  }
  return (
    <div className="grid gap-5">
      {header}
      <Prompt text={exercise.prompt} />
      <p className="text-[15px] text-navy-mute">{t("Select every correct answer.")}</p>
      <ul className="grid gap-2.5">
        {opts.map((o, i) => {
          const on = sel.includes(i);
          const right = done && correct.includes(i);
          const wrong = done && on && !correct.includes(i);
          return (
            <li key={i}>
              <button type="button" role="checkbox" aria-checked={on} disabled={!!done} onClick={() => toggle(i)}
                className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left disabled:cursor-default
                  ${right ? "border-teal bg-teal-wash" : wrong ? "border-coral bg-coral-wash" : on ? "border-navy bg-white" : "border-line bg-white hover:border-navy-mute"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-navy bg-navy" : "border-line"}`} aria-hidden>
                  {on && <Check size={14} className="text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1"><RichText text={o} /></span>
                {done && !correct.includes(i) && on && exercise.labels?.[i] && <span className="text-sm text-coral-ink">{exercise.labels[i]}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {done ? (
        <Done ok={done.exact} exercise={exercise} onDone={onDone} nextLabel={nextLabel}>
          {done.exact ? <b>{tries === 1 ? t("All correct, first try.") : t("All correct.")}</b> : <><b>{t("The correct answers are {answer}.", { answer: exercise.answer_text ?? "" })}</b> {t("You got {pct}% of the credit.", { pct: Math.round(done.fraction * 100) })}</>}
        </Done>
      ) : (
        <>
          {feedback && <Verdict ok={false}>{feedback}</Verdict>}
          {tries > 0 && <HintLine exercise={exercise} shown={hint} onShow={() => setHint(true)} />}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={!sel.length} onClick={check}>{t("Check my answer")}</button>
            <button className="btn-ghost" onClick={() => { setDone(gradeMulti([], correct)); record(false, tries, hint); }}>{t("I'm stuck, show the answer")}</button>
          </div>
        </>
      )}
    </div>
  );
}

function TFQuestion({ exercise, onDone, header, nextLabel }: BodyProps) {
  const { t } = useT();
  const value = (exercise.answer as { kind: "tf"; value: boolean }).value;
  const [pick, setPick] = useState<boolean | null>(null);
  const record = useRecorder(exercise);
  const choose = (v: boolean) => {
    if (pick !== null) return;
    setPick(v);
    const ok = v === value;
    record(ok, 1, false, ok, ok ? null : exercise.labels?.[v ? 0 : 1] ?? null);
  };
  return (
    <div className="grid gap-5">
      {header}
      <Prompt text={exercise.prompt} />
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("True or false")}>
        {[true, false].map((v) => {
          const right = pick !== null && v === value;
          const wrong = pick === v && v !== value;
          return (
            <button key={String(v)} role="radio" aria-checked={pick === v} disabled={pick !== null} onClick={() => choose(v)}
              className={`min-h-[72px] rounded-xl border-2 font-display text-xl font-bold disabled:cursor-default
                ${right ? "border-teal bg-teal-wash text-teal-ink" : wrong ? "border-coral bg-coral-wash text-coral-ink" : "border-line bg-white hover:border-navy"}`}>
              {v ? t("True") : t("False")}
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <Done ok={pick === value} exercise={exercise} onDone={onDone} nextLabel={nextLabel}>
          <b>{pick === value ? t("Correct.") : `It's ${value ? "true" : "false"}.`}</b>
          {pick !== value && exercise.labels?.[pick ? 0 : 1] && <> {t("A common trap: {trap}.", { trap: exercise.labels[pick ? 0 : 1]!.toLowerCase() })}</>}
        </Done>
      )}
    </div>
  );
}

function BlankQuestion({ exercise, onDone, header, nextLabel }: BodyProps) {
  const { t } = useT();
  const accepted = (exercise.answer as { kind: "blank"; accepted: string[] }).accepted;
  const [before, after] = exercise.prompt.split("____");
  const [text, setText] = useState("");
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState<null | "right" | "wrong" | "self">(null);
  const record = useRecorder(exercise);
  function check(e: React.FormEvent) {
    e.preventDefault();
    const n = tries + 1;
    setTries(n);
    if (gradeBlank(text, accepted)) { setDone("right"); record(true, n, hint); }
    else if (n >= 2) { setDone("wrong"); record(false, n, hint); }
  }
  return (
    <div className="grid gap-5">
      {header}
      <section className="rounded-xl border border-line bg-white p-5 text-lg leading-relaxed">
        <RichText text={before ?? ""} />
        <span className={`mx-1 inline-block min-w-[6rem] border-b-2 px-1 font-bold ${done === "right" || done === "self" ? "border-teal text-teal-ink" : done ? "border-coral text-coral-ink" : "border-navy"}`}>
          {done ? (done === "wrong" ? accepted[0] : text) : text || "\u00a0"}
        </span>
        <RichText text={after ?? ""} />
      </section>
      {!done ? (
        <form onSubmit={check} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="font-bold">{t("The missing word or phrase")}</span>
            <input value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} autoComplete="off" autoCapitalize="off"
              className="min-h-[52px] rounded-xl border border-line bg-white px-4 text-lg outline-none focus:border-violet" />
          </label>
          {tries > 0 && <Verdict ok={false}><b>{t("Not that.")}</b> {t("One more try.")}</Verdict>}
          {tries > 0 && <HintLine exercise={exercise} shown={hint} onShow={() => setHint(true)} />}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={!text.trim()}>{t("Check my answer")}</button>
            <button type="button" className="btn-ghost" onClick={() => { setDone("wrong"); record(false, tries, hint); }}>{t("I'm stuck, show the answer")}</button>
          </div>
        </form>
      ) : (
        <>
          <Done ok={done !== "wrong"} exercise={exercise} onDone={onDone} nextLabel={nextLabel}>
            {done === "right" ? <b>{tries === 1 ? t("Correct, first try.") : t("Correct.")}</b>
              : done === "self" ? <><b>{t("Noted.")}</b> {t("Your readiness still counts this one as missed, because it couldn't be checked exactly.")}</>
              : <><b>{t("The answer is “{answer}”.", { answer: accepted[0] })}</b>{accepted.length > 1 && <> {t("Also accepted: {list}.", { list: accepted.slice(1).join(", ") })}</>}</>}
          </Done>
          {done === "wrong" && text.trim() && (
            <button className="justify-self-start text-[15px] font-bold text-navy-mute underline underline-offset-4"
              onClick={() => { setDone("self"); }}>{t("My answer “{answer}” means the same thing", { answer: text.trim() })}</button>
          )}
        </>
      )}
    </div>
  );
}

function MatchQuestion({ exercise, onDone, header, nextLabel }: BodyProps) {
  const { t } = useT();
  const pairs = (exercise.answer as { kind: "match"; pairs: { left: string; right: string }[] }).pairs;
  const rights = shuffled(pairs.map((p) => p.right), exercise.id);
  const [chosen, setChosen] = useState<(string | null)[]>(pairs.map(() => null));
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState<null | ReturnType<typeof gradeMatch>>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const record = useRecorder(exercise);
  function check() {
    const g = gradeMatch(chosen, pairs);
    const n = tries + 1;
    setTries(n);
    if (g.exact || n >= 2) { setDone(g); record(g.exact, n, false); }
    else setFeedback(t("{right} of {total} are right.", { right: g.right, total: g.total }) + " " + t("One more try."));
  }
  return (
    <div className="grid gap-5">
      {header}
      <Prompt text={exercise.prompt} />
      <ul className="grid gap-3">
        {pairs.map((p, i) => {
          const ok = done && chosen[i] === p.right;
          return (
            <li key={i} className={`grid gap-2 rounded-xl border-2 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center ${done ? (ok ? "border-teal" : "border-coral") : "border-line"}`}>
              <span className="font-bold"><RichText text={p.left} /></span>
              {done ? (
                <span className="text-[15px]">
                  {ok ? <RichText text={p.right} /> : <><span className="text-coral-ink line-through">{chosen[i] ?? "no answer"}</span><br /><RichText text={p.right} /></>}
                </span>
              ) : (
                <select value={chosen[i] ?? ""} onChange={(e) => setChosen(chosen.map((c, k) => (k === i ? e.target.value || null : c)))}
                  aria-label={t("Match for {item}", { item: p.left })} className="min-h-[48px] w-full rounded-lg border border-line bg-white px-3">
                  <option value="">{t("Choose…")}</option>
                  {rights.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {done ? (
        <Done ok={done.exact} exercise={exercise} onDone={onDone} nextLabel={nextLabel}>
          <b>{done.exact ? (tries === 1 ? t("All matched, first try.") : t("All matched.")) : t("{right} of {total} matched.", { right: done.right, total: done.total })}</b>
        </Done>
      ) : (
        <>
          {feedback && <Verdict ok={false}>{feedback}</Verdict>}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={chosen.some((c) => !c)} onClick={check}>{t("Check my answer")}</button>
            <button className="btn-ghost" onClick={() => { setDone(gradeMatch(pairs.map(() => null), pairs)); record(false, tries, false); }}>{t("I'm stuck, show the answer")}</button>
          </div>
        </>
      )}
    </div>
  );
}
