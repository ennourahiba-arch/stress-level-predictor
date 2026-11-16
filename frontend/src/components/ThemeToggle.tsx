import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useT } from "../i18n";

type Theme = "system" | "light" | "dark";
const KEY = "rehearsal:theme";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
export const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" }; // translated at display

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}

/** Cycles System → Light → Dark. "System" follows the device's setting. */
export default function ThemeToggle() {
  const { t } = useT();
  const [theme, setTheme] = useState<Theme>(() => {
    try { const t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
  });
  useEffect(() => {
    apply(theme);
    try { theme === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button type="button" onClick={() => setTheme(NEXT[theme])}
      className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-2 text-sm font-bold text-navy-mute hover:text-navy sm:px-2.5"
      aria-label={t("Theme: {now}. Switch to {next}.", { now: t(LABEL[theme]), next: t(LABEL[NEXT[theme]]) })} title={t("Theme: {now}", { now: t(LABEL[theme]) })}>
      <Icon size={17} aria-hidden /> <span className="hidden sm:inline">{t(LABEL[theme])}</span>
    </button>
  );
}
