// Client for the Rehearsal server (backend/). Set VITE_API_URL in Vercel.
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

export interface QuizOption { text: string; latex: string }
export interface SolutionStep { text: string; latex?: string; quote?: string; source?: string }
export interface QuestionResult {
  correct: number; solution: SolutionStep[]; answered: number; min_teams: number; locked: boolean;
  counts?: number[]; pct_correct?: number; top_wrong?: { option: number; count: number; label: string | null };
}
export interface QuizSummary {
  teams: number; min_teams: number; locked: boolean; total: number; sample?: boolean;
  questions?: { index: number; prompt: string; answered: number; pct_correct: number | null; top_wrong: QuestionResult["top_wrong"] | null }[];
  scoreboard?: { name: string; score: number }[];
  insights?: { key: string; params?: Record<string, string | number> }[];
}
export interface RoomState {
  code: string; title: string; status: "lobby" | "question" | "reveal" | "finished";
  mode?: "class" | "duel"; reveal_until?: number | null;
  players?: { name: string; score: number; is_you: boolean; answered: boolean; was_right: boolean | null }[];
  point_to?: string | null; winner?: string | null;
  q_index: number; total: number; per_q_s: number; deadline_ms: number | null; server_now_ms: number; version: number;
  team_count: number; role: "host" | "team" | "viewer";
  question?: { index: number; total: number; prompt: string; latex: string; options: QuizOption[] };
  answered_count?: number;
  result?: QuestionResult;
  teams?: { name: string; answered: boolean }[];
  summary?: QuizSummary;
  you?: { name: string; score: number; answer: number | null; was_right?: boolean | null; history?: { index: number; was_right: boolean }[] };
}
export interface QuizQuestionIn {
  id: string; prompt: string; latex?: string; options: QuizOption[]; correct: number; labels: (string | null)[]; solution: SolutionStep[];
}

export type Auth = { host?: string; team?: string };

async function call<T>(path: string, init: { method?: string; body?: unknown; auth?: Auth; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const code = accessCode.get();
  if (code) headers["X-Access-Code"] = code;
  if (init.auth?.host) headers["X-Host-Token"] = init.auth.host;
  if (init.auth?.team) headers["X-Team-Token"] = init.auth.team;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
  } catch {
    throw new ApiError(
      "Can't reach the Rehearsal server. If it has been idle it may be waking up, which takes up to a minute. Try again shortly.",
      0,
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d
      : Array.isArray(d) && d[0]?.msg ? String(d[0].msg).replace(/^Value error, /, "")
      : `The server returned an error (HTTP ${res.status}).`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export interface AIStatus { enabled: boolean; provider: string | null; model: string | null; test_mode: boolean; access_code_required: boolean; max_files: number }
export interface Passage { id: string; file: string; text: string }
export interface ExtractResult { documents: { file: string; chars: number }[]; passages?: Passage[]; text?: string; truncated: boolean }
export interface ChatMsg { role: "examiner" | "student"; text: string }

export const accessCode = {
  get(): string { try { return localStorage.getItem("cta:access") ?? ""; } catch { return ""; } },
  set(v: string) { try { localStorage.setItem("cta:access", v); } catch { /* ignore */ } },
};

export const api = {
  aiStatus: () => call<AIStatus>("/api/ai/status"),
  extract: (files: File[], kind: "material" | "past") => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("kind", kind);
    return call<ExtractResult>("/api/material/extract", { method: "POST", form });
  },
  generate: (format: string, passages: Passage[], past_exams: string, count: number) =>
    call<import("./types").CustomPack>("/api/generate", { method: "POST", body: { format, passages, past_exams, count } }),
  grade: (body: { question: string; key_points: string[]; model_answer: string; sources: string[]; answer: string; final_answer?: string }) =>
    call<{ verdict: "correct" | "partial" | "incorrect"; covered: number[]; feedback: string }>("/api/grade", { method: "POST", body }),
  examiner: (question: { question: string; key_points: string[]; model_answer: string; quote: string }, history: ChatMsg[]) =>
    call<{ reply: string; closed: boolean; score: number | null }>("/api/oral/examiner", { method: "POST", body: { question, history } }),
  mockExam: (body: { passages: Passage[]; past_exams: string; parts: Partial<Record<string, number>> }) =>
    call<import("./types").CustomPack>("/api/mock-exam", { method: "POST", body }),
  // live class quiz
  createQuiz: (body: { title?: string; exercise_ids?: string[]; questions?: QuizQuestionIn[]; seconds_per_question: number; lang?: string }) =>
    call<{ code: string; host_token: string }>("/api/rooms", { method: "POST", body }),
  createDuel: (body: { title?: string; player_name: string; exercise_ids?: string[]; questions?: QuizQuestionIn[]; seconds_per_question: number; lang?: string }) =>
    call<{ code: string; host_token: string; team_token: string; team_name: string }>("/api/rooms", { method: "POST", body: { ...body, mode: "duel" } }),
  join: (code: string, team_name: string) =>
    call<{ team_token: string; team_name: string; code: string }>(`/api/rooms/${code}/join`, { method: "POST", body: { team_name } }),
  state: (code: string, auth: Auth) => call<RoomState>(`/api/rooms/${code}/state`, { auth }),
  start: (code: string, host: string) => call<RoomState>(`/api/rooms/${code}/start`, { method: "POST", auth: { host } }),
  next: (code: string, host: string) => call<RoomState>(`/api/rooms/${code}/next`, { method: "POST", auth: { host } }),
  answer: (code: string, team: string, q_index: number, choice: number) =>
    call<RoomState>(`/api/rooms/${code}/answer`, { method: "POST", body: { q_index, choice }, auth: { team } }),
  sample: (code: string, host: string) => call<QuizSummary>(`/api/rooms/${code}/sample`, { auth: { host } }),
};

export const wsUrl = (code: string) => `${API_URL.replace(/^http/, "ws")}/api/rooms/${code}/ws`;

// Ephemeral room tokens: kept so a refresh on the same phone keeps your team.
const key = (role: "host" | "team", code: string) => `cta:${role}:${code}`;
export const tokens = {
  get(role: "host" | "team", code: string): { token: string; name?: string } | null {
    try { return JSON.parse(localStorage.getItem(key(role, code)) || "null"); } catch { return null; }
  },
  set(role: "host" | "team", code: string, v: { token: string; name?: string }) {
    try { localStorage.setItem(key(role, code), JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
  clear(role: "host" | "team", code: string) {
    try { localStorage.removeItem(key(role, code)); } catch { /* ignore */ }
  },
};
