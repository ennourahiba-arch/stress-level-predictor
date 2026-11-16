import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Check, Loader2, X } from "lucide-react";
import TeX from "../components/Math";
import RichText from "../components/RichText";
import { ErrorState, Loading } from "../components/States";
import { ConnBadge, LETTERS, OptionBody, SolutionPanel, Timer } from "../components/Live";
import { api, cleanCode, tokens } from "../lib/api";
import { useCountdown, useRoom } from "../lib/useRoom";
import { useT } from "../i18n";

export default function TeamGame() {
  const code = cleanCode(useParams().code ?? "");
  const saved = tokens.get("team", code);
  if (!saved) return <Navigate to={`/join/${code}`} replace />;
  return <Game code={code} token={saved.token} />;
}

function Game({ code, token }: { code: string; token: string }) {
  const { t } = useT();
  const { state, error, conn, refresh, apply, serverNow } = useRoom(code, { team: token });
  const left = useCountdown(state?.status === "question" ? state.deadline_ms : null, serverNow, refresh);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (error && !state) {
    if (error.status === 404) { tokens.clear("team", code); return <ErrorState message={t("This quiz doesn't exist any more. Ask your professor for the new code.")} />; }
    return <ErrorState message={error.message} onRetry={refresh} />;
  }
  if (!state) return <Loading label={t("Joining the quiz")} />;
  if (state.mode === "duel") return <Navigate to={`/duel/${code}`} replace />;
  if (!state.you) { tokens.clear("team", code); return <Navigate to={`/join/${code}`} replace />; }
  const you = state.you;

  async function pick(k: number) {
    setBusy(true); setErr(null);
    try { apply(await api.answer(code, token, state!.q_index, k)); } catch (e) { setErr((e as Error).message); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-sm text-navy-mute">{t("{title}, room {code}", { title: state.title, code: state.code })}</p>
          <p className="font-display text-xl font-bold">{you.name} <span className="ml-2 text-base text-navy-mute">{t("{n} point|{n} points", { n: you.score })}</span></p>
        </div>
        <div className="flex items-center gap-4"><ConnBadge conn={conn} />{state.status === "question" && <Timer left={left} />}</div>
      </div>

      {state.status === "lobby" && (
        <div className="py-16 text-center">
          <Loader2 className="mx-auto animate-spin text-violet" size={28} aria-hidden />
          <h1 className="mt-4 text-2xl font-bold">{t("You're in. Waiting for the professor to start.")}</h1>
          <p className="mt-2 text-navy-mute">{t("{n} question, {s} seconds each.|{n} questions, {s} seconds each.", { n: state.total, s: state.per_q_s })}</p>
        </div>
      )}

      {(state.status === "question" || state.status === "reveal") && state.question && (
        <div className="mt-5 grid gap-4">
          <p className="font-bold text-violet-ink">{t("Question {i} of {total}", { i: state.q_index + 1, total: state.total })}</p>
          <div>
            <p className="text-xl font-bold"><RichText text={state.question.prompt} /></p>
            {state.question.latex && <TeX tex={state.question.latex} block className="mt-1 text-lg" />}
          </div>
          {err && <p className="rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}
          <ul className="grid gap-2.5" role="radiogroup" aria-label={t("Options")}>
            {state.question.options.map((o, k) => {
              const mine = you.answer === k;
              const right = state.status === "reveal" && state.result?.correct === k;
              const wrongMine = state.status === "reveal" && mine && !right;
              const locked = you.answer !== null || state.status !== "question";
              return (
                <li key={k}>
                  <button role="radio" aria-checked={mine} disabled={locked || busy} onClick={() => pick(k)}
                    className={`flex min-h-[60px] w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-default
                      ${right ? "border-teal bg-teal-wash" : wrongMine ? "border-coral bg-coral-wash" : mine ? "border-navy bg-white" : "border-line bg-white hover:border-navy-mute"}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display font-bold ${mine ? "bg-navy text-white" : "bg-paper"}`}>{LETTERS[k]}</span>
                    <span className="min-w-0 flex-1"><OptionBody o={o} /></span>
                    {right && <Check size={20} className="text-teal-ink" aria-label={t("correct answer")} />}
                    {wrongMine && <X size={20} className="text-coral-ink" aria-label={t("your answer")} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {state.status === "question" && you.answer !== null && <p className="text-navy-mute" role="status">{t("Answer locked in. Waiting for the others.")}</p>}
          {state.status === "reveal" && (
            <>
              <p className={`rounded-xl px-4 py-3 font-bold ${you.was_right ? "bg-teal-wash text-teal-ink" : "bg-coral-wash text-coral-ink"}`} role="status">
                {you.answer === null ? t("Time ran out before your team answered.") : you.was_right ? t("Right!") : t("Not this time.")}
              </p>
              {state.result && <SolutionPanel steps={state.result.solution} />}
              <p className="text-navy-mute">{t("Waiting for the next question.")}</p>
            </>
          )}
        </div>
      )}

      {state.status === "finished" && (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl bg-navy px-5 py-4 text-white">
            <p className="text-white/70">{t("Your team scored")}</p>
            <p className="font-display text-4xl font-extrabold">{you.score}<span className="text-xl text-white/60"> / {state.total}</span></p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {Array.from({ length: state.total }, (_, k) => {
              const h = you.history?.find((x) => x.index === k);
              return <li key={k} className={`rounded-full px-3 py-1 font-bold ${h?.was_right ? "bg-teal-wash text-teal-ink" : "bg-coral-wash text-coral-ink"}`}>Q{k + 1} {h?.was_right ? "✓" : "✗"}</li>;
            })}
          </ul>
          <Link to="/student" className="btn-ghost justify-self-start">{t("Practice on your own")}</Link>
        </div>
      )}
    </div>
  );
}
