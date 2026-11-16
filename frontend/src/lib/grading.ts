// Exact grading for the formats that have a definite answer. Pure functions, unit-tested.

/** Multiple response: full marks only for the exact set; partial credit = right picks minus wrong picks, never below 0. */
export function gradeMulti(selected: number[], correct: number[]) {
  const right = selected.filter((i) => correct.includes(i)).length;
  const wrong = selected.filter((i) => !correct.includes(i)).length;
  const exact = right === correct.length && wrong === 0;
  return { exact, fraction: exact ? 1 : Math.max(0, (right - wrong) / correct.length), right, wrong, missed: correct.length - right };
}

/** Lower-case, unify quotes/dashes, drop surrounding punctuation and a leading article, collapse spaces. */
export function normaliseAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘`]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/^[\s"'“”«».,;:!?()]+|[\s"'“”«».,;:!?()]+$/g, "")
    .replace(/^(?:(?:the|a|an|le|la|les|un|une|des|el|los|las)\s+|l'|d')/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fill in the blank: exact match against any accepted answer, after normalising. */
export function gradeBlank(input: string, accepted: string[]): boolean {
  const n = normaliseAnswer(input);
  return n !== "" && accepted.some((a) => normaliseAnswer(a) === n);
}

/** Matching: chosen[i] is the right-hand text picked for pair i. */
export function gradeMatch(chosen: (string | null)[], pairs: { left: string; right: string }[]) {
  const right = pairs.filter((p, i) => chosen[i] === p.right).length;
  return { right, total: pairs.length, exact: right === pairs.length, fraction: right / pairs.length };
}

/** Deterministic shuffle so the right-hand column is mixed up but stable for a question. */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Points rounded to halves, for exam scoring. */
export const halves = (x: number) => Math.round(x * 2) / 2;
