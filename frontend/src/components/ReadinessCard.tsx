import type { Readiness } from "../lib/readiness";
import { useT } from "../i18n";

export default function ReadinessCard({ r, compact = false }: { r: Readiness; compact?: boolean }) {
  const { t } = useT();
  return (
    <section className="rounded-xl border border-line bg-white p-5" aria-label={t("Readiness for {topic}", { topic: r.topicName })}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={`${compact ? "text-lg" : "text-2xl"} font-bold`}>{r.topicName}</h2>
          <p className="text-[15px] text-navy-mute">{r.answered.of ? t("Readiness from your last answer|Readiness from your last {n} answers", { n: r.answered.of }) : t("Readiness from your answers")}</p>
        </div>
        <p className="shrink-0 text-right">
          {r.score === null
            ? <span className="text-[15px] text-navy-mute">{t("Not enough data yet")}</span>
            : <span className={`font-display ${compact ? "text-3xl" : "text-5xl"} font-extrabold ${r.score >= 80 ? "text-teal-ink" : r.score < 50 ? "text-coral-ink" : ""}`}>{r.score}%</span>}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[15px]">
        <div><dt className="text-navy-mute">{t("Your confidence")}</dt><dd className="font-bold">{r.confidence !== null ? `${r.confidence} / 5` : t("not rated")}</dd></div>
        <div><dt className="text-navy-mute">{t("Right")}</dt><dd className="font-bold">{r.answered.of ? t("{right} of {n}", { right: r.answered.firstTry + r.answered.later, n: r.answered.of }) : t("none yet")}</dd></div>
      </dl>
      {r.message && <p className="mt-4 rounded-lg bg-coral-wash px-4 py-3">{t(r.message.key, r.message.params)}</p>}
      {!compact && r.mistakes.length > 0 && <p className="mt-4"><b>{t("Your most common mistake:")}</b> {t("{mistake}.", { mistake: r.mistakes[0].label.toLowerCase() })}</p>}
      <p className="mt-4"><b>{t("Next:")}</b> {t(r.next.key, r.next.params)}</p>
    </section>
  );
}
