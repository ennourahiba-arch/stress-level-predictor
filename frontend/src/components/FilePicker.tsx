import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { useT } from "../i18n";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md";

export default function FilePicker({ label, help, files, setFiles, max }: { label: string; help: string; files: File[]; setFiles: (f: File[]) => void; max: number }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    setFiles(next.slice(0, max));
  };
  return (
    <div>
      <p className="font-bold">{label}</p>
      <p className="text-[15px] text-navy-mute">{help}</p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={`mt-2 flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${drag ? "border-violet bg-violet-wash/40" : "border-line bg-white hover:border-navy-mute"}`}
      >
        <Upload size={22} className="text-navy-mute" aria-hidden />
        <span className="font-bold">{t("Choose files or drop them here")}</span>
        <span className="text-sm text-navy-mute">{t("PDF, Word (.docx), PowerPoint (.pptx) or text. Up to {n} files, 15 MB each.", { n: max })}</span>
      </button>
      <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {files.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-line">
              <span className="flex min-w-0 items-center gap-2"><FileText size={16} className="shrink-0 text-navy-mute" aria-hidden /><span className="truncate">{f.name}</span></span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))} className="rounded p-1 text-navy-mute hover:text-navy">
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
