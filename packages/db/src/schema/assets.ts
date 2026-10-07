import { bigint, index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { folders } from "./folders.js";
import { organizations } from "./identity.js";
import { projects } from "./projects.js";

export const assetKind = pgEnum("asset_kind", ["image", "pdf", "audio", "video", "text"]);
export const assetStatus = pgEnum("asset_status", [
  "new",
  "prelabelling",
  "prelabelled",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
]);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Folder inside the project; null = project root. */
    folderId: uuid().references(() => folders.id, { onDelete: "set null" }),
    kind: assetKind().notNull(),
    /** Storage key of the original file; content-addressed by sha256. */
    storageKey: text().notNull(),
    sha256: text().notNull(),
    byteSize: bigint({ mode: "number" }).notNull(),
    mimeType: text().notNull(),
    originalName: text().notNull(),
    /** Width/height/duration/page count etc., by asset kind. */
    mediaMeta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: assetStatus().notNull().default("new"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("assets_project_sha_uq").on(t.projectId, t.sha256),
    index("assets_org_idx").on(t.orgId),
    index("assets_project_status_idx").on(t.projectId, t.status),
    index("assets_folder_idx").on(t.projectId, t.folderId),
  ],
);
