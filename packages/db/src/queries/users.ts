import { sql } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { users } from "../schema/index.js";

/** Number of user accounts; used to let the first user register when sign-up is closed. */
export async function countUsers(db: Database): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return row?.n ?? 0;
}
