import { notFound } from "next/navigation";
import { AccessError, assetStatusCounts, getProjectBySlug, listAssets, listExports } from "@openlabel/db";
import { EXPORTERS, exportersFor } from "@openlabel/exporters";
import { PageBody, TopBar } from "@/components/shell";
import { ExportDialog, ExportsTable } from "@/features/exports";
import { AssetTable, AutoRefresh, Uploader } from "@/features/projects";
import { requireOrgScope } from "@/server/orgs";
import { getTaskTypeRegistry } from "@/server/tasks";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { scope } = await requireOrgScope();
  const project = await getProjectBySlug(scope, slug).catch((err: unknown) => {
    if (err instanceof AccessError) notFound();
    throw err;
  });
  const [assets, counts, exports] = await Promise.all([
    listAssets(scope, project.id),
    assetStatusCounts(scope, project.id),
    listExports(scope, project.id),
  ]);
  const buildingExport = exports.some((e) => e.status === "queued" || e.status === "running");
  const taskTitle = getTaskTypeRegistry().has(project.taskType)
    ? getTaskTypeRegistry().get(project.taskType).title
    : project.taskType;
  const total = assets.length;
  const labelled = (counts.submitted ?? 0) + (counts.approved ?? 0);
  const waiting = (counts.new ?? 0) + (counts.prelabelling ?? 0);
  const ready = counts.prelabelled ?? 0;
  const canUpload = ["owner", "admin", "manager"].includes(scope.role);

  const stats = [
    { label: "Images", value: total },
    { label: "OCR running", value: waiting },
    { label: "Ready to label", value: ready },
    { label: "Labelled", value: labelled },
  ];

  return (
    <>
      <TopBar title={project.name} />
      <AutoRefresh active={waiting > 0 || buildingExport} />
      <PageBody className="max-w-none">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">{project.name}</h2>
          <p className="text-muted-foreground mt-1">{taskTitle}</p>
        </div>

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-card rounded-lg border px-4 py-3">
              <dt className="text-muted-foreground text-[12px]">{s.label}</dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>

        {canUpload && <Uploader projectId={project.id} />}

        <AssetTable
          projectSlug={project.slug}
          assets={assets.map((a) => ({
            id: a.id,
            originalName: a.originalName,
            status: a.status,
            width: typeof a.mediaMeta.width === "number" ? a.mediaMeta.width : null,
            height: typeof a.mediaMeta.height === "number" ? a.mediaMeta.height : null,
            createdAt: a.createdAt.toISOString(),
          }))}
        />

        <section aria-labelledby="exports-heading" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="exports-heading" className="font-semibold">
                Exports
              </h3>
              <p className="text-muted-foreground text-[13px]">
                Frozen training sets built from labelled pages, split by page into train, validation and test.
              </p>
            </div>
            {canUpload && (
              <ExportDialog
                projectId={project.id}
                labelledCount={labelled}
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
        </section>
      </PageBody>
    </>
  );
}
