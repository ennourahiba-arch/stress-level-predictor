import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { Check, Copy, Loader2, Share2, Swords, Trophy, X } from "lucide-react";
import TeX from "../components/Math";
import RichText from "../components/RichText";
import { ErrorState, Loading } from "../components/States";
import { ConnBadge, LETTERS, OptionBody, SolutionPanel, Timer } from "../components/Live";
import { api, cleanCode, tokens, type RoomState } from "../lib/api";
import { addExerciseAttempt, getKV } from "../lib/storage";
import { useCountdown, useRoom } from "../lib/useRoom";
import { useT } from "../i18n";

export default function Duel() {
  const code = cleanCode(useParams().code ?? "");
  const [team, setTeam] = useState(tokens.get("team", code));
  if (!team) return <JoinDuel code={code} onJoined={() => setTeam(tokens.get("team", code))} />;
  return <Game code={code} team={team.token} host={tokens.get("host", code)?.token} />;
}

function JoinDuel({ code, onJoined }: { code: string; onJoined: () => void }) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getKV<string>("nickname").then((n) => n && setName(n)); }, []);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.join(code, name.trim());
      tokens.set("team", r.code, { token: r.team_token, name: r.team_name });
      onJoined();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <form onSubmit={join} className="mx-auto grid max-w-md gap-4 px-4 py-12">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Swords size={28} className="text-coral-ink" aria-hidden /> {t("You've been challenged")}</h1>
      <p className="text-navy-soft">{t("Duel {code}. Same questions for both of you; the first correct answer wins each point.", { code })}</p>
      <label className="grid gap-1.5"><span className="font-bold">{t("Your name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} autoFocus className="min-h-[52px] rounded-xl border border-line bg-white px-4 outline-none focus:border-violet" />
      </label>
      {err && <p className="rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}
      <button className="btn-primary" disabled={!name.trim() || busy}>{busy && <Loader2 size={17} className="animate-spin" aria-hidden />} {t("Accept the duel")}</button>
    </form>
  );
}

function Scores({ state }: { state: RoomState }) {
  const { t } = useT();
  const players = state.players ?? [];
  return (
    <div className="grid grid-cols-2 gap-3" aria-label={t("Scores")}>
      {players.map((p) => (
        <div key={p.name} className={`rounded-xl border-2 px-4 py-3 ${p.is_you ? "border-navy bg-white" : "border-line bg-white"}`}>
          <p className="truncate text-sm text-navy-mute">{p.is_you ? t("You") : p.name}</p>
          <p className="flex items-center justify-between font-display text-3xl font-extrabold">
            {p.score}
            {state.status === "question" && p.answered && <span className="text-sm font-bold text-teal-ink">{t("answered")}</span>}
          </p>
        </div>
      ))}
      {players.length < 2 && <div className="rounded-xl border-2 border-dashed border-line px-4 py-3 text-navy-mute">{t("Waiting for your friend")}</div>}
    </div>
  );
}

function Game({ code, team, host }: { code: string; team: string; host?: string }) {
  const { t } = useT();
  const { state, error, conn, refresh, apply, serverNow } = useRoom(code, { team, host });
  const left = useCountdown(state?.status === "question" ? state.deadline_ms : null, serverNow, refresh);
  const next = useCountdown(state?.status === "reveal" ? state.reveal_until : null, serverNow, refresh);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recorded = useRef(new Set<number>());

  // Duel answers count toward the daily streak (not toward any lesson's readiness).
  useEffect(() => {
    if (state?.status !== "reveal" || !state.you || state.you.answer === null || recorded.current.has(state.q_index)) return;
    recorded.current.add(state.q_index);
    const ok = !!state.you.was_right;
    addExerciseAttempt({ exerciseId: `duel-${code}-q${state.q_index}`, topic: "duel", ts: Date.now(), attempts: 1, correct: ok, firstTry: ok, usedHint: false }).catch(() => undefined);
  }, [state, code]);

  if (error && !state) {
    if (error.status === 404) { tokens.clear("team", code); return <ErrorState message={t("This duel doesn't exist any more. Start a new one.")} />; }
    return <ErrorState message={error.message} onRetry={refresh} />;
  }
  if (!state) return <Loading label={t("Opening the duel")} />;
  if (!state.you) { tokens.clear("team", code); return <ErrorState message={t("You're not part of this duel. Ask for a new link.")} />; }
  const opponent = state.players?.find((p) => !p.is_you);

  async function pick(k: number) {
    setBusy(true); setErr(null);
    try { apply(await api.answer(code, team, state!.q_index, k)); } catch (e) { setErr((e as Error).message); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold"><Swords size={18} className="text-coral-ink" aria-hidden /> {t("Duel {code}", { code: state.code })}</p>
          <p className="truncate text-sm text-navy-mute">{state.title}</p>
        </div>
        <div className="flex items-center gap-4"><ConnBadge conn={conn} />{state.status === "question" && <Timer left={left} />}</div>
      </div>
      <Scores state={state} />

      {state.status === "lobby" && <Lobby state={state} host={host} onStart={async () => {
        setErr(null);
        try { apply(await api.start(code, host!)); } catch (e) { setErr((e as Error).message); }
      }} err={err} />}

      {(state.status === "question" || state.status === "reveal") && state.question && (
        <div className="mt-6 grid gap-4">
          <p className="font-bold text-violet-ink">{t("Question {i} of {total}", { i: state.q_index + 1, total: state.total })}</p>
          <div>
            <p className="text-xl font-bold"><RichText text={state.question.prompt} /></p>
            {state.question.latex && <TeX tex={state.question.latex} block className="mt-1 text-lg" />}
          </div>
          {err && <p className="rounded-lg bg-coral-wash px-4 py-3 text-coral-ink" role="alert">{t(err)}</p>}
          <ul className="grid gap-2.5" role="radiogroup" aria-label={t("Options")}>
            {state.question.options.map((o, k) => {
              const mine = state.you!.answer === k;
              const right = state.status === "reveal" && state.result?.correct === k;
              const wrongMine = state.status === "reveal" && mine && !right;
              const locked = state.you!.answer !== null || state.status !== "question";
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
          {state.status === "question" && state.you.answer !== null && (
            <p className="text-navy-mute" role="status">{t("Locked in.")} {opponent?.answered ? t("Revealing…") : (opponent ? t("Waiting for {name}.", { name: opponent.name }) : t("Waiting for your friend."))}</p>
          )}
          {state.status === "reveal" && (
            <>
              <p className={`rounded-xl px-4 py-3 font-bold ${state.point_to === state.you.name ? "bg-teal-wash text-teal-ink" : state.point_to ? "bg-coral-wash text-coral-ink" : "bg-paper text-navy"}`} role="status">
                {state.point_to === state.you.name ? t("Point to you!")
                  : state.point_to ? t("{name} got there first.", { name: state.point_to })
                  : t("Nobody got this one.")}
                {state.you.answer === null && t(" You ran out of time.")}
              </p>
              {state.result && <SolutionPanel steps={state.result.solution} title={t("Why")} />}
              <p className="text-navy-mute">{state.q_index + 1 < state.total ? t("Next question in {n}…", { n: next ?? 0 }) : t("Results in {n}…", { n: next ?? 0 })}</p>
            </>
          )}
        </div>
      )}

      {state.status === "finished" && (
        <div className="mt-8 grid gap-4 text-center">
          <Trophy size={44} className="mx-auto text-coral" aria-hidden />
          <h1 className="text-3xl font-bold">
            {state.winner === state.you.name ? t("You won!") : state.winner ? t("{name} wins.", { name: state.winner }) : t("It's a draw.")}
          </h1>
          <p className="text-navy-soft">{state.players?.map((p) => `${p.is_you ? t("You") : p.name}: ${p.score}`).join(", ")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/duel/new" className="btn-primary"><Swords size={17} aria-hidden /> {t("New duel")}</Link>
            <Link to="/student" className="btn-ghost">{t("Back to my dashboard")}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Lobby({ state, host, onStart, err }: { state: RoomState; host?: string; onStart: () => void; err: string | null }) {
  const { t } = useT();
  const link = `${window.location.origin}/duel/${state.code}`;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 400 }).then(setQr).catch(() => setQr(null)); }, [link]);
  const ready = (state.players?.length ?? 0) >= 2;
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: t("Rehearsal duel"), text: t("Duel me on Rehearsal!"), url: link }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    setCopied(true);
  };
  if (!host) {
    return <p className="mt-10 text-center text-xl font-bold">{ready ? t("Ready! Waiting for your opponent to start.") : t("Joining…")}</p>;
  }
  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="rounded-xl border border-line bg-white p-4 text-center">
        {qr ? <img src={qr} alt={t("QR code for {link}", { link })} className="mx-auto h-48 w-48 rounded bg-white p-1" /> : <div className="mx-auto h-48 w-48 animate-pulse rounded bg-paper" />}
        <p className="mt-2 font-display text-3xl font-extrabold tracking-[0.15em]">{state.code}</p>
      </div>
      <div className="grid content-start gap-3">
        <p className="text-lg">{ready ? <b>{t("Your friend is here.")}</b> : t("Send this to a friend. They scan the code or open the link, enter their name, and you're on.")}</p>
        <button className="btn-ghost justify-self-start" onClick={share}>{copied ? <><Copy size={17} aria-hidden /> {t("Link copied")}</> : <><Share2 size={17} aria-hidden /> {t("Share the link")}</>}</button>
        <p className="break-all text-sm text-navy-mute">{link}</p>
        {err && <p className="text-coral-ink" role="alert">{t(err)}</p>}
        <button className="btn-primary justify-self-start" disabled={!ready} onClick={onStart}><Swords size={17} aria-hidden /> {ready ? t("Start the duel") : t("Waiting for your friend")}</button>
      </div>
    </div>
  );
}
