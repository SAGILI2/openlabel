import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema/index.js";

export interface DbOptions {
  url: string;
  /** Maximum pool size; keep low per process, scale with processes. */
  max?: number;
}

/** Creates a pooled, typed database client. Call `close()` on shutdown. */
export function createDb({ url, max = 10 }: DbOptions) {
  const sql = postgres(url, { max, prepare: true });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
    /** Lightweight liveness check used by health endpoints. */
    ping: async (): Promise<boolean> => {
      const rows = await sql`select 1 as ok`;
      return rows.length === 1;
    },
  };
}

export type Database = ReturnType<typeof createDb>["db"];
