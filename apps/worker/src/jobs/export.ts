import { imageAnnotationSchema, splitPlanSchema } from "@openlabel/contracts";
import {
  loadExportJob,
  markExportFailed,
  markExportReady,
  markExportRunning,
  type Database,
  type JobRow,
} from "@openlabel/db";
import { createZipSink, DEFAULT_OPTIONS, EXPORTERS, type Snapshot } from "@openlabel/exporters";
import { exportKey, type ObjectStore } from "@openlabel/storage";

export interface ExportDeps {
  db: Database;
  store: ObjectStore;
  log: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Writes one export: loads the frozen items, runs the exporter into a ZIP and stores it.
 * Errors that retrying can't fix (unknown format, bad data) fail the export immediately.
 */
export async function runExport(deps: ExportDeps, job: JobRow): Promise<void> {
  const exportId = typeof job.payload.exportId === "string" ? job.payload.exportId : null;
  if (!exportId) throw new Error("export job without exportId");
  const data = await loadExportJob(deps.db, exportId);
  if (!data) {
    deps.log("export gone, skipping", { exportId });
    return;
  }
  const exporter = EXPORTERS.get(data.export.format);
  if (!exporter) {
    await markExportFailed(deps.db, exportId, `Unknown format "${data.export.format}".`);
    return;
  }
  await markExportRunning(deps.db, exportId);

  const started = Date.now();
  const snapshot: Snapshot = {
    exportId,
    projectName: data.export.projectName,
    taskType: data.export.taskType,
    createdAt: data.export.createdAt.toISOString(),
    items: data.items.map((it) => ({
      assetId: it.assetId,
      fileName: it.originalName,
      mimeType: it.mimeType,
      width: typeof it.mediaMeta.width === "number" ? it.mediaMeta.width : 0,
      height: typeof it.mediaMeta.height === "number" ? it.mediaMeta.height : 0,
      split: it.split,
      annotationVersion: it.annotationVersion,
      annotation: imageAnnotationSchema.parse(it.annotation),
    })),
  };
  const keys = new Map(data.items.map((it) => [it.assetId, it.storageKey]));
  const load = async (assetId: string) => {
    const key = keys.get(assetId);
    const object = key ? await deps.store.get(key) : null;
    if (!object) throw new Error(`image missing in storage for asset ${assetId}`);
    return object.body;
  };
  const cropPadding =
    typeof data.export.options.cropPadding === "number"
      ? data.export.options.cropPadding
      : DEFAULT_OPTIONS.cropPadding;

  // MVP: the archive is assembled in memory, then stored. Fine for thousands of pages; switch to
  // multipart upload when exports grow past a few hundred MB.
  const chunks: Uint8Array[] = [];
  const { sink, finish } = createZipSink((c) => chunks.push(c));
  const stats = await exporter.run(snapshot, load, sink, { ...DEFAULT_OPTIONS, cropPadding });
  // Record the plan alongside the counts so the archive is self-describing.
  const plan = splitPlanSchema.safeParse(data.export.options.split);
  await sink.add(
    "openlabel-export.json",
    new TextEncoder().encode(
      `${JSON.stringify(
        {
          export_id: exportId,
          project: data.export.projectName,
          task_type: data.export.taskType,
          format: exporter.id,
          created_at: snapshot.createdAt,
          split_plan: plan.success ? plan.data : null,
          items: data.items.map((it) => ({
            asset_id: it.assetId,
            file: it.originalName,
            split: it.split,
            annotation_version: it.annotationVersion,
          })),
          stats,
        },
        null,
        2,
      )}\n`,
    ),
  );
  await finish();

  const size = chunks.reduce((n, c) => n + c.length, 0);
  const archive = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    archive.set(c, offset);
    offset += c.length;
  }
  const key = exportKey(data.export.orgId, data.export.projectId, exportId);
  await deps.store.put(key, archive, "application/zip");
  await markExportReady(deps.db, exportId, { storageKey: key, byteSize: size, stats });
  deps.log("exported", {
    exportId,
    format: exporter.id,
    items: data.items.length,
    bytes: size,
    ms: Date.now() - started,
  });
}
