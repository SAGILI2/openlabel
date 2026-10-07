import { eq } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { assets, predictions } from "../schema/index.js";

/**
 * Worker-side operations for pre-labelling. Workers act for the system, not a user, so these
 * take the asset id from a queued job (which was created inside an org scope) and re-read the
 * asset's own `orgId` rather than trusting the payload.
 */

export interface PrelabelTarget {
  id: string;
  orgId: string;
  storageKey: string;
  mimeType: string;
}

export async function loadPrelabelTarget(db: Database, assetId: string): Promise<PrelabelTarget | null> {
  const [row] = await db
    .select({ id: assets.id, orgId: assets.orgId, storageKey: assets.storageKey, mimeType: assets.mimeType })
    .from(assets)
    .where(eq(assets.id, assetId));
  return row ?? null;
}

export async function markPrelabelling(db: Database, assetId: string): Promise<void> {
  await db.update(assets).set({ status: "prelabelling" }).where(eq(assets.id, assetId));
}

/** Stores the model's result and moves a still-untouched asset to `prelabelled`. */
export async function storePrediction(
  db: Database,
  target: PrelabelTarget,
  prediction: {
    engine: string;
    engineVersion: string;
    result: Record<string, unknown>;
    minConf: number | null;
    latencyMs: number;
    width?: number;
    height?: number;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(predictions).values({
      orgId: target.orgId,
      assetId: target.id,
      engine: prediction.engine,
      engineVersion: prediction.engineVersion,
      result: prediction.result,
      minConf: prediction.minConf,
      latencyMs: prediction.latencyMs,
    });
    const [asset] = await tx
      .select({ status: assets.status, mediaMeta: assets.mediaMeta })
      .from(assets)
      .where(eq(assets.id, target.id));
    if (asset && (asset.status === "new" || asset.status === "prelabelling")) {
      await tx
        .update(assets)
        .set({
          status: "prelabelled",
          mediaMeta: {
            ...asset.mediaMeta,
            ...(prediction.width ? { width: prediction.width } : {}),
            ...(prediction.height ? { height: prediction.height } : {}),
          },
        })
        .where(eq(assets.id, target.id));
    }
  });
}

/** Puts an asset whose pre-labelling permanently failed back to `new` so people can still label it. */
export async function markPrelabelFailed(db: Database, assetId: string): Promise<void> {
  await db.update(assets).set({ status: "new" }).where(eq(assets.id, assetId));
}
