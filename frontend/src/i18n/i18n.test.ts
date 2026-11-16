// Fails if any interface text is untranslated, or a translation loses a {placeholder} or plural form.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import fr from "./fr";
import it_ from "./it";
import { translate } from "./index";
import { FORMAT_INFO } from "../lib/types";
import { FORMATS, STEPS } from "../pages/Landing";
import { MODES } from "../components/DemoCard";
import { LABELS } from "../pages/Practice";
import { LABEL } from "../components/ThemeToggle";

const SRC = resolve(__dirname, "..");
const files: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts") && !p.includes(`${"/"}i18n${"/"}`)) files.push(p);
  }
})(SRC);

const keysInCode = new Set<string>();
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keysInCode.add(JSON.parse(`"${m[1]}"`));
}
// text kept in lists and translated where it's shown
for (const info of Object.values(FORMAT_INFO)) { keysInCode.add(info.name); keysInCode.add(info.text); }
for (const [a, b] of STEPS) { keysInCode.add(a); keysInCode.add(b); }
for (const f of FORMATS) { keysInCode.add(f.title); keysInCode.add(f.text); }
for (const m of MODES) keysInCode.add(m.label);
for (const l of [...LABELS, ...Object.values(LABEL)]) keysInCode.add(l);

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe("translations", () => {
  it("every key used in the code has French and Italian", () => {
    const missing = [...keysInCode].filter((k) => !(k in fr) || !(k in it_));
    expect(missing).toEqual([]);
  });
  it("translations keep every {placeholder} and plural form", () => {
    for (const dict of [fr, it_]) {
      for (const [k, v] of Object.entries(dict)) {
        expect([k, placeholders(v)]).toEqual([k, placeholders(k)]);
        expect([k, v.split("|").length]).toEqual([k, k.split("|").length]);
      }
    }
  });
  it("no visible text in the interface is left outside t()", () => {
    const skip = new Set(["components/Logo.tsx", "components/RichText.tsx", "components/Math.tsx"]);
    const raw: string[] = [];
    for (const f of files.filter((x) => x.endsWith(".tsx") && !skip.has(relative(SRC, x)))) {
      const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        const text = n.getText().trim();
        if (ts.isJsxText(n) && /[A-Za-zÀ-ÿ]{2,}/.test(text) && !/^\/[\w/-]+$/.test(text)) raw.push(`${relative(SRC, f)}: ${n.getText().trim()}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(raw).toEqual([]);
  });
  it("plurals follow each language's rules", () => {
    expect(translate("en", "{n} lesson|{n} lessons", { n: 0 })).toBe("0 lessons");
    expect(translate("fr", "{n} lesson|{n} lessons", { n: 0 })).toBe("0 leçon"); // French: 0 is singular
    expect(translate("it", "{n} lesson|{n} lessons", { n: 1 })).toBe("1 lezione");
    expect(translate("it", "{n} lesson|{n} lessons", { n: 3 })).toBe("3 lezioni");
  });
});
