import "server-only";
import { createDb } from "@openlabel/db";
import { getConfig } from "../env";

type Connection = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { openlabelDb?: Connection };

/** One pooled connection per server process (survives dev hot reloads). */
export function getDb(): Connection {
  globalForDb.openlabelDb ??= createDb({ url: getConfig().DATABASE_URL });
  return globalForDb.openlabelDb;
}
