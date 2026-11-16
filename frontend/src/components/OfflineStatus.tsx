import { useEffect, useState } from "react";
import { CloudOff, HardDriveDownload, Loader2 } from "lucide-react";
import { useT } from "../i18n";

type S = "checking" | "saving" | "ready" | "dev" | "unsupported";

/** Reports the real offline state: it checks the service worker and the cached pack. */
export default function OfflineStatus() {
  const { t } = useT();
  const [s, setS] = useState<S>("checking");
  useEffect(() => {
    if (!import.meta.env.PROD) { setS("dev"); return; }
    if (!("serviceWorker" in navigator) || !("caches" in window)) { setS("unsupported"); return; }
    let alive = true;
    const check = async () => {
      const hit = await caches.match("/packs/calculus1.json").catch(() => undefined);
      if (alive) setS(hit && navigator.serviceWorker.controller ? "ready" : "saving");
    };
    check();
    navigator.serviceWorker.ready.then(() => setTimeout(check, 800));
    navigator.serviceWorker.addEventListener("controllerchange", check);
    return () => { alive = false; navigator.serviceWorker.removeEventListener("controllerchange", check); };
  }, []);

  const text: Record<S, string> = {
    checking: t("Checking offline availability."),
    saving: t("Saving the app to this device for offline use."),
    ready: t("Saved on this device. Your courses, and practice in the instantly graded formats, work with no internet. Creating questions, written grading, oral practice, duels and class quizzes need a connection."),
    dev: t("Offline mode runs in the deployed app, not in local development."),
    unsupported: t("This browser can't save the app for offline use."),
  };
  const Icon = s === "ready" ? HardDriveDownload : s === "saving" || s === "checking" ? Loader2 : CloudOff;
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Icon size={18} className={`${s === "ready" ? "text-teal-ink" : "text-navy-mute"} ${s === "saving" || s === "checking" ? "animate-spin" : ""}`} aria-hidden />
        {t("Offline")}
      </h2>
      <p className="mt-1 text-[15px] text-navy-soft" role="status">{text[s]}</p>
    </section>
  );
}
