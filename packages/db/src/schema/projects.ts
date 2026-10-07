import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { organizations } from "./identity.js";

/** Kind of data a project labels; each maps to a modality plugin. */
export const modality = pgEnum("modality", ["image", "document", "audio", "video", "text", "llm"]);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    slug: text().notNull(),
    description: text().notNull().default(""),
    modality: modality().notNull(),
    /** Task within the modality, e.g. `ocr`, `detection`, `transcription`, `sft`. */
    task: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("projects_org_slug_uq").on(t.orgId, t.slug), index("projects_org_idx").on(t.orgId)],
);
