import "server-only";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { access, constants } from "node:fs/promises";
import type { Config } from "@openlabel/contracts";
import { createDb } from "@openlabel/db";

export type ComponentStatus = "ok" | "down";

export interface HealthReport {
  status: ComponentStatus;
  checks: {
    database: { status: ComponentStatus; latencyMs: number; error?: string };
    storage: { status: ComponentStatus; driver: Config["STORAGE_DRIVER"]; latencyMs: number; error?: string };
  };
  version: string;
}

const TIMEOUT_MS = 3000;

async function timed<T>(fn: () => Promise<T>): Promise<{ latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error(`timed out after ${TIMEOUT_MS} ms`));
        }, TIMEOUT_MS),
      ),
    ]);
    return { latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDatabase(cfg: Config) {
  const conn = createDb({ url: cfg.DATABASE_URL, max: 1 });
  try {
    return await timed(conn.ping);
  } finally {
    await conn.close();
  }
}

async function checkStorage(cfg: Config) {
  if (cfg.STORAGE_DRIVER === "local") {
    return timed(() => access(cfg.STORAGE_LOCAL_DIR, constants.W_OK));
  }
  const client = new S3Client({
    region: cfg.S3_REGION,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    ...(cfg.S3_ENDPOINT ? { endpoint: cfg.S3_ENDPOINT } : {}),
    credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID ?? "", secretAccessKey: cfg.S3_SECRET_ACCESS_KEY ?? "" },
  });
  try {
    return await timed(() => client.send(new HeadBucketCommand({ Bucket: cfg.S3_BUCKET })));
  } finally {
    client.destroy();
  }
}

/** Checks every dependency the app needs. Never throws; failures are reported per component. */
export async function checkHealth(cfg: Config, version: string): Promise<HealthReport> {
  const [db, storage] = await Promise.all([checkDatabase(cfg), checkStorage(cfg)]);
  const database = { status: db.error ? "down" : "ok", ...db } as const;
  const store = { status: storage.error ? "down" : "ok", driver: cfg.STORAGE_DRIVER, ...storage } as const;
  return {
    status: database.status === "ok" && store.status === "ok" ? "ok" : "down",
    checks: { database, storage: store },
    version,
  };
}
