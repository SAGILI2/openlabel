import { z } from "zod";

export const SPLITS = ["train", "val", "test"] as const;
export type Split = (typeof SPLITS)[number];

/** Percentages per split; must add up to 100. */
export const splitPlanSchema = z
  .object({
    train: z.number().int().min(0).max(100),
    val: z.number().int().min(0).max(100),
    test: z.number().int().min(0).max(100),
    seed: z.string().min(1).max(64).default("openlabel"),
  })
  .refine((p) => p.train + p.val + p.test === 100, { message: "train + val + test must be 100" })
  .refine((p) => p.train > 0, { message: "train needs at least 1%" });

export type SplitPlan = z.infer<typeof splitPlanSchema>;

/** FNV-1a 32-bit: small, fast, stable across runtimes; good enough to shuffle ids. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Assigns whole assets (never individual regions) to splits. Deterministic: the same ids, plan
 * and seed always give the same result, and an asset keeps its split as others are added,
 * because each asset's position depends only on its own id and the seed.
 *
 * Counts follow the percentages exactly (largest-remainder rounding); with at least 3 assets
 * and non-zero val/test percentages, val and test each get at least one asset.
 */
export function assignSplits(assetIds: readonly string[], plan: SplitPlan): Map<string, Split> {
  const ordered = [...new Set(assetIds)].sort(
    (a, b) => fnv1a(`${plan.seed}:${a}`) - fnv1a(`${plan.seed}:${b}`) || a.localeCompare(b),
  );
  const n = ordered.length;
  const raw = SPLITS.map((s) => (plan[s] / 100) * n);
  const counts = raw.map(Math.floor);
  let left = n - counts.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRemainder) {
    if (left === 0) break;
    counts[i] = (counts[i] ?? 0) + 1;
    left -= 1;
  }
  // Small sets: make sure every requested evaluation split has something in it.
  if (n >= 3) {
    for (const i of [1, 2]) {
      const s = SPLITS[i];
      if (s && plan[s] > 0 && counts[i] === 0 && (counts[0] ?? 0) > 1) {
        counts[i] = 1;
        counts[0] = (counts[0] ?? 0) - 1;
      }
    }
  }

  const result = new Map<string, Split>();
  let cursor = 0;
  SPLITS.forEach((s, i) => {
    for (let k = 0; k < (counts[i] ?? 0); k++) {
      const id = ordered[cursor++];
      if (id) result.set(id, s);
    }
  });
  return result;
}
