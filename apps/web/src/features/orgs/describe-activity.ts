export interface ActivityView {
  id: string;
  action: string;
  actorName: string | null;
  details: Record<string, unknown>;
  occurredAt: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** " of 12 pages" style suffix, or "" when the number is missing. */
function count(v: unknown, noun: string): string {
  return typeof v === "number" ? ` ${v.toLocaleString()} ${noun}${v === 1 ? "" : "s"}` : "";
}

/** Plain-language sentence for an audit event. Unknown actions fall back to the raw verb. */
export function describeActivity(e: ActivityView): string {
  const who = e.actorName ?? "Someone";
  switch (e.action) {
    case "organization.created":
      return `${who} created the organisation`;
    case "invitation.created":
      return `${who} invited ${str(e.details.email)} as ${str(e.details.role)}`;
    case "invitation.revoked":
      return `${who} revoked an invitation`;
    case "invitation.accepted":
      return `${who} joined as ${str(e.details.role)}`;
    case "membership.role_changed":
      return `${who} changed a role from ${str(e.details.from)} to ${str(e.details.to)}`;
    case "membership.removed":
      return `${who} removed a member`;
    case "membership.left":
      return `${who} left the organisation`;
    case "project.created":
      return `${who} created the project ${str(e.details.name)}`.trimEnd();
    case "project.review_rules_changed":
      return `${who} changed a project's review rules`;
    case "project.classes_changed":
      return `${who} changed a project's classes`;
    case "review.requested":
      return `${who} sent a page for review`;
    case "review.approve":
      return `${who} approved a page`;
    case "review.request_changes":
      return `${who} requested changes on a page`;
    case "review.comment":
      return `${who} commented on a page`;
    case "export.created":
      return `${who} started an export of${count(e.details.items, "page") || " pages"}`;
    case "assets.deleted":
      return `${who} deleted${count(e.details.count, "file") || " files"}`;
    default:
      return `${who}: ${e.action}`;
  }
}
