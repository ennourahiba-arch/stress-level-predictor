import { Languages } from "lucide-react";
import { LANGS, useT, type Lang } from "../i18n";

/** Language picker: full names on wider screens, EN / FR / IT on phones so the header fits. */
export default function LangPicker() {
  const { lang, setLang, t } = useT();
  const cls = "cursor-pointer bg-transparent font-bold outline-none";
  return (
    <label className="inline-flex items-center gap-1 rounded-full px-1.5 py-1.5 text-sm font-bold text-navy-mute hover:text-navy sm:px-2" title={t("Language")}>
      <Languages size={17} aria-hidden />
      <span className="sr-only">{t("Language")}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className={`${cls} hidden sm:block`}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className={`${cls} sm:hidden`} aria-label={t("Language")}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}
      </select>
    </label>
  );
}
