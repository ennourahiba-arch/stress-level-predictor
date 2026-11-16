import { useMemo, useState } from "react";
import { BadgeCheck, Check, RefreshCw, X } from "lucide-react";
import TeX from "./Math";
import { usePack } from "./usePack";
import { useT } from "../i18n";
import { checkExpression, checkPoints, type Verdict } from "../lib/mathcheck";
import type { Exercise } from "../lib/types";

type Mode = "mcq" | "typed" | "tf";
export const MODES: { id: Mode; label: string }[] = [
  { id: "mcq", label: "Multiple choice" },
  { id: "typed", label: "Type the answer" },
  { id: "tf", label: "True or false" },
];
const LETTERS = "ABCD";

/** A verified true/false statement derived from a question's verified options:
 * either the correct option (true) or one specific mistake (false). */
function trueFalse(e: Exercise) {
  const m = e.mcq!;
  let h = 0;
  for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const showCorrect = h % 2 === 0;
  const idx = showCorrect ? m.correct : (m.correct + 1) % 4;
  return { claim: m.options[idx], value: showCorrect, trap: m.labels[idx] };
}

/** The home page's try-it-now card: real, verified Calculus questions in three formats. */
export default function DemoCard() {
  const { t } = useT();
  const { pack } = usePack();
  const [mode, setMode] = useState<Mode>("typed");
  const [n, setN] = useState(0);
  const pools = useMemo(() => {
    const ex = pack?.exercises ?? [];
    return {
      mcq: ex.filter((e) => e.mcq),
      typed: ex.filter((e) => e.answer.kind === "expression" || e.answer.kind === "points"),
      tf: ex.filter((e) => e.mcq),
    };
  }, [pack]);

  if (!pack) return <div className="sheet h-[25rem] animate-pulse" aria-hidden />;
  const pool = pools[mode];
  const e = pool[(n * 7 + 3) % pool.length];
  const topic = pack.topics.find((tp) => tp.id === e.topic)?.name ?? "";

  return (
    <div className="sheet flex min-h-[25rem] min-w-0 flex-col overflow-hidden" aria-label={t("Try a question")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/70 py-2 pl-[3.75rem] pr-3 sm:pl-[4.25rem]">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("Question format")}>
          {MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => { setMode(m.id); setN(0); }}
              className={`rounded-full px-3 py-1 text-sm font-bold transition-colors ${mode === m.id ? "bg-navy text-white" : "text-navy-mute hover:text-navy"}`}>
              {t(m.label)}
            </button>
          ))}
        </div>
        <span className="text-sm text-navy-mute">{topic}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 py-4 pl-[3.75rem] pr-4 sm:pl-[4.25rem] sm:pr-5">
        {mode === "mcq" && <McqDemo key={`m${n}`} e={e} />}
        {mode === "typed" && <TypedDemo key={`t${n}`} e={e} />}
        {mode === "tf" && <TfDemo key={`f${n}`} e={e} />}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-sm">
          <button className="inline-flex items-center gap-1.5 font-bold text-violet-ink hover:text-navy" onClick={() => setN(n + 1)}>
            <RefreshCw size={14} aria-hidden /> {t("Try another")}
          </button>
          <span className="inline-flex items-center gap-1 text-navy-mute"><BadgeCheck size={14} className="text-teal-ink" aria-hidden /> {t("Verified with SymPy")}</span>
        </div>
      </div>
    </div>
  );
}

