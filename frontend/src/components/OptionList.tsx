import { Check, X } from "lucide-react";
import Math from "./Math";
import RichText from "./RichText";
import { useT } from "../i18n";

interface Opt { id: string; text?: string; latex?: string; label?: string }

/** Radio-style option list. In review mode marks the correct and chosen options. */
export default function OptionList({
  options, selected, onSelect, reviewCorrect, legend,
}: {
  options: Opt[];
  selected: string | null;
  onSelect?: (id: string) => void;
  reviewCorrect?: string | null;
  legend: string;
}) {
  const { t } = useT();
  const review = reviewCorrect !== undefined;
  return (
    <div role="radiogroup" aria-label={legend} className="grid gap-2.5">
      {options.map((o) => {
        const isSel = selected === o.id;
        const isRight = review && o.id === reviewCorrect;
        const isWrongSel = review && isSel && !isRight;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={isSel}
            disabled={review}
            onClick={() => onSelect?.(o.id)}
            className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-default
              ${isRight ? "border-teal bg-teal-wash" : isWrongSel ? "border-coral bg-coral-wash" : isSel ? "border-navy bg-white" : "border-line bg-white hover:border-navy-mute"}`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${isSel && !review ? "border-navy bg-navy" : isRight ? "border-teal-ink bg-teal-ink" : isWrongSel ? "border-coral-ink bg-coral-ink" : "border-line"}`} aria-hidden>
              {isRight && <Check size={14} className="text-white" strokeWidth={3} />}
              {isWrongSel && <X size={14} className="text-white" strokeWidth={3} />}
              {isSel && !review && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
            <span className="min-w-0 flex-1">
              {o.label && <span className="font-bold">{o.label}</span>}
              {o.latex ? <Math tex={o.latex} /> : o.text && !o.label ? <RichText text={o.text} /> : null}
            </span>
            {isRight && <span className="sr-only">{t("(correct answer)")}</span>}
            {isWrongSel && <span className="sr-only">{t("(your answer, incorrect)")}</span>}
          </button>
        );
      })}
    </div>
  );
}
