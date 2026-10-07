import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  annotations,
  assets,
  auditEvents,
  memberships,
  projectDefaultReviewers,
  projects,
  reviewRequests,
  reviews,
  users,
} from "../schema/index.js";
import { AccessError } from "./errors.js";
import { requireRole, type OrgRole, type OrgScope } from "./scope.js";

export type ReviewDecision = (typeof reviews.$inferSelect)["decision"];

/** Roles that may review labels. */
export const REVIEWER_ROLES: readonly OrgRole[] = ["reviewer", "manager", "admin", "owner"];

export interface ReviewRules {
  requiredApprovals: number;
  allowSelfApproval: boolean;
  defaultReviewerIds: string[];
}

export interface ReviewRow {
  id: string;
  reviewerUserId: string | null;
  reviewerName: string | null;
  decision: ReviewDecision;
  body: string;
  annotationVersion: number;
  createdAt: Date;
}

export interface ReviewState {
  status: (typeof assets.$inferSelect)["status"];
  currentVersion: number;
  submittedByUserId: string | null;
  submittedAt: Date | null;
  requiredApprovals: number;
  allowSelfApproval: boolean;
  /** Distinct reviewers whose latest review approves the current version. */
  approvals: number;
  requested: { userId: string; name: string; email: string; latest: ReviewDecision | null; stale: boolean }[];
  history: ReviewRow[];
}

async function assetInScope(scope: OrgScope, assetId: string) {
  const [row] = await scope.db
    .select({
      id: assets.id,
      projectId: assets.projectId,
      status: assets.status,
      submittedByUserId: assets.submittedByUserId,
      submittedAt: assets.submittedAt,
      requiredApprovals: projects.requiredApprovals,
      allowSelfApproval: projects.allowSelfApproval,
    })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .where(and(eq(assets.id, assetId), eq(assets.orgId, scope.orgId)));
  if (!row) throw new AccessError("NOT_FOUND", "Item not found.");
  return row;
}

async function currentVersion(scope: OrgScope, assetId: string): Promise<number> {
  const [row] = await scope.db
    .select({ version: annotations.version })
    .from(annotations)
    .where(eq(annotations.assetId, assetId))
    .orderBy(desc(annotations.version))
    .limit(1);
  return row?.version ?? 0;
}

/** Members of the organisation who can review, for the reviewer picker. */
export async function listEligibleReviewers(
  scope: OrgScope,
): Promise<{ userId: string; name: string; email: string; role: OrgRole }[]> {
  return scope.db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, scope.orgId), inArray(memberships.role, [...REVIEWER_ROLES])))
    .orderBy(asc(users.name));
}

async function assertReviewers(scope: OrgScope, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const eligible = new Set((await listEligibleReviewers(scope)).map((r) => r.userId));
  const bad = userIds.find((id) => !eligible.has(id));
  if (bad) throw new AccessError("FORBIDDEN", "Reviewers must be members with the reviewer role or higher.");
}

/* ---------- Project rules (like branch protection) ---------- */

export async function getReviewRules(scope: OrgScope, projectId: string): Promise<ReviewRules> {
  const [project] = await scope.db
    .select({ requiredApprovals: projects.requiredApprovals, allowSelfApproval: projects.allowSelfApproval })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, scope.orgId)));
  if (!project) throw new AccessError("NOT_FOUND", "Project not found.");
  const defaults = await scope.db
    .select({ userId: projectDefaultReviewers.userId })
    .from(projectDefaultReviewers)
    .where(eq(projectDefaultReviewers.projectId, projectId));
  return { ...project, defaultReviewerIds: defaults.map((d) => d.userId) };
}

