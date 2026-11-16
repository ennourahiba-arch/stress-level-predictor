import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Wifi, WifiOff } from "lucide-react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import LangPicker from "./LangPicker";
import { useT } from "../i18n";

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-2 py-2 text-[15px] font-bold sm:px-3 ${isActive ? "bg-navy text-white" : "text-navy-mute hover:text-navy"}`;

export default function Layout() {
  const { t } = useT();
  const online = useOnline();
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t("Skip to content")}
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
          <Link to="/" aria-label={t("Rehearsal home")}><Logo /></Link>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            <NavLink to="/student" className={navCls}>{t("Student")}</NavLink>
            <NavLink to="/professor" className={navCls}>{t("Professor")}</NavLink>
            <LangPicker />
            <ThemeToggle />
            <span
              className={`ml-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-sm sm:inline-flex ${online ? "text-teal-ink" : "bg-coral-wash text-coral-ink"}`}
              role="status"
              aria-live="polite"
            >
              {online ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} aria-hidden />}
              {online ? t("Online") : t("Offline")}
            </span>
          </nav>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </div>
  );
}
