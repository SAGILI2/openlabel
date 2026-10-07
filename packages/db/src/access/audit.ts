import { desc, eq } from "drizzle-orm";
import { auditEvents, users } from "../schema/index.js";
import { requireRole, type OrgScope } from "./scope.js";

export interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  actorName: string | null;
  occurredAt: Date;
}

/** Most recent audit events of the scoped organisation. Managers and above. */
export async function listRecentAudit(scope: OrgScope, limit = 20): Promise<AuditRow[]> {
  requireRole(scope, "manager");
  return scope.db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      resourceType: auditEvents.resourceType,
      resourceId: auditEvents.resourceId,
      details: auditEvents.details,
      actorName: users.name,
      occurredAt: auditEvents.occurredAt,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(eq(auditEvents.orgId, scope.orgId))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}
