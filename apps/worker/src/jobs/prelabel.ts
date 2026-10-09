import {
  finishDocument,
  loadPrelabelTarget,
  markPrelabelling,
  predictedPages,
  storePagePrediction,
  storePrediction,
  type Database,
  type JobRow,
  type PrelabelTarget,
} from "@openlabel/db";
import { pageKey, type ObjectStore } from "@openlabel/storage";
import { minConfidence, pdfInfo, predictOcr, renderPdfPage, wordCount } from "../ocr/client.js";

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
  // A re-run may name one page and a turn a person chose (see queueReocr / reocrTurned).
  const options = {
    reocr: job.payload.reocr === true,
    page: typeof job.payload.page === "number" ? job.payload.page : undefined,
    rotate: typeof job.payload.rotate === "number" ? job.payload.rotate : undefined,
  };
  const target = await loadPrelabelTarget(deps.db, assetId);
  if (!target) {
    deps.log("asset gone, skipping", { assetId });
    return;
  }
  await markPrelabelling(deps.db, assetId);
  const object = await deps.store.get(target.storageKey);
  if (!object) throw new Error(`object missing in storage: ${target.storageKey}`);

  if (target.kind === "pdf") {
    await prelabelDocument(deps, target, object.body, options);
    return;
  }

  const started = Date.now();
  const page = await predictOcr(
    deps.ocrServiceUrl,
    {
      body: object.body,
      contentType: object.contentType,
      name: target.storageKey.split("/").pop() ?? "image",
    },
    assetId,
    undefined,
    options.rotate,
  );
  await storePrediction(deps.db, target, {
    engine: page.engine,
    engineVersion: page.engineVersion,
    result: page,
    minConf: minConfidence(page),
    latencyMs: page.meta.latencyMs ?? Date.now() - started,
    words: wordCount(page),
    width: page.width,
    height: page.height,
    rotation: page.rotationApplied,
    turnedByPerson: options.rotate !== undefined,
  });
  deps.log("prelabelled", {
    assetId,
    words: wordCount(page),
    ms: Date.now() - started,
    ...(options.reocr ? { reocr: true, rotate: options.rotate } : {}),
  });
}

/**
 * Every page of a PDF is rendered to an image (kept in storage for the editor and exports) and
 * read like a photo. On first reading, pages an earlier attempt already read are skipped so a
 * retry resumes; a re-run reads all pages again, or just the one it names.
 */
async function prelabelDocument(
  deps: PrelabelDeps,
  target: PrelabelTarget,
  pdf: Uint8Array,
  options: { reocr: boolean; page?: number | undefined; rotate?: number | undefined },
): Promise<void> {
  const started = Date.now();
  const { pages } = await pdfInfo(deps.ocrServiceUrl, pdf);
  const done = options.reocr ? new Set<number>() : await predictedPages(deps.db, target.id);
  let words = 0;
  for (let n = 1; n <= pages; n++) {
    if (done.has(n) || (options.page !== undefined && n !== options.page)) continue;
    const key = pageKey(target.storageKey, n);
    let image = (await deps.store.get(key))?.body;
    if (!image) {
      image = await renderPdfPage(deps.ocrServiceUrl, pdf, n);
      await deps.store.put(key, image, "image/jpeg");
    }
    const t = Date.now();
    const page = await predictOcr(
      deps.ocrServiceUrl,
      { body: image, contentType: "image/jpeg", name: `page${String(n)}.jpg` },
      target.id,
      undefined,
      options.rotate,
    );
    const result = { ...page, page: n };
    await storePagePrediction(deps.db, target, n, {
      engine: page.engine,
      engineVersion: page.engineVersion,
      result,
      minConf: minConfidence(page),
      latencyMs: page.meta.latencyMs ?? Date.now() - t,
      words: wordCount(page),
    });
    words += wordCount(page);
  }
  await finishDocument(deps.db, target, pages);
  deps.log("prelabelled document", { assetId: target.id, pages, words, ms: Date.now() - started });
}
