import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets } from "./assets.js";
import { id } from "./columns.js";
import { organizations, users } from "./identity.js";
import { projects } from "./projects.js";

/** A review's verdict, as on a pull request. */
export const reviewDecision = pgEnum("review_decision", ["approve", "request_changes", "comment"]);

/**
 * Reviews of an asset's labels. Each review is pinned to the annotation version it looked at, so
 * an approval stops counting as soon as the labels change (like stale approvals on a PR).
 */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    annotationVersion: integer().notNull(),
    reviewerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    decision: reviewDecision().notNull(),
    body: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_asset_idx").on(t.assetId, t.createdAt)],
);

/** People asked to review an asset (the "Reviewers" list on a pull request). */
export const reviewRequests = pgTable(
  "review_requests",
  {
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    reviewerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.reviewerUserId] }),
    index("review_requests_reviewer_idx").on(t.reviewerUserId),
  ],
);

/** Reviewers added automatically when a page in the project is submitted. */
export const projectDefaultReviewers = pgTable(
  "project_default_reviewers",
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);