export async function setReviewRules(scope: OrgScope, projectId: string, rules: ReviewRules): Promise<void> {
  requireRole(scope, "manager");
  await getReviewRules(scope, projectId);
  if (
    !Number.isInteger(rules.requiredApprovals) ||
    rules.requiredApprovals < 1 ||
    rules.requiredApprovals > 5
  ) {
    throw new AccessError("CONFLICT", "Required approvals must be between 1 and 5.");
  }
  const reviewerIds = [...new Set(rules.defaultReviewerIds)];
  await assertReviewers(scope, reviewerIds);
  await scope.db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ requiredApprovals: rules.requiredApprovals, allowSelfApproval: rules.allowSelfApproval })
      .where(eq(projects.id, projectId));
    await tx.delete(projectDefaultReviewers).where(eq(projectDefaultReviewers.projectId, projectId));
    if (reviewerIds.length > 0) {
      await tx.insert(projectDefaultReviewers).values(reviewerIds.map((userId) => ({ projectId, userId })));
    }
    await tx.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: "project.review_rules_changed",
      resourceType: "project",
      resourceId: projectId,
      details: { requiredApprovals: rules.requiredApprovals, allowSelfApproval: rules.allowSelfApproval },
    });
  });
}

/* ---------- Submitting and reviewing ---------- */

/**
 * Sends the current labels for review, requesting the given reviewers plus the project's default
 * reviewers (the submitter is never requested for their own page).
 */
export async function submitForReview(
  scope: OrgScope,
  assetId: string,
  reviewerIds: string[],
): Promise<void> {
  requireRole(scope, "labeller");
  const asset = await assetInScope(scope, assetId);
  const version = await currentVersion(scope, assetId);
  if (version === 0) throw new AccessError("CONFLICT", "Save labels before sending them for review.");
  const rules = await getReviewRules(scope, asset.projectId);
  const requested = [...new Set([...reviewerIds, ...rules.defaultReviewerIds])].filter(
    (id) => id !== scope.userId || rules.allowSelfApproval,
  );
  await assertReviewers(scope, requested);
  await scope.db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ status: "submitted", submittedByUserId: scope.userId, submittedAt: new Date() })
      .where(eq(assets.id, assetId));
    if (requested.length > 0) {
      await tx
        .insert(reviewRequests)
        .values(
          requested.map((reviewerUserId) => ({ assetId, reviewerUserId, requestedByUserId: scope.userId })),
        )
        .onConflictDoNothing();
    }
    await tx.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: "review.requested",
      resourceType: "asset",
      resourceId: assetId,
      details: { version, reviewers: requested },
    });
  });
}

/** Adds or removes requested reviewers without resubmitting. */
export async function setRequestedReviewers(
  scope: OrgScope,
  assetId: string,
  reviewerIds: string[],
): Promise<void> {
  requireRole(scope, "labeller");
  await assetInScope(scope, assetId);
  const ids = [...new Set(reviewerIds)];
  await assertReviewers(scope, ids);
  await scope.db.transaction(async (tx) => {
    await tx.delete(reviewRequests).where(eq(reviewRequests.assetId, assetId));
    if (ids.length > 0) {
      await tx
        .insert(reviewRequests)
        .values(ids.map((reviewerUserId) => ({ assetId, reviewerUserId, requestedByUserId: scope.userId })));
    }
  });
}

/**
 * Records a review of the current labels. Approvals count only for the version they saw; once
 * enough distinct reviewers approve the current version, the page becomes approved. Requesting
 * changes sends it back to the labeller.
 */
