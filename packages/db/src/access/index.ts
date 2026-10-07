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
