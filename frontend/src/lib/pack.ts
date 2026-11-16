import type { Lang } from "../i18n";
import type { Exercise, Pack } from "./types";

let cached: Promise<Pack> | null = null;

export function loadPack(): Promise<Pack> {
  if (!cached) {
    cached = fetch("/packs/calculus1.json")
      .then((r) => {
        if (!r.ok) throw new Error("The question bank could not be loaded.");
        return r.json() as Promise<Pack>;
      })
      .catch((e) => {
        cached = null; // allow retry
        throw e;
      });
  }
  return cached;
}

type ExerciseI18n = {
  prompt: string; input_help: string; hint: string; answer_latex: string;
  solution: { text: string; latex: string }[];
  mcq: { prompt: string; options: string[]; labels: (string | null)[] };
};

/** The Calculus bank in French or Italian, using the exact translations shipped in the pack. */
export function localizePack(pack: Pack, lang: Lang): Pack {
  if (lang === "en") return pack;
  return {
    ...pack,
    topics: pack.topics.map((t) => ({ ...t, name: (t as { i18n?: Record<string, string> }).i18n?.[lang] ?? t.name })),
    exercises: pack.exercises.map((e) => {
      const loc = (e as Exercise & { i18n?: Record<string, ExerciseI18n> }).i18n?.[lang];
      if (!loc) return e;
      return {
        ...e, prompt: loc.prompt, input_help: loc.input_help, hint: loc.hint, answer_latex: loc.answer_latex,
        solution: e.solution.map((s, i) => ({ ...s, text: loc.solution[i]?.text ?? s.text, latex: loc.solution[i]?.latex ?? s.latex })),
        mcq: e.mcq && { ...e.mcq, prompt: loc.mcq.prompt, options: loc.mcq.options, labels: loc.mcq.labels },
      };
    }),
  };
}
