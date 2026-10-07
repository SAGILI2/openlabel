import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { assets } from "./assets.js";
import { id } from "./columns.js";
import { organizations, users } from "./identity.js";

/**
 * Model output for an asset. Always a suggestion, never ground truth (architecture §11.6).
 * `result` holds the task type's canonical prediction (e.g. a canonical OCR page).
 */
export const predictions = pgTable(
  "predictions",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    engine: text().notNull(),
    engineVersion: text().notNull(),
    result: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Lowest confidence in the result; sorts work queues (least sure first). */
    minConf: real(),
    latencyMs: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("predictions_asset_idx").on(t.assetId, t.createdAt)],
);

/** Human labels. Every save is a new immutable version; the highest version is current. */
export const annotations = pgTable(
  "annotations",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    /** The task type's annotation schema (e.g. imageAnnotationSchema). */
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("annotations_asset_version_uq").on(t.assetId, t.version)],
);

export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);

/**
 * Background work queue in Postgres. Workers claim rows with `FOR UPDATE SKIP LOCKED`, so any
 * number of workers can run side by side (ADR-0005). Failed attempts retry with back-off until
 * `maxAttempts`.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    orgId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    /** e.g. `prelabel`. */
    kind: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: jobStatus().notNull().default("queued"),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(5),
    runAfter: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lockedBy: text(),
    lockedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    /** Prevents queuing the same work twice, e.g. `prelabel:<assetId>`. */
    dedupeKey: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("jobs_claim_idx").on(t.kind, t.status, t.runAfter),
    uniqueIndex("jobs_dedupe_uq").on(t.dedupeKey),
  ],
);
