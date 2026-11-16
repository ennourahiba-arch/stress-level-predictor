// Readiness per topic or pack, from the questions you answered yourself.
import type { History } from "./storage";
import type { Params } from "../i18n";

/** A message to show, translated where it's displayed. */
export interface Msg { key: string; params?: Params }
import type { Course, Exercise, Pack, TopicId } from "./types";

export const WINDOW = 10;
export const MIN_ANSWERED = 3;
export const SESSION_SIZE = 5;

export interface Readiness {
  topic: TopicId;
  topicName: string;
  confidence: number | null;
  answered: { firstTry: number; later: number; of: number };
  score: number | null;
  message: Msg | null;
  mistakes: { label: string; count: number }[];
  next: Msg;
}

export function readiness(pack: Pack, h: History, topic: TopicId): Readiness {
  const topicName = pack.topics.find((t) => t.id === topic)?.name ?? topic;
  const conf = h.confidence.find((c) => c.topic === topic)?.rating ?? null;
  const ex = h.exercises.filter((e) => e.topic === topic).slice(0, WINDOW);
  const firstTry = ex.filter((e) => e.firstTry).length;
  const later = ex.filter((e) => e.correct && !e.firstTry).length;
  const rate = ex.length ? (firstTry + 0.5 * later) / ex.length : 0;
  const score = ex.length >= MIN_ANSWERED ? Math.round(100 * rate) : null;

  const counts: Record<string, number> = {};
  for (const e of ex) if (e.mistake) counts[e.mistake] = (counts[e.mistake] ?? 0) + 1;
  const mistakes = Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const missed = ex.length - firstTry - later;
  let message: Msg | null = null;
  if (conf !== null && ex.length >= MIN_ANSWERED) {
    if (conf >= 4 && rate < 0.5) message = { key: "You felt confident ({conf}/5), but missed {missed} of your last {n} questions. Let's strengthen that.", params: { conf, missed, n: ex.length } };
    else if (conf <= 2 && rate >= 0.8) message = { key: "You rated your confidence {conf}/5, yet you got {right} of your last {n} right. You may be readier than you feel.", params: { conf, right: firstTry + later, n: ex.length } };
  }

  const order = pack.topics.map((t) => t.id);
  const nextTopic = order[order.indexOf(topic) + 1];
  let next: Msg;
  if (score === null) next = { key: "Answer {n} more question to get a readiness score.|Answer {n} more questions to get a readiness score.", params: { n: MIN_ANSWERED - ex.length } };
  else if (mistakes.length && score < 80) next = { key: "Practice again and watch for: {mistake}.", params: { mistake: mistakes[0].label.toLowerCase() } };
  else if (score >= 80 && nextTopic) next = { key: "Ready to move on: try {topic}.", params: { topic: pack.topics.find((t) => t.id === nextTopic)!.name.toLowerCase() } };
  else if (score >= 80) next = { key: "Keep it fresh with a short session every few days." };
  else next = { key: "Do another practice session on this." };

  return { topic, topicName, confidence: conf, answered: { firstTry, later, of: ex.length }, score, message, mistakes, next };
}

/** A practice session: questions never seen first, then ones you got wrong, then the least recent. */
export function pickSession(items: Exercise[], h: History, size = SESSION_SIZE): Exercise[] {
  const last = new Map<string, { ts: number; ok: boolean }>();
  for (const a of h.exercises) if (!last.has(a.exerciseId)) last.set(a.exerciseId, { ts: a.ts, ok: a.firstTry });
  const rank = (e: Exercise) => {
    const l = last.get(e.id);
    if (!l) return [0, e.difficulty, 0];
    return [l.ok ? 2 : 1, 0, l.ts];
  };
  return [...items].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  }).slice(0, size);
}

/** Readiness across all lessons of a course (answers from every lesson count). */
export function courseReadiness(course: Course, h: History): Readiness {
  const ids = new Set(course.lessons.map((l) => l.id));
  const mapped: History = {
    exercises: h.exercises.filter((e) => ids.has(e.topic)).map((e) => ({ ...e, topic: course.id })),
    confidence: h.confidence.filter((c) => ids.has(c.topic) || c.topic === course.id).map((c) => ({ ...c, topic: course.id })),
  };
  const pack: Pack = { pack_id: course.id, subject: course.name, pack_version: "custom", content_hash: course.id, topics: [{ id: course.id, name: course.name }], exercises: [] };
  return readiness(pack, mapped, course.id);
}
