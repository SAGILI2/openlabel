import {
  loadPrelabelTarget,
  markPrelabelling,
  storePrediction,
  type Database,
  type JobRow,
} from "@openlabel/db";
import type { ObjectStore } from "@openlabel/storage";
import { minConfidence, predictOcr } from "../ocr/client.js";

export interface PrelabelDeps {
  db: Database;
  store: ObjectStore;
  ocrServiceUrl: string;
  log: (msg: string, fields?: Record<string, unknown>) => void;
}

/** Runs OCR on one asset and stores the result as a prediction. Throws to trigger a retry. */
export async function runPrelabel(deps: PrelabelDeps, job: JobRow): Promise<void> {
  const assetId = typeof job.payload.assetId === "string" ? job.payload.assetId : null;
  if (!assetId) throw new Error("prelabel job without assetId");
  const target = await loadPrelabelTarget(deps.db, assetId);
  if (!target) {
    deps.log("asset gone, skipping", { assetId });
    return;
  }
  await markPrelabelling(deps.db, assetId);
  const object = await deps.store.get(target.storageKey);
  if (!object) throw new Error(`object missing in storage: ${target.storageKey}`);

  const started = Date.now();
  const page = await predictOcr(
    deps.ocrServiceUrl,
    {
      body: object.body,
      contentType: object.contentType,
      name: target.storageKey.split("/").pop() ?? "image",
    },
    assetId,
  );
  await storePrediction(deps.db, target, {
    engine: page.engine,
    engineVersion: page.engineVersion,
    result: page,
    minConf: minConfidence(page),
    latencyMs: page.meta.latencyMs ?? Date.now() - started,
    width: page.width,
    height: page.height,
  });
  deps.log("prelabelled", {
    assetId,
    words: page.lines.reduce((n, l) => n + l.words.length, 0),
    ms: Date.now() - started,
  });
}
