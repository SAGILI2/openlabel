import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  AccessError,
  assetStatusCounts,
  folderChildren,
  getProjectBySlug,
  projectFileCounts,
} from "@openlabel/db";
import { requireOrgScope } from "../orgs";
import { getTaskTypeRegistry } from "../tasks";

/** Project, its folder tree and status counts for the project pages; cached per request. */
export const loadProject = cache(async (slug: string) => {
  const { scope } = await requireOrgScope();
  const project = await getProjectBySlug(scope, slug).catch((err: unknown) => {
    if (err instanceof AccessError) notFound();
    throw err;
  });
  // Only the top level of folders: deeper levels load when opened (projects can have 10,000s).
  const [roots, files, counts] = await Promise.all([
    folderChildren(scope, project.id, null),
    projectFileCounts(scope, project.id),
    assetStatusCounts(scope, project.id),
  ]);
  const tree = { roots, ...files };
  const registry = getTaskTypeRegistry();
  return {
    scope,
    project,
    tree,
    counts: {
      labelled: counts.approved ?? 0,
      inReview: counts.submitted ?? 0,
      ocrRunning: (counts.new ?? 0) + (counts.prelabelling ?? 0),
    },
    taskTitle: registry.has(project.taskType) ? registry.get(project.taskType).title : project.taskType,
    canEdit: ["owner", "admin", "manager"].includes(scope.role),
  };
});
