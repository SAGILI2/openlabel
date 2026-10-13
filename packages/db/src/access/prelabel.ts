import { and, desc, eq, inArray } from "drizzle-orm";
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
  kind: string;
  storageKey: string;
  mimeType: string;
}

/** One page of a multi-page document as the OCR saw it (upright size and the turn applied). */
export interface PageMeta {
  width: number;
  height: number;
  rotation: number;
}

export async function loadPrelabelTarget(db: Database, assetId: string): Promise<PrelabelTarget | null> {
  const [row] = await db
    .select({
      id: assets.id,
      orgId: assets.orgId,
      kind: assets.kind,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
    })
    .from(assets)
    .where(eq(assets.id, assetId));
  return row ?? null;
}

/**
 * Shows the file as being read. Only files nobody has labelled yet change status; a labelled file
 * keeps its place in review while a fresh OCR draft is made.
 */
export async function markPrelabelling(db: Database, assetId: string): Promise<void> {
  await db
    .update(assets)
    .set({ status: "prelabelling" })
    .where(and(eq(assets.id, assetId), inArray(assets.status, ["new", "prelabelled"])));
}

/** Pages of a document that already have a prediction (a retried job skips them). */
export async function predictedPages(db: Database, assetId: string): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ page: predictions.page })
    .from(predictions)
    .where(eq(predictions.assetId, assetId));
  return new Set(rows.map((r) => r.page));
}

/** Stores one page's prediction of a multi-page document. The asset is finished separately. */
export async function storePagePrediction(
  db: Database,
  target: PrelabelTarget,
  page: number,
  prediction: {
    engine: string;
    engineVersion: string;
    result: Record<string, unknown>;
    minConf: number | null;
    latencyMs: number;
    words: number;
  },
): Promise<void> {
  await db.insert(predictions).values({
    words: prediction.words,
    orgId: target.orgId,
    assetId: target.id,
    page,
    engine: prediction.engine,
    engineVersion: prediction.engineVersion,
    result: prediction.result,
    minConf: prediction.minConf,
    latencyMs: prediction.latencyMs,
  });
}

/**
 * Records a document's pages once all are read (size and turn of each, from its latest
 * prediction) and moves a still-untouched asset to `prelabelled`. Page 1's size and turn also go
 * in the top-level fields that thumbnails and single-page code use.
 */
export async function finishDocument(db: Database, target: PrelabelTarget, pageCount: number): Promise<void> {
  const rows = await db
    .selectDistinctOn([predictions.page], { page: predictions.page, result: predictions.result })
    .from(predictions)
    .where(eq(predictions.assetId, target.id))
    .orderBy(predictions.page, desc(predictions.createdAt));
  const byPage = new Map(rows.map((r) => [r.page, r.result]));
  const pages: PageMeta[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const r = byPage.get(n) ?? {};
    pages.push({
      width: typeof r.width === "number" ? r.width : 0,
      height: typeof r.height === "number" ? r.height : 0,
      rotation: typeof r.rotationApplied === "number" ? r.rotationApplied : 0,
    });
  }
  await finishRenderedDocument(db, target, pageCount, pages);
}

/** Records rendered PDF pages for tasks that display documents without running OCR. */
export async function finishRenderedDocument(
  db: Database,
  target: PrelabelTarget,
  pageCount: number,
  pages: PageMeta[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const [asset] = await tx
      .select({ status: assets.status, mediaMeta: assets.mediaMeta })
      .from(assets)
      .where(eq(assets.id, target.id));
    if (!asset) return;
    const first = pages[0];
    await tx
      .update(assets)
      .set({
        ...(asset.status === "new" || asset.status === "prelabelling"
          ? { status: "prelabelled" as const }
          : {}),
        mediaMeta: {
          ...asset.mediaMeta,
          pageCount,
          pages,
          ...(first ? { width: first.width, height: first.height, rotation: first.rotation } : {}),
        },
      })
      .where(eq(assets.id, target.id));
  });
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
    words: number;
    width?: number;
    height?: number;
    /** Degrees counter-clockwise the page was turned to read it upright (0 = as uploaded). */
    rotation?: number;
    /**
     * A person chose the turn: apply the new size and turn even if the file is already labelled
     * (the editor turned their saved boxes to match before asking).
     */
    turnedByPerson?: boolean;
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
      words: prediction.words,
    });
    const [asset] = await tx
      .select({ status: assets.status, mediaMeta: assets.mediaMeta })
      .from(assets)
      .where(eq(assets.id, target.id));
    const untouched =
      asset && (asset.status === "new" || asset.status === "prelabelling" || asset.status === "prelabelled");
    if (asset && (untouched || prediction.turnedByPerson)) {
      await tx
        .update(assets)
        .set({
          ...(untouched ? { status: "prelabelled" as const } : {}),
          mediaMeta: {
            ...asset.mediaMeta,
            ...(prediction.width ? { width: prediction.width } : {}),
            ...(prediction.height ? { height: prediction.height } : {}),
            rotation: prediction.rotation ?? 0,
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

/** What a re-run of OCR should do differently, carried in the job payload. */
export interface ReocrOptions {
  /** Only this page of a document (from 1); all pages when absent. */
  page?: number | undefined;
  /** Read the page turned this far (degrees counter-clockwise) instead of auto-rotating. */
  rotate?: number | undefined;
}
