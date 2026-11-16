import katex from "katex";
import { useMemo } from "react";

/** Plain text with optional inline maths written as $...$ (useful for physics,
 * chemistry, economics...). Line breaks are kept. Text is escaped first. */
export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return text
      .split(/(\$[^$\n]{1,300}\$)/g)
      .map((part) =>
        /^\$[^$]+\$$/.test(part)
          ? katex.renderToString(part.slice(1, -1), { throwOnError: false, strict: "ignore" })
          : esc(part),
      )
      .join("");
  }, [text]);
  return <span className={`whitespace-pre-line ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
