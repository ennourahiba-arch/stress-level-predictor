// Local-only learning history in IndexedDB. Nothing here is sent to a server,
// and professors never see it.
import { isCurrentPack, type Course, type CustomPack, type TopicId } from "./types";

export interface Attempt {
  id?: number;
  roundId: string;
  topic: TopicId;
  ts: number;
  catchCorrect: boolean;
  fixCorrect: boolean | null;
  whyCorrect: boolean | null;
  points: number;
  maxPoints: number;
  mistakeLabel: string | null;
  mode?: "quick" | "home";
  catchAttempts?: number;
  hintsUsed?: number;
}

export interface ExerciseAttempt {
  id?: number;
  exerciseId: string;
  topic: TopicId;
  ts: number;
  attempts: number;
  correct: boolean;     // solved within the allowed attempts
  firstTry: boolean;    // solved on the first attempt
  usedHint: boolean;
  /** the mistake behind a wrong multiple-choice pick, when known */
  mistake?: string | null;
}

export interface Confidence {
  id?: number;
  topic: TopicId;
  ts: number;
  rating: 1 | 2 | 3 | 4 | 5;
}

type Store = "attempts" | "exercises" | "confidence";
const DB = "catch-the-ai";
const VERSION = 4;
const memory: Record<Store, unknown[]> & { kv: Record<string, unknown>; packs: Record<string, CustomPack>; courses: Record<string, Course> } = { attempts: [], exercises: [], confidence: [], kv: {}, packs: {}, courses: {} };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ["attempts", "exercises", "confidence"]) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("packs")) db.createObjectStore("packs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("courses")) db.createObjectStore("courses", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addTo<T extends { id?: number }>(store: Store, rec: T): Promise<void> {
  try {
    await tx(store, "readwrite", (s) => s.add(rec));
  } catch {
    memory[store].push({ ...rec, id: memory[store].length + 1 });
  }
}

async function listFrom<T extends { ts: number }>(store: Store): Promise<T[]> {
  let rows: T[];
  try {
    rows = await tx<T[]>(store, "readonly", (s) => s.getAll());
  } catch {
    rows = [...(memory[store] as T[])];
  }
  return rows.sort((a, b) => b.ts - a.ts);
}

export const addAttempt = (a: Attempt) => addTo("attempts", a);
export const listAttempts = () => listFrom<Attempt>("attempts");
export const addExerciseAttempt = (a: ExerciseAttempt) => addTo("exercises", a);
export const listExerciseAttempts = () => listFrom<ExerciseAttempt>("exercises");
export const addConfidence = (c: Confidence) => addTo("confidence", c);
export const listConfidence = () => listFrom<Confidence>("confidence");

export async function getKV<T>(key: string): Promise<T | undefined> {
  try {
    return (await tx<T>("kv", "readonly", (s) => s.get(key))) ?? undefined;
  } catch {
    return memory.kv[key] as T | undefined;
  }
}

export async function setKV(key: string, value: unknown): Promise<void> {
  try {
    await tx("kv", "readwrite", (s) => s.put(value, key));
  } catch {
    memory.kv[key] = value;
  }
}

export async function clearAll(): Promise<void> {
  try {
    for (const s of ["attempts", "exercises", "confidence", "kv", "packs", "courses"]) await tx(s, "readwrite", (st) => st.clear());
  } catch {
    memory.attempts = []; memory.exercises = []; memory.confidence = []; memory.kv = {}; memory.packs = {}; memory.courses = {};
  }
}

// ---- Packs generated from uploaded material (kept only on this device) ----
export async function savePack(p: CustomPack): Promise<void> {
  try { await tx("packs", "readwrite", (s) => s.put(p)); } catch { memory.packs[p.id] = p; }
}
export async function getPack(id: string): Promise<CustomPack | undefined> {
  try { return (await tx<CustomPack>("packs", "readonly", (s) => s.get(id))) ?? undefined; } catch { return memory.packs[id]; }
}
export async function listPacks(): Promise<CustomPack[]> {
  let all: CustomPack[];
  try { all = await tx<CustomPack[]>("packs", "readonly", (s) => s.getAll()); } catch { all = Object.values(memory.packs); }
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export async function deletePack(id: string): Promise<void> {
  try { await tx("packs", "readwrite", (s) => s.delete(id)); } catch { delete memory.packs[id]; }
}

export async function loadHistory() {
  const [exercises, confidence] = await Promise.all([listExerciseAttempts(), listConfidence()]);
  return { exercises, confidence };
}
export type History = Awaited<ReturnType<typeof loadHistory>>;

// ---- Courses (each with lessons, past exams and mock-exam results) ----
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export async function saveCourse(c: Course): Promise<void> {
  try { await tx("courses", "readwrite", (s) => s.put(c)); } catch { memory.courses[c.id] = c; }
}
export async function getCourse(id: string): Promise<Course | undefined> {
  try { return (await tx<Course>("courses", "readonly", (s) => s.get(id))) ?? undefined; } catch { return memory.courses[id]; }
}
export async function deleteCourse(id: string): Promise<void> {
  try { await tx("courses", "readwrite", (s) => s.delete(id)); } catch { delete memory.courses[id]; }
}
export async function listCourses(): Promise<Course[]> {
  await migrateOldPacks();
  let all: Course[];
  try { all = await tx<Course[]>("courses", "readonly", (s) => s.getAll()); } catch { all = Object.values(memory.courses); }
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

/** One-time move: each upload from the previous version becomes a course with one lesson.
 * Questions keep their ids, so practice history and readiness carry over. */
async function migrateOldPacks(): Promise<void> {
  let old: CustomPack[] = [];
  try { old = await tx<CustomPack[]>("packs", "readonly", (s) => s.getAll()); } catch { old = Object.values(memory.packs); }
  for (const p of old) {
    if (isCurrentPack(p)) {
      const lessonId = p.id; // keep the id so earlier answers still count toward this lesson
      await saveCourse({
        id: newId("c"), name: p.title, created_at: p.created_at, past_exams: null, exam_profile: p.exam_profile ?? null, mocks: [],
        lessons: [{ id: lessonId, title: p.title, created_at: p.created_at, sources: p.sources, passages: p.passages,
          banks: { [p.format]: { format: p.format, created_at: p.created_at, generator: p.generator, exercises: p.exercises, dropped: p.dropped, approved: p.approved ?? [] } } }],
      });
    }
    await deletePack(p.id);
  }
}
