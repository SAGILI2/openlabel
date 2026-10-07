/**
 * OpenLabel worker: runs background jobs (pre-labelling, exports). Stateless, so throughput
 * scales by running more copies (ADR-0005).
 */
import { hostname } from "node:os";
import { loadConfig } from "@openlabel/contracts";
import { createDb, markExportFailed, markPrelabelFailed } from "@openlabel/db";
import { createStore } from "@openlabel/storage";
import { runExport } from "./jobs/export.js";
import { runPrelabel } from "./jobs/prelabel.js";
import { startRunner } from "./runner.js";

function log(msg: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), msg, ...fields })}\n`);
}

const cfg = loadConfig(process.env);
const conn = createDb({ url: cfg.DATABASE_URL, max: cfg.WORKER_CONCURRENCY + 2 });
const store = createStore(cfg);
const workerId = `${hostname()}:${String(process.pid)}`;

// One runner per job kind, so a long export never holds up pre-labelling.
const runners = [
  startRunner({
    db: conn.db,
    workerId,
    kind: "prelabel",
    concurrency: cfg.WORKER_CONCURRENCY,
    handler: (job) => runPrelabel({ db: conn.db, store, ocrServiceUrl: cfg.OCR_SERVICE_URL, log }, job),
    // Let people label it by hand.
    onGiveUp: async (job) => {
      if (typeof job.payload.assetId === "string") await markPrelabelFailed(conn.db, job.payload.assetId);
    },
    log,
  }),
  startRunner({
    db: conn.db,
    workerId,
    kind: "export",
    concurrency: 1,
    handler: (job) => runExport({ db: conn.db, store, log }, job),
    onGiveUp: async (job, error) => {
      if (typeof job.payload.exportId === "string")
        await markExportFailed(conn.db, job.payload.exportId, error);
    },
    log,
  }),
];
log("worker started", { workerId, concurrency: cfg.WORKER_CONCURRENCY, ocr: cfg.OCR_SERVICE_URL });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    log("stopping", { signal });
    void Promise.all(runners.map((r) => r.stop())).then(async () => {
      await conn.close();
      log("stopped");
    });
  });
}
