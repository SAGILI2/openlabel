import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { organizations } from "./identity.js";

/** Kind of data a project labels. Must match MODALITIES in @openlabel/contracts. */
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
    /**
     * Task-type plugin id, `<modality>.<task>` (e.g. `image.detection`). Checked against the
     * task-type registry by the application; the constraint keeps it consistent with `modality`.
     */
    taskType: text("task").notNull(),
    /**
     * Classes for whole-asset tasks (classification), in display order. Keys are what's stored in
     * annotations; names are what people see. Empty for tasks that don't use a fixed class list.
     */
    classes: jsonb().$type<{ key: string; name: string }[]>().notNull().default([]),
    /** Classification: more than one class per asset is allowed. */
    multiLabel: boolean().notNull().default(false),
    /** Approvals a page needs before it counts as approved (review rules, like branch protection). */
    requiredApprovals: integer().notNull().default(1),
    /** Lets the person who submitted a page approve it themselves (useful for solo projects). */
    allowSelfApproval: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_org_slug_uq").on(t.orgId, t.slug),
    index("projects_org_idx").on(t.orgId),
    index("projects_task_type_idx").on(t.taskType),
    check("projects_required_approvals_range", sql`${t.requiredApprovals} between 1 and 5`),
    check(
      "projects_task_type_matches_modality",
      sql`${t.taskType} ~ ('^' || ${t.modality}::text || '\\.[a-z][a-z0-9-]*$')`,
    ),
  ],
);
