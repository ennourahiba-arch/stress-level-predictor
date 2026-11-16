import { describe, expect, it } from "vitest";
import { gradeBlank, gradeMatch, gradeMulti, normaliseAnswer, shuffled } from "./grading";

describe("multiple response", () => {
  it("full marks only for the exact set", () => {
    expect(gradeMulti([0, 2], [0, 2]).exact).toBe(true);
    expect(gradeMulti([2, 0], [0, 2]).fraction).toBe(1);
  });
  it("partial credit, with wrong picks cancelling right ones", () => {
    expect(gradeMulti([0], [0, 2]).fraction).toBe(0.5);
    expect(gradeMulti([0, 1], [0, 2]).fraction).toBe(0);
    expect(gradeMulti([0, 1, 3], [0, 2]).fraction).toBe(0);
    expect(gradeMulti([0, 1, 2, 3], [0, 2]).exact).toBe(false); // selecting everything isn't a strategy
  });
});

describe("fill in the blank", () => {
  it("ignores case, articles, punctuation and spacing", () => {
    expect(gradeBlank("  The Scheduler. ", ["scheduler"])).toBe(true);
    expect(gradeBlank("CPU  scheduler", ["process scheduler", "CPU scheduler"])).toBe(true);
    expect(gradeBlank("l'ordonnanceur", ["ordonnanceur"])).toBe(true);
  });
  it("doesn't accept a different term or an empty answer", () => {
    expect(gradeBlank("dispatcher", ["scheduler"])).toBe(false);
    expect(gradeBlank("   ", ["scheduler"])).toBe(false);
    expect(normaliseAnswer("“Quantum”")).toBe("quantum");
    expect(normaliseAnswer("« le quantum »")).toBe("quantum");
  });
});

describe("matching", () => {
  const pairs = [{ left: "A", right: "1" }, { left: "B", right: "2" }, { left: "C", right: "3" }];
  it("counts correct pairs", () => {
    expect(gradeMatch(["1", "2", "3"], pairs).exact).toBe(true);
    expect(gradeMatch(["1", "3", "2"], pairs).right).toBe(1);
    expect(gradeMatch([null, "2", null], pairs).fraction).toBeCloseTo(1 / 3);
  });
  it("shuffles deterministically", () => {
    expect(shuffled([1, 2, 3, 4, 5], "q1")).toEqual(shuffled([1, 2, 3, 4, 5], "q1"));
    expect(shuffled([1, 2, 3, 4, 5], "q1").sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
