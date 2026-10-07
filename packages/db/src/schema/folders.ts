import { type AnyPgColumn, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { organizations } from "./identity.js";
import { projects } from "./projects.js";

/**
 * Folders inside a project, any depth. `path` is the full slash-separated path from the project
 * root (e.g. `2026-07/CA`), kept in sync with the tree so a whole subtree can be listed with one
 * prefix query. Names are unique among siblings.
 */
export const folders = pgTable(
  "folders",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
    name: text().notNull(),
    path: text().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("folders_project_path_uq").on(t.projectId, t.path),
    index("folders_parent_idx").on(t.parentId),
  ],
);
