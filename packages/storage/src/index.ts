/** @openlabel/storage — object storage adapters (local disk, S3-compatible). */
import type { Config } from "@openlabel/contracts";
import { LocalStore } from "./local.js";
import { S3Store } from "./s3.js";
import type { ObjectStore } from "./store.js";

export { assetKey, assertSafeKey, exportKey, type ObjectStore } from "./store.js";
export { LocalStore } from "./local.js";
export { S3Store, type S3StoreOptions } from "./s3.js";

/** The store selected by configuration (STORAGE_DRIVER). */
export function createStore(cfg: Config): ObjectStore {
  if (cfg.STORAGE_DRIVER === "local") return new LocalStore(cfg.STORAGE_LOCAL_DIR);
  return new S3Store({
    bucket: cfg.S3_BUCKET,
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT,
    accessKeyId: cfg.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: cfg.S3_SECRET_ACCESS_KEY ?? "",
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
  });
}
