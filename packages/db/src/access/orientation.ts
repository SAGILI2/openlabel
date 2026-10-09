import { and, eq, sql } from "drizzle-orm";
import { assets, predictions } from "../schema/index.js";
import { AccessError } from "./errors.js";
import type { OrgScope } from "./scope.js";

/** How well the page-orientation model did on one project, per model. */
export interface OrientationStats {
  model: string;
  /** Pages the model was asked about (not read straight on the first try). */
  judged: number;
  /** Model's guess matched what was finally used. */
  correct: number;
  /** Confidence comparison overrode the model (usually upside down vs. upright). */
  corrected: number;
  /** Pages a person turned by hand: the automatic choice was wrong (the model's guess is still scored). */
  turnedByPeople: number;
  /** Accuracy by the model's own stated confidence, to see whether its confidence means anything. */
  byConfidence: { band: string; judged: number; correct: number }[];
  /** Turns applied: how many pages needed 0/90/180/270. */
  applied: Record<string, number>;
  /** Pages read straight without asking the model (fast path). */
  straight: number;
}

/**
 * Orientation accuracy from the decision recorded with each page's latest OCR result. The final
 * answer is what a person settled on when they turned the page by hand, else what was applied.
 */
export async function orientationStats(scope: OrgScope, projectId: string): Promise<OrientationStats[]> {
  const [project] = await scope.db
    .select({ id: assets.projectId })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.orgId, scope.orgId)))
    .limit(1);
  if (!project) {
    // An empty project has nothing to report; a project in another org is not found.
    const rows = await scope.db.execute(
      sql`select 1 from projects where id = ${projectId} and org_id = ${scope.orgId}`,
    );
    if (rows.length === 0) throw new AccessError("NOT_FOUND", "Project not found.");
    return [];
  }
  const rows = await scope.db.execute<{
    model: string | null;
    method: string;
    predicted: number | null;
    pconf: number | null;
    applied: number;
    human: number | null;
  }>(sql`
    select distinct on (p.asset_id, p.page)
      p.result->'meta'->'orientation'->>'model' as model,
      p.result->'meta'->'orientation'->>'method' as method,
      (p.result->'meta'->'orientation'->>'predicted')::int as predicted,
      (p.result->'meta'->'orientation'->>'predictedConf')::float as pconf,
      coalesce((p.result->'meta'->'orientation'->>'applied')::int, 0) as applied,
      (a.media_meta->'rotationByPerson'->>(p.page::text))::int as human
    from ${predictions} p
    join ${assets} a on a.id = p.asset_id
    where a.project_id = ${projectId} and a.org_id = ${scope.orgId}
      and p.result->'meta' ? 'orientation'
    order by p.asset_id, p.page, p.created_at desc`);

  const byModel = new Map<string, OrientationStats>();
  const bands = [
    ["< 50%", 0, 0.5],
    ["50–70%", 0.5, 0.7],
    ["70–90%", 0.7, 0.9],
    ["≥ 90%", 0.9, 1.01],
  ] as const;
  for (const r of rows) {
    const model = r.model ?? "none";
    let s = byModel.get(model);
    if (!s) {
      s = {
        model,
        judged: 0,
        correct: 0,
        corrected: 0,
        turnedByPeople: 0,
        byConfidence: bands.map(([band]) => ({ band, judged: 0, correct: 0 })),
        applied: {},
        straight: 0,
      };
      byModel.set(model, s);
    }
    const truth = r.human ?? r.applied;
    s.applied[String(truth)] = (s.applied[String(truth)] ?? 0) + 1;
    if (r.method === "manual" || (r.human !== null && r.human !== r.applied)) s.turnedByPeople++;
    if (r.predicted === null) {
      s.straight++;
      continue;
    }
    // A page a person turned is read their way; the model's guess is still scored against them.
    s.judged++;
    const ok = r.predicted === truth;
    if (ok) s.correct++;
    if (r.method === "model+confidence") s.corrected++;
    const i = bands.findIndex(([, lo, hi]) => (r.pconf ?? 0) >= lo && (r.pconf ?? 0) < hi);
    const b = s.byConfidence[i];
    if (b) {
      b.judged++;
      if (ok) b.correct++;
    }
  }
  return [...byModel.values()];
}
