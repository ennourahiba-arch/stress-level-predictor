import { describe, expect, it } from "vitest";
import { DAILY_GOAL, streakInfo } from "./streak";

const day = (offset: number, hour = 14) => { const d = new Date(2026, 10, 16 + offset, hour); return d.getTime(); };
const answers = (offset: number, n = DAILY_GOAL, hour = 14) => Array.from({ length: n }, () => ({ ts: day(offset, hour) }));
const NOW = day(0, 18);

describe("daily streak", () => {
  it("counts consecutive goal days ending today", () => {
    const s = streakInfo([...answers(-2), ...answers(-1), ...answers(0)], NOW);
    expect(s.current).toBe(3);
    expect(s.metToday).toBe(true);
    expect(s.atRisk).toBe(false);
  });
  it("keeps yesterday's streak alive until today ends, and says it's at risk", () => {
    const s = streakInfo([...answers(-2), ...answers(-1), ...answers(0, 2)], NOW);
    expect(s.current).toBe(2);
    expect(s.today).toBe(2);
    expect(s.atRisk).toBe(true);
  });
  it("breaks on a missed day, but remembers the best run", () => {
    const s = streakInfo([...answers(-6), ...answers(-5), ...answers(-4), ...answers(-1)], NOW);
    expect(s.current).toBe(1);
    expect(s.best).toBe(3);
  });
  it("a day with fewer answers than the goal doesn't count", () => {
    expect(streakInfo([...answers(-1, DAILY_GOAL - 1)], NOW).current).toBe(0);
  });
  it("answers late at night count for that day, not the next", () => {
    const s = streakInfo([...answers(-1, DAILY_GOAL, 23)], day(0, 0) + 30 * 60_000);
    expect(s.current).toBe(1);
    expect(s.week[5].met).toBe(true);
  });
  it("shows the last 7 days with today last", () => {
    const s = streakInfo(answers(0), NOW);
    expect(s.week).toHaveLength(7);
    expect(s.week[6].isToday).toBe(true);
  });
});
