import { listExports } from "@openlabel/db";
import { EXPORTERS, exportersFor } from "@openlabel/exporters";
import { ExportDialog, ExportsTable } from "@/features/exports";
import { AutoRefresh } from "@/features/projects";
import { folderPaths, loadProject } from "@/server/projects/load";

export const metadata = { title: "Exports" };

export default async function ProjectExportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { scope, project, tree, counts, canEdit } = await loadProject(slug);
  const exports = await listExports(scope, project.id);
  const building = exports.some((e) => e.status === "queued" || e.status === "running");
  const paths = folderPaths(tree.roots);

  return (
    <div className="scrollbar-none grid min-h-0 w-full flex-1 content-start gap-4 overflow-y-auto px-4 py-5 sm:px-6">
      <AutoRefresh active={building} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-muted-foreground max-w-[640px] text-[13px]">
          Frozen training sets built from labelled pages. Each page goes wholly into train, validation or
          test, so nothing leaks between them.
        </p>
        {canEdit && (
          <ExportDialog
            projectId={project.id}
            labelledCount={counts.labelled}
            inReviewCount={counts.inReview}
            folders={[...paths.entries()]
              .map(([id, path]) => ({ id, path }))
              .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))}
            formats={exportersFor(project.taskType).map((e) => ({
              id: e.id,
              title: e.title,
              description: e.description,
            }))}
          />
        )}
      </div>
      <ExportsTable
        exports={exports.map((e) => ({
          id: e.id,
          name: e.name,
          formatTitle: EXPORTERS.get(e.format)?.title ?? e.format,
          status: e.status,
          itemCount: e.itemCount,
          stats: e.stats as Record<string, { assets?: number; words?: number }>,
          byteSize: e.byteSize,
          error: e.error,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
