import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AccessError, assetStatusCounts, folderTree, getProjectBySlug, type FolderNode } from "@openlabel/db";
import { requireOrgScope } from "../orgs";
import { getTaskTypeRegistry } from "../tasks";

/** Project, its folder tree and status counts for the project pages; cached per request. */
export const loadProject = cache(async (slug: string) => {
  const { scope } = await requireOrgScope();
  const project = await getProjectBySlug(scope, slug).catch((err: unknown) => {
    if (err instanceof AccessError) notFound();
    throw err;
  });
  const [tree, counts] = await Promise.all([
    folderTree(scope, project.id),
    assetStatusCounts(scope, project.id),
  ]);
  const registry = getTaskTypeRegistry();
  return {
    scope,
    project,
    tree,
    counts: {
      labelled: (counts.submitted ?? 0) + (counts.approved ?? 0),
      ocrRunning: (counts.new ?? 0) + (counts.prelabelling ?? 0),
    },
    taskTitle: registry.has(project.taskType) ? registry.get(project.taskType).title : project.taskType,
    canEdit: ["owner", "admin", "manager"].includes(scope.role),
  };
});

/** Flat id → path map of the folder tree. */
export function folderPaths(nodes: FolderNode[], out = new Map<string, string>()): Map<string, string> {
  for (const n of nodes) {
    out.set(n.id, n.path);
    folderPaths(n.children, out);
  }
  return out;
}
