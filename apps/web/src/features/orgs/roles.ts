import type { OrgRole } from "@openlabel/db";

/** Display name and one-line meaning of each organisation role, most to least powerful. */
export const ROLES: readonly { value: OrgRole; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Everything, including deleting the organisation." },
  { value: "admin", label: "Admin", description: "Manage members, settings and every project." },
  { value: "manager", label: "Manager", description: "Run projects, assign work and invite people." },
  { value: "reviewer", label: "Reviewer", description: "Approve or reject labelled work." },
  { value: "labeller", label: "Labeller", description: "Label assigned items." },
  { value: "viewer", label: "Viewer", description: "Read-only access." },
];

export function roleLabel(role: OrgRole): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

/** Turns a name into a URL handle: "Acme Labs, Inc." → "acme-labs-inc". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}
