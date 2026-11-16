import { Link } from "react-router-dom";
import { useT } from "../i18n";

export default function NotFound() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-3xl font-bold">{t("This page doesn't exist")}</h1>
      <p className="mt-2 text-navy-mute">{t("The link may be mistyped, or the page has moved.")}</p>
      <Link to="/" className="btn-primary mt-6">{t("Go to the home page")}</Link>
    </div>
  );
}