function Feedback({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[15px] ${ok ? "bg-teal-wash text-teal-ink" : "bg-coral-wash text-coral-ink"}`} role="status">
      {ok ? <Check size={17} className="mt-0.5 shrink-0" aria-hidden /> : <X size={17} className="mt-0.5 shrink-0" aria-hidden />}
      <div className="min-w-0 font-bold">{children}</div>
    </div>
  );
}

function McqDemo({ e }: { e: Exercise }) {
  const { t } = useT();
  const m = e.mcq!;
  const [pick, setPick] = useState<number | null>(null);
  return (
    <>
      <div>
        <p className="text-navy-soft">{m.prompt}</p>
        <TeX tex={e.latex} className="text-lg" />
      </div>
      <div className="grid gap-1.5" role="radiogroup" aria-label={t("Answer options")}>
        {m.options.map((o, k) => {
          const right = pick !== null && k === m.correct;
          const wrong = pick === k && k !== m.correct;
          return (
            <button key={k} role="radio" aria-checked={pick === k} disabled={pick !== null} onClick={() => setPick(k)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm disabled:cursor-default
                ${right ? "border-teal bg-teal-wash" : wrong ? "border-coral bg-coral-wash" : "border-line bg-white hover:border-navy-mute"}`}>
              <span className="font-display font-bold text-navy-mute">{LETTERS[k]}</span>
              <span className="min-w-0 overflow-x-auto"><TeX tex={o} /></span>
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <Feedback ok={pick === m.correct}>
          {pick === m.correct ? t("Correct.") : t("Not quite: {mistake}.", { mistake: (m.labels[pick] ?? "").toLowerCase() })}
        </Feedback>
      )}
    </>
  );
}

function TypedDemo({ e }: { e: Exercise }) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [v, setV] = useState<Verdict | null>(null);
  const a = e.answer;
  const check = () => setV(a.kind === "expression" ? checkExpression(text, a.coeffs) : a.kind === "points" ? checkPoints(text, a.values) : null);
  return (
    <>
      <div>
        <p className="text-navy-soft">{e.prompt}</p>
        <TeX tex={e.latex} className="text-lg" />
      </div>
      <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); check(); }}>
        <label className="sr-only" htmlFor="demo-answer">{t("Your answer")}</label>
        <input id="demo-answer" value={text} onChange={(ev) => { setText(ev.target.value); setV(null); }} autoComplete="off" spellCheck={false}
          placeholder={t("e.g. {example}", { example: a.kind === "expression" ? "8(2x+3)^3" : "-1, 3" })}
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-line bg-white px-3 font-mono outline-none focus:border-violet" />
        <button className="btn-primary !min-h-[44px] !px-4" disabled={!text.trim()}>{t("Check")}</button>
      </form>
      {v && (v.status === "correct" || v.status === "incorrect") && (
        <Feedback ok={v.status === "correct"}>
          {v.status === "correct" ? t("Correct. Checked exactly, not approximately.") : <>{t("Not quite. The answer is")} <TeX tex={e.answer_latex} /></>}
        </Feedback>
      )}
      {v && (v.status === "syntax" || v.status === "unsupported") && (
        <p className="rounded-lg bg-paper px-3 py-2 text-[15px] ring-1 ring-line" role="status">{t(v.message, v.params)}</p>
      )}
    </>
  );
}

function TfDemo({ e }: { e: Exercise }) {
  const { t } = useT();
  const { claim, value, trap } = trueFalse(e);
  const [pick, setPick] = useState<boolean | null>(null);
  return (
    <>
      <div>
        <p className="text-navy-soft">{t("True or false? For this function:")}</p>
        <TeX tex={e.latex} className="text-lg" />
      </div>
      <div className="rounded-lg bg-paper px-3 py-2 overflow-x-auto"><TeX tex={claim} /></div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("True or false")}>
        {[true, false].map((b) => {
          const right = pick !== null && b === value;
          const wrong = pick === b && b !== value;
          return (
            <button key={String(b)} role="radio" aria-checked={pick === b} disabled={pick !== null} onClick={() => setPick(b)}
              className={`min-h-[44px] rounded-lg border font-display font-bold disabled:cursor-default
                ${right ? "border-teal bg-teal-wash text-teal-ink" : wrong ? "border-coral bg-coral-wash text-coral-ink" : "border-line bg-white hover:border-navy"}`}>
              {b ? t("True") : t("False")}
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <Feedback ok={pick === value}>
          {pick === value ? t("Correct.") : value ? t("It's true.") : t("It's false: {mistake}.", { mistake: (trap ?? "").toLowerCase() })}
        </Feedback>
      )}
    </>
  );
}