export async function reviewAsset(
  scope: OrgScope,
  assetId: string,
  input: { decision: ReviewDecision; body: string; version: number },
): Promise<ReviewState> {
  const asset = await assetInScope(scope, assetId);
  if (!REVIEWER_ROLES.includes(scope.role)) {
    throw new AccessError("FORBIDDEN", "Only reviewers, managers and admins can review.");
  }
  const version = await currentVersion(scope, assetId);
  if (version === 0) throw new AccessError("CONFLICT", "There are no saved labels to review.");
  if (input.version !== version) {
    throw new AccessError(
      "CONFLICT",
      "The labels changed while you were reviewing. Reload to see the latest.",
    );
  }
  if (input.decision !== "comment" && asset.submittedByUserId === scope.userId && !asset.allowSelfApproval) {
    throw new AccessError("FORBIDDEN", "You can't approve or request changes on your own submission.");
  }
  if (input.decision === "request_changes" && !input.body.trim()) {
    throw new AccessError("CONFLICT", "Say what needs to change.");
  }
  if (input.decision === "comment" && !input.body.trim()) {
    throw new AccessError("CONFLICT", "Write a comment first.");
  }

  await scope.db.transaction(async (tx) => {
    await tx.insert(reviews).values({
      orgId: scope.orgId,
      assetId,
      annotationVersion: version,
      reviewerUserId: scope.userId,
      decision: input.decision,
      body: input.body.trim().slice(0, 4000),
    });
    await tx.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: `review.${input.decision}`,
      resourceType: "asset",
      resourceId: assetId,
      details: { version },
    });
  });

  const state = await getReviewState(scope, assetId);
  const next =
    input.decision === "request_changes"
      ? "rejected"
      : state.approvals >= state.requiredApprovals
        ? "approved"
        : input.decision === "approve"
          ? "submitted"
          : null;
  if (next && next !== asset.status) {
    await scope.db.update(assets).set({ status: next }).where(eq(assets.id, assetId));
    return { ...state, status: next };
  }
  return state;
}

/** Everything the review panel shows: rules, requested reviewers, approvals and history. */
export async function getReviewState(scope: OrgScope, assetId: string): Promise<ReviewState> {
  const asset = await assetInScope(scope, assetId);
  const version = await currentVersion(scope, assetId);
  const history = await scope.db
    .select({
      id: reviews.id,
      reviewerUserId: reviews.reviewerUserId,
      reviewerName: users.name,
      decision: reviews.decision,
      body: reviews.body,
      annotationVersion: reviews.annotationVersion,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .leftJoin(users, eq(users.id, reviews.reviewerUserId))
    .where(eq(reviews.assetId, assetId))
    .orderBy(asc(reviews.createdAt));

  // Each reviewer's latest verdict (comments don't change a verdict).
  const verdicts = new Map<string, ReviewRow>();
  for (const r of history) {
    if (r.reviewerUserId && r.decision !== "comment") verdicts.set(r.reviewerUserId, r);
  }
  const approvals = [...verdicts.values()].filter(
    (r) => r.decision === "approve" && r.annotationVersion === version,
  ).length;

  const requestedRows = await scope.db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(reviewRequests)
    .innerJoin(users, eq(users.id, reviewRequests.reviewerUserId))
    .where(eq(reviewRequests.assetId, assetId))
    .orderBy(asc(users.name));

  return {
    status: asset.status,
    currentVersion: version,
    submittedByUserId: asset.submittedByUserId,
    submittedAt: asset.submittedAt,
    requiredApprovals: asset.requiredApprovals,
    allowSelfApproval: asset.allowSelfApproval,
    approvals,
    requested: requestedRows.map((r) => {
      const v = verdicts.get(r.userId);
      return { ...r, latest: v?.decision ?? null, stale: v ? v.annotationVersion !== version : false };
    }),
    history,
  };
}

/** Pages waiting on the current user's review, oldest submission first. */
export async function myReviewQueue(
  scope: OrgScope,
  projectId?: string,
): Promise<{ assetId: string; name: string; projectId: string; submittedAt: Date | null }[]> {
  return scope.db
    .select({
      assetId: assets.id,
      name: assets.originalName,
      projectId: assets.projectId,
      submittedAt: assets.submittedAt,
    })
    .from(reviewRequests)
    .innerJoin(assets, eq(assets.id, reviewRequests.assetId))
    .where(
      and(
        eq(reviewRequests.reviewerUserId, scope.userId),
        eq(assets.orgId, scope.orgId),
        eq(assets.status, "submitted"),
        ...(projectId ? [eq(assets.projectId, projectId)] : []),
      ),
    )
    .orderBy(asc(assets.submittedAt));
}
