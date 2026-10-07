import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns.js";
import { organizations, users } from "./identity.js";

/**
 * Append-only audit log (architecture section 10.10). Application code only ever inserts;
 * the migration revokes UPDATE and DELETE on this table from the application role.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    orgId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. `asset.uploaded`, `annotation.approved`. */
    action: text().notNull(),
    resourceType: text().notNull(),
    resourceId: text(),
    requestId: text(),
    ip: text(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_org_time_idx").on(t.orgId, t.occurredAt),
    index("audit_resource_idx").on(t.resourceType, t.resourceId),
  ],
);
