import {
  getReviewRules,
  listAssets,
  listEligibleReviewers,
  myReviewQueue,
  REVIEWER_ROLES,
  subtreeFolderIds,
} from "@openlabel/db";
import { FileBrowser, type FolderSelection } from "@/features/browser";
import { AutoRefresh } from "@/features/projects";
import { folderPaths, loadProject } from "@/server/projects/load";

export default async function ProjectFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ folder?: string; view?: string; filter?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { scope, project, tree, counts, canEdit } = await loadProject(slug);
  const paths = folderPaths(tree.roots);

  const selection: FolderSelection =
    query.folder === "root" ? "root" : query.folder && paths.has(query.folder) ? query.folder : "all";
  const [files, reviewers, rules, queue] = await Promise.all([
    listAssets(
      scope,
      project.id,
      selection === "all"
        ? undefined
        : selection === "root"
          ? null
          : await subtreeFolderIds(scope, project.id, selection),
    ),
    listEligibleReviewers(scope),
    getReviewRules(scope, project.id),
    myReviewQueue(scope, project.id),
  ]);
  const folderName =
    selection === "all"
      ? "All files"
      : selection === "root"
        ? "Not in a folder"
        : (paths.get(selection) ?? "Folder");

  return (
    <>
      <AutoRefresh active={counts.ocrRunning > 0} />
      <FileBrowser
        projectId={project.id}
        projectSlug={project.slug}
        selection={selection}
        folderName={folderName}
        tree={tree.roots}
        totalCount={tree.totalCount}
        rootFileCount={tree.rootFileCount}
        canEdit={canEdit}
        canSubmit={scope.role !== "viewer"}
        reviewers={reviewers
          .filter((r) => r.userId !== scope.userId || rules.allowSelfApproval)
          .map((r) => ({ userId: r.userId, name: r.name, email: r.email }))}
        defaultReviewerIds={rules.defaultReviewerIds}
        canReview={REVIEWER_ROLES.includes(scope.role)}
        myQueueIds={queue.map((q) => q.assetId)}
        initialFilter={query.filter === "mine" || query.filter === "review" ? query.filter : "all"}
        view={query.view === "grid" ? "grid" : "list"}
        files={files.map((a) => ({
          id: a.id,
          name: a.originalName,
          status: a.status,
          width: typeof a.mediaMeta.width === "number" ? a.mediaMeta.width : null,
          height: typeof a.mediaMeta.height === "number" ? a.mediaMeta.height : null,
          folderPath: a.folderId ? (paths.get(a.folderId) ?? null) : null,
        }))}
      />
    </>
  );
}
