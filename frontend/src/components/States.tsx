import { Loader2 } from "lucide-react";
import { useT } from "../i18n";

export function Loading({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-navy-mute" role="status">
      <Loader2 className="animate-spin" size={20} aria-hidden /> {label ?? t("Loading")}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center" role="alert">
      <h2 className="text-2xl font-bold">{t("Something went wrong")}</h2>
      <p className="mt-2 text-navy-mute">{t(message)}</p>
      {onRetry && <button className="btn-primary mt-6" onClick={onRetry}>{t("Try again")}</button>}
    </div>
  );
}
