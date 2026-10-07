import { and, eq } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { sessions } from "../schema/index.js";
import { resolveOrgScope } from "./scope.js";

/** Switches a session's active organisation after checking the user is a member of it. */
export async function setActiveOrganization(
  db: Database,
  user: { id: string },
  sessionToken: string,
  orgId: string | null,
): Promise<void> {
  if (orgId !== null) await resolveOrgScope(db, user.id, orgId);
  await db
    .update(sessions)
    .set({ activeOrgId: orgId })
    .where(and(eq(sessions.token, sessionToken), eq(sessions.userId, user.id)));
}
