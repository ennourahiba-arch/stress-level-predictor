// Interface languages: English (the keys), French and Italian.
// Use t("English text", { name: value }) in components. Plurals: "{n} question|{n} questions"
// (singular|plural, chosen with each language's own rules: French treats 0 as singular).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import fr from "./fr";
import it from "./it";

export type Lang = "en" | "fr" | "it";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
];
const DICTS: Record<Exclude<Lang, "en">, Record<string, string>> = { fr, it };
const KEY = "rehearsal:lang";
export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: string, params?: Params): string {
  let s = lang === "en" ? key : DICTS[lang][key] ?? key;
  if (s.includes("|") && params && typeof params.n === "number") {
    const [one, other] = s.split("|");
    s = new Intl.PluralRules(lang).select(params.n) === "one" ? one : other ?? one;
  }
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "fr" || saved === "it") return saved;
  } catch { /* storage unavailable */ }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2);
  return nav === "fr" || nav === "it" ? nav : "en";
}

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (key: string, params?: Params) => string }
const LangContext = createContext<Ctx>({ lang: "en", setLang: () => undefined, t: (k, p) => translate("en", k, p) });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);
  const t = useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);

/** The language the app is currently shown in, for code outside React components. */
export function currentLang(): Lang {
  return (typeof document !== "undefined" && (document.documentElement.lang as Lang)) || "en";
}
