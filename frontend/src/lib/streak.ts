// Daily streak: a day counts when you answer at least DAILY_GOAL questions (one practice session),
// anywhere in the app. Computed from local history only.
import type { ExerciseAttempt } from "./storage";

export const DAILY_GOAL = 5;

/** Local calendar day, e.g. "2026-11-16". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days, 12).getTime()); // noon avoids daylight-saving edge cases
}

export interface Streak {
  current: number;       // consecutive goal days up to today (or yesterday, if today isn't done yet)
  best: number;
  today: number;         // questions answered today
  metToday: boolean;
  atRisk: boolean;       // a streak is running but today's goal isn't met yet
  week: { key: string; label: string; count: number; met: boolean; isToday: boolean }[];
}

export function streakInfo(attempts: Pick<ExerciseAttempt, "ts">[], now = Date.now()): Streak {
  const counts = new Map<string, number>();
  for (const a of attempts) counts.set(dayKey(a.ts), (counts.get(dayKey(a.ts)) ?? 0) + 1);
  const met = (k: string) => (counts.get(k) ?? 0) >= DAILY_GOAL;
  const today = dayKey(now);

  let current = 0;
  for (let k = met(today) ? today : shiftDay(today, -1); met(k); k = shiftDay(k, -1)) current++;

  let best = 0;
  for (const k of [...counts.keys()].filter(met)) {
    if (met(shiftDay(k, -1))) continue; // only count from the start of each run
    let run = 0;
    for (let d = k; met(d); d = shiftDay(d, 1)) run++;
    best = Math.max(best, run);
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDay(today, i - 6);
    const [y, m, d] = key.split("-").map(Number);
    return { key, label: new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { weekday: "narrow" }),
      count: counts.get(key) ?? 0, met: met(key), isToday: key === today };
  });

  return { current, best: Math.max(best, current), today: counts.get(today) ?? 0, metToday: met(today), atRisk: current > 0 && !met(today), week };
}
