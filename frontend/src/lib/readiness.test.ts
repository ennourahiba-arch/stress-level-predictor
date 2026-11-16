// Readiness follows the questions you answered yourself.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pickSession, readiness } from "./readiness";
import { translate } from "../i18n";
import type { History } from "./storage";
import type { Pack } from "./types";

const pack: Pack = JSON.parse(readFileSync(resolve(__dirname, "../../public/packs/calculus1.json"), "utf8"));
const empty: History = { exercises: [], confidence: [] };
const at = (id: string, ok: boolean, ts: number, mistake: string | null = null) =>
  ({ exerciseId: id, topic: "chain-rule", ts, attempts: ok ? 1 : 2, correct: ok, firstTry: ok, usedHint: false, mistake });

describe("readiness", () => {
  it("needs a few answers before giving a score", () => {
    expect(readiness(pack, { ...empty, exercises: [at("a", true, 1), at("b", true, 2)] }, "chain-rule").score).toBeNull();
  });
  it("flags overconfidence and names the recurring mistake", () => {
    const h: History = {
      exercises: [at("a", false, 3, "Forgot the inner derivative"), at("b", false, 2, "Forgot the inner derivative"), at("c", true, 1)],
      confidence: [{ topic: "chain-rule", ts: 0, rating: 5 }],
    };
    const r = readiness(pack, h, "chain-rule");
    expect(r.score).toBe(33);
    expect(translate("en", r.message!.key, r.message!.params)).toContain("missed 2 of your last 3");
    expect(translate("en", r.next.key, r.next.params)).toContain("forgot the inner derivative");
    expect(translate("fr", r.next.key, r.next.params)).not.toBe(translate("en", r.next.key, r.next.params));
  });
});

describe("pickSession", () => {
  it("serves unseen questions first, then previously wrong ones", () => {
    const qs = pack.exercises.filter((e) => e.topic === "chain-rule");
    const h: History = { ...empty, exercises: qs.slice(1).map((q, i) => at(q.id, i !== 0, i + 1)) };
    const s = pickSession(qs, h, 2);
    expect(s[0].id).toBe(qs[0].id);   // never seen
    expect(s[1].id).toBe(qs[1].id);   // seen and got wrong
  });
});
