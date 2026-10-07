import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { annotations } from "./labelling.js";
import { assets } from "./assets.js";
import { id } from "./columns.js";
import { organizations, users } from "./identity.js";
import { projects } from "./projects.js";

export const exportStatus = pgEnum("export_status", ["queued", "running", "ready", "failed"]);
export const datasetSplit = pgEnum("dataset_split", ["train", "val", "test"]);

/**
 * A frozen dataset: which annotation version of which asset, in which split, exported in one
 * format. Items are pinned when the export is created, so later edits never change it.
 */
export const exports = pgTable(
  "exports",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Exporter id, e.g. `doctr-recognition`. */
    format: text().notNull(),
    /** `{ train, val, test }` percentages, seed and format options. */
    options: jsonb().$type<Record<string, unknown>>().notNull(),
    status: exportStatus().notNull().default("queued"),
    itemCount: integer().notNull().default(0),
    /** Per-split counts written by the exporter, e.g. `{ train: { assets: 8, words: 2100 } }`. */
    stats: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    storageKey: text(),
    byteSize: bigint({ mode: "number" }),
    error: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("exports_project_idx").on(t.projectId, t.createdAt)],
);

export const exportItems = pgTable(
  "export_items",
  {
    exportId: uuid()
      .notNull()
      .references(() => exports.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    annotationId: uuid()
      .notNull()
      .references(() => annotations.id, { onDelete: "restrict" }),
    split: datasetSplit().notNull(),
  },
  (t) => [primaryKey({ columns: [t.exportId, t.assetId] }), index("export_items_export_idx").on(t.exportId)],
);
