/**
 * OpenLabel worker: runs background jobs (pre-labelling first). Stateless, so throughput
 * scales by running more copies (ADR-0005).
 */
import { hostname } from "node:os";
import { loadConfig } from "@openlabel/contracts";
import { createDb } from "@openlabel/db";
import { createStore } from "@openlabel/storage";
import { runPrelabel } from "./jobs/prelabel.js";
import { startRunner } from "./runner.js";

function log(msg: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), msg, ...fields })}\n`);
}

const cfg = loadConfig(process.env);
const conn = createDb({ url: cfg.DATABASE_URL, max: cfg.WORKER_CONCURRENCY + 2 });
const store = createStore(cfg);
const workerId = `${hostname()}:${String(process.pid)}`;

const runner = startRunner({
  db: conn.db,
  workerId,
  kind: "prelabel",
  concurrency: cfg.WORKER_CONCURRENCY,
  handler: (job) => runPrelabel({ db: conn.db, store, ocrServiceUrl: cfg.OCR_SERVICE_URL, log }, job),
  log,
});
log("worker started", { workerId, concurrency: cfg.WORKER_CONCURRENCY, ocr: cfg.OCR_SERVICE_URL });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    log("stopping", { signal });
    void runner.stop().then(async () => {
      await conn.close();
      log("stopped");
    });
  });
}
