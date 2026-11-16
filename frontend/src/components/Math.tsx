import katex from "katex";
import { useMemo } from "react";

/** Renders LaTeX with KaTeX. Bad input shows the source instead of crashing. */
export default function Math({ tex, block = false, className = "" }: { tex: string; block?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { throwOnError: false, displayMode: block, strict: "ignore" }),
    [tex, block],
  );
  return <span className={`katex-wrap ${block ? "block" : "inline-block max-w-full align-middle"} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
