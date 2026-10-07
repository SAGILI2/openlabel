import { describe, expect, it } from "vitest";
import { assignSplits, splitPlanSchema } from "../../../src/datasets/split.js";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `asset-${String(i).padStart(4, "0")}`);
const plan = (train: number, val: number, test: number, seed = "s") =>
  splitPlanSchema.parse({ train, val, test, seed });

function counts(m: Map<string, string>) {
  const c = { train: 0, val: 0, test: 0 } as Record<string, number>;
  for (const s of m.values()) c[s] = (c[s] ?? 0) + 1;
  return c;
}

describe("assignSplits", () => {
  it("follows the percentages exactly", () => {
    expect(counts(assignSplits(ids(100), plan(80, 10, 10)))).toEqual({ train: 80, val: 10, test: 10 });
    expect(counts(assignSplits(ids(7), plan(70, 15, 15)))).toEqual({ train: 5, val: 1, test: 1 });
  });

  it("assigns every asset exactly once", () => {
    const m = assignSplits(ids(53), plan(80, 10, 10));
    expect(m.size).toBe(53);
  });

  it("is deterministic and depends on the seed", () => {
    const a = assignSplits(ids(50), plan(80, 10, 10, "x"));
    const b = assignSplits([...ids(50)].reverse(), plan(80, 10, 10, "x"));
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    const c = assignSplits(ids(50), plan(80, 10, 10, "y"));
    expect([...a.entries()].sort()).not.toEqual([...c.entries()].sort());
  });

  it("gives small sets at least one val and one test asset", () => {
    expect(counts(assignSplits(ids(3), plan(80, 10, 10)))).toEqual({ train: 1, val: 1, test: 1 });
  });

  it("supports train-only and no-test plans", () => {
    expect(counts(assignSplits(ids(10), plan(100, 0, 0)))).toEqual({ train: 10, val: 0, test: 0 });
    expect(counts(assignSplits(ids(10), plan(90, 10, 0)))).toEqual({ train: 9, val: 1, test: 0 });
  });

  it("rejects plans that don't add up to 100", () => {
    expect(splitPlanSchema.safeParse({ train: 80, val: 10, test: 5 }).success).toBe(false);
  });
});
