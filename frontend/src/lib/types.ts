// Mirrors content/rehearsal/build_pack.py (Calculus) and backend/app/genpack.py (uploads).
export type TopicId = string;

export type ExerciseAnswer =
  | { kind: "expression"; coeffs: Record<string, string> }
  | { kind: "points"; values: string[] }
  | { kind: "extremum"; extremum: "max" | "min"; value: string; at: string[] }
  | { kind: "mcq"; correct: number }
  | { kind: "multi"; correct: number[] }
  | { kind: "tf"; value: boolean }
  | { kind: "blank"; accepted: string[] }
  | { kind: "match"; pairs: { left: string; right: string }[] }
  | { kind: "open"; key_points: string[]; model_answer: string; problem?: boolean; final_answer?: string | null };

export interface SolutionLine { text: string; latex: string; quote?: string; source?: string }

export interface Exercise {
  id: string;
  topic: TopicId;
  difficulty: number;
  prompt: string;
  latex: string;
  answer: ExerciseAnswer;
  answer_latex: string;
  input_help: string;
  hint: string;
  solution: SolutionLine[];
  /** which exam format this question belongs to (uploaded material) */
  format?: Format;
  /** uploaded multiple choice / multiple response / true-false */
  options?: string[];
  labels?: (string | null)[];
  answer_text?: string;
  source_ids?: string[];
  provenance?: string;
  /** Calculus: verified multiple-choice version used in class quizzes */
  mcq?: { prompt: string; options: string[]; labels: (string | null)[]; correct: number };
  verification?: { checker: string; status: string };
}

export interface Pack {
  pack_id: string;
  subject: string;
  pack_version: string;
  content_hash: string;
  topics: { id: TopicId; name: string }[];
  exercises: Exercise[];
}

export interface ExamProfile {
  question_types: string[];
  /** questions per format in a typical past exam, e.g. { quiz: 10, tf: 5 } */
  parts?: Partial<Record<Format, number>>;
  duration_minutes: number | null;
  number_of_questions: number | null;
  notes: string;
}

export type Format = "quiz" | "multi" | "tf" | "blank" | "match" | "short" | "written" | "oral";

export const FORMAT_INFO: Record<Format, { name: string; exact: boolean; text: string; counts: number[] }> = {
  quiz: { name: "Multiple choice", exact: true, text: "One correct option out of four. Wrong options are real student mistakes.", counts: [8, 12, 16, 20] },
  multi: { name: "Multiple response", exact: true, text: "Select every correct option. Partial credit for partly right answers.", counts: [6, 10, 14] },
  tf: { name: "True / False", exact: true, text: "Decide whether each statement is correct. Quick checks of key facts.", counts: [10, 15, 20] },
  blank: { name: "Fill in the blanks", exact: true, text: "Type the missing term or value. Common synonyms are accepted.", counts: [8, 12, 16] },
  match: { name: "Matching", exact: true, text: "Match terms with definitions, examples or properties.", counts: [4, 6, 8] },
  short: { name: "Short answer", exact: false, text: "A definition, brief explanation or one-step calculation, graded against your lesson.", counts: [6, 8, 10] },
  written: { name: "Long answer & problems", exact: false, text: "Structured explanations and worked problems, marked point by point.", counts: [4, 6, 8] },
  oral: { name: "Oral", exact: false, text: "An examiner asks you questions in a chat. Answer by typing or speaking.", counts: [5, 7, 10] },
};
export const FORMAT_ORDER: Format[] = ["quiz", "multi", "tf", "blank", "match", "short", "written", "oral"];
export interface Passage { id: string; file: string; text: string }

/** Questions generated for one lesson in one format. */
export interface Bank {
  format: Format;
  created_at: string;
  generator: { provider: string | null; model: string; test_mode: boolean };
  exercises: Exercise[];
  dropped: string[];
  approved?: string[]; // question ids a professor approved for class
}

export interface Lesson {
  id: string;
  title: string;
  created_at: string;
  sources: string[];
  passages: Passage[];
  truncated?: boolean;
  banks: Partial<Record<Format, Bank>>;
}

export interface MockResult {
  id: string;
  ts: number;
  minutes_allowed: number;
  minutes_used: number;
  score: number;
  max: number;
  by_lesson: { lesson_id: string; title: string; score: number; max: number }[];
}

/** One course the student is taking (e.g. "Systems"). Lives in IndexedDB only. */
export interface Course {
  id: string;
  name: string;
  created_at: string;
  lessons: Lesson[];
  past_exams: { files: string[]; text: string } | null;
  exam_profile: ExamProfile | null;
  mocks: MockResult[];
}

/** Lets a lesson's bank reuse the practice, readiness and session code. */
export function lessonPack(course: Course, lesson: Lesson, format?: Format): Pack {
  const ex = format ? lesson.banks[format]?.exercises ?? [] : Object.values(lesson.banks).flatMap((b) => b?.exercises ?? []);
  return { pack_id: lesson.id, subject: course.name, pack_version: "custom", content_hash: lesson.id, topics: [{ id: lesson.id, name: lesson.title }], exercises: ex };
}

// ---- earlier versions (kept only to move old uploads into courses) ----
/** A question bank from the previous version (one upload = one pack). */
export interface CustomPack {
  id: string;
  version?: number; // 2 for question banks; older packs were "catch the AI" rounds
  title: string;
  format: "quiz" | "written" | "oral";
  created_at: string;
  generator: { provider: string | null; model: string; test_mode: boolean };
  exercises: Exercise[];
  exam_profile: ExamProfile | null;
  dropped: string[];
  passages: { id: string; file: string; text: string }[];
  sources: string[];
  approved?: string[]; // question ids a professor approved for class
}

export const isCurrentPack = (p: CustomPack) => p.version === 2 && Array.isArray(p.exercises);
