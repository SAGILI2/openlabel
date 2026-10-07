import { boolean, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";

/** Organisation-level roles (architecture section 10.4). Per-project overrides live on project_members. */
export const orgRole = pgEnum("org_role", ["owner", "admin", "manager", "labeller", "reviewer", "viewer"]);

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text().notNull(),
    slug: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text().notNull(),
    name: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);
