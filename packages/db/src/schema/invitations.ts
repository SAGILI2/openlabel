import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns.js";
import { organizations, orgRole, users } from "./identity.js";

/**
 * Invitations to join an organisation. Only a SHA-256 hash of the token is stored, so a
 * database leak doesn't expose usable invite links.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Stored lower-cased; must match the accepting user's email. */
    email: text().notNull(),
    role: orgRole().notNull(),
    tokenHash: text().notNull(),
    invitedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_hash_uq").on(t.tokenHash),
    index("invitations_org_idx").on(t.orgId),
    index("invitations_email_idx").on(t.email),
  ],
);
