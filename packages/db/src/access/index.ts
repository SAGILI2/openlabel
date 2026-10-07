/**
 * The data-access layer for organisation-owned data. Every function here either creates an
 * organisation membership or takes an {@link OrgScope}, which can only be obtained after a
 * membership check. Application code must not query org-owned tables directly.
 */
export { AccessError, type AccessErrorCode } from "./errors.js";
export { canAssignRole, requireRole, resolveOrgScope, type OrgRole, type OrgScope } from "./scope.js";
export {
  changeMemberRole,
  createOrganization,
  listMembers,
  listMyOrganizations,
  removeMember,
  type MemberRow,
  type OrgSummary,
} from "./organizations.js";
export {
  acceptInvitation,
  createInvitation,
  listPendingInvitations,
  previewInvitation,
  revokeInvitation,
  type CreatedInvitation,
  type InvitationPreview,
  type PendingInvitation,
} from "./invitations.js";
export { setActiveOrganization } from "./session-org.js";
export { listRecentAudit, type AuditRow } from "./audit.js";
export {
  createProject,
  getProjectById,
  getProjectBySlug,
  listProjects,
  type ProjectRow,
  type ProjectWithCounts,
} from "./projects.js";
export {
  assetStatusCounts,
  getAsset,
  getLabellingState,
  listAssets,
  pageAssets,
  assetNeighbours,
  deleteAssets,
  type AssetFilter,
  type AssetSort,
  type AssetPage,
  registerAsset,
  saveAnnotation,
  type AssetRow,
  type AssetStatus,
  type LabellingState,
} from "./assets.js";
export { claimJobs, completeJob, enqueueJob, failJob, type JobRow } from "./jobs.js";
export { queueEmail, redactSentEmail, SEND_EMAIL_JOB, type QueuedEmail } from "./mail.js";
export {
  loadPrelabelTarget,
  markPrelabelFailed,
  markPrelabelling,
  storePrediction,
  type PrelabelTarget,
} from "./prelabel.js";
export {
  createExport,
  getExport,
  latestAnnotations,
  listExports,
  loadExportJob,
  markExportFailed,
  markExportReady,
  markExportRunning,
  type ExportJobData,
  type ExportRow,
} from "./exports.js";
export {
  cleanFolderName,
  createFolder,
  deleteFolder,
  ensureFolderPath,
  folderTree,
  moveAssets,
  renameFolder,
  subtreeFolderIds,
  type FolderNode,
  type FolderRow,
} from "./folders.js";
export {
  getReviewRules,
  getReviewState,
  listEligibleReviewers,
  myReviewQueue,
  REVIEWER_ROLES,
  reviewAsset,
  setRequestedReviewers,
  setReviewRules,
  submitForReview,
  submitManyForReview,
  reviewManyAssets,
  type BulkReviewResult,
  type BulkSubmitResult,
  type ReviewDecision,
  type ReviewRow,
  type ReviewRules,
  type ReviewState,
} from "./reviews.js";
