import { notFound } from "next/navigation";
import { AccessError, getLabellingState, listAssets, subtreeFolderIds } from "@openlabel/db";
import { AutoRefresh } from "@/features/projects";
import { Editor, wordsFromAnnotation, wordsFromPrediction } from "@/features/labelling";
import { folderPaths, loadProject } from "@/server/projects/load";

export const metadata = { title: "Label" };

export default async function LabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; assetId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const [{ slug, assetId }, query] = await Promise.all([params, searchParams]);
  const { scope, project, tree } = await loadProject(slug);
  const paths = folderPaths(tree.roots);
  const folder =
    query.folder === "root" ? "root" : query.folder && paths.has(query.folder) ? query.folder : null;

  const [state, assets] = await Promise.all([
    getLabellingState(scope, assetId).catch((err: unknown) => {
      if (err instanceof AccessError) notFound();
      throw err;
    }),
    listAssets(
      scope,
      project.id,
      folder === null
        ? undefined
        : folder === "root"
          ? null
          : await subtreeFolderIds(scope, project.id, folder),
    ),
  ]);
  if (state.asset.projectId !== project.id) notFound();

  const suffix = folder ? `?folder=${folder}` : "";
  const source = state.annotation ? "annotation" : state.prediction ? "prediction" : "empty";
  const words = state.annotation
    ? wordsFromAnnotation(state.annotation.data)
    : state.prediction
      ? wordsFromPrediction(state.prediction.result)
      : [];
  const waitingForOcr =
    source === "empty" && (state.asset.status === "new" || state.asset.status === "prelabelling");
  const meta = state.asset.mediaMeta;

  return (
    <>
      <AutoRefresh active={waitingForOcr} intervalMs={3000} />
      <Editor
        // Remount when the draft source changes (e.g. OCR finishes while open).
        key={`${assetId}:${source}:${String(state.annotation?.version ?? 0)}`}
        assetId={assetId}
        assetName={state.asset.originalName}
        projectName={project.name}
        imageUrl={`/api/assets/${assetId}/file`}
        imageWidth={typeof meta.width === "number" ? meta.width : null}
        imageHeight={typeof meta.height === "number" ? meta.height : null}
        initialWords={words}
        baseVersion={state.annotation?.version ?? 0}
        source={source}
        engine={state.prediction?.engineVersion ?? null}
        backHref={`/projects/${slug}${suffix}`}
        strip={assets.map((a) => ({
          id: a.id,
          name: a.originalName,
          href: `/projects/${slug}/label/${a.id}${suffix}`,
          done: a.status === "submitted" || a.status === "approved",
        }))}
      />
    </>
  );
}
