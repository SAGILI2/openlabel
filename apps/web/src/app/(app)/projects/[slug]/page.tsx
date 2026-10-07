import {
  getReviewRules,
  listEligibleReviewers,
  pageAssets,
  REVIEWER_ROLES,
  subtreeFolderIds,
  type AssetFilter,
  type AssetSort,
} from "@openlabel/db";
import { FileBrowser, type FolderSelection } from "@/features/browser";
import { AutoRefresh } from "@/features/projects";
import { folderPaths, loadProject } from "@/server/projects/load";

const PAGE_SIZE = 100;
const FILTERS = new Set<string>(["all", "mine", "todo", "review", "done", "ocr"]);
const SORTS = new Set<string>(["oldest", "newest", "name", "name-desc"]);

export default async function ProjectFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    folder?: string;
    view?: string;
    filter?: string;
    page?: string;
    size?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { scope, project, tree, counts, canEdit } = await loadProject(slug);
  const paths = folderPaths(tree.roots);

  const selection: FolderSelection =
    query.folder === "root" ? "root" : query.folder && paths.has(query.folder) ? query.folder : "all";
  const filter: AssetFilter = FILTERS.has(query.filter ?? "") ? (query.filter as AssetFilter) : "all";
  const sort: AssetSort = SORTS.has(query.sort ?? "") ? (query.sort as AssetSort) : "oldest";
  const pageSize = [50, 100, 200, 500].includes(Number(query.size)) ? Number(query.size) : PAGE_SIZE;
  const search = (query.q ?? "").slice(0, 200);
  const requested = Math.max(1, Math.floor(Number(query.page)) || 1);
  const [listing, reviewers, rules] = await Promise.all([
    pageAssets(scope, project.id, {
      folders:
        selection === "all"
          ? undefined
          : selection === "root"
            ? null
            : await subtreeFolderIds(scope, project.id, selection),
      filter,
      page: requested,
      pageSize,
      search,
      sort,
    }),
    listEligibleReviewers(scope),
    getReviewRules(scope, project.id),
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
        filter={filter}
        counts={listing.counts}
        page={Math.min(requested, Math.max(1, Math.ceil(listing.total / pageSize)))}
        pageSize={pageSize}
        search={search}
        sort={sort}
        total={listing.total}
        view={query.view === "grid" ? "grid" : "list"}
        files={listing.rows.map((a) => ({
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
