import { notFound } from "next/navigation";
import { AccessError, getLabellingState, getProjectBySlug, listAssets } from "@openlabel/db";
import { TopBar } from "@/components/shell";
import { AutoRefresh } from "@/features/projects";
import { Editor, wordsFromAnnotation, wordsFromPrediction } from "@/features/labelling";
import { requireOrgScope } from "@/server/orgs";

export const metadata = { title: "Label" };

export default async function LabelPage({ params }: { params: Promise<{ slug: string; assetId: string }> }) {
  const { slug, assetId } = await params;
  const { scope } = await requireOrgScope();
  const notFoundOn = (err: unknown): never => {
    if (err instanceof AccessError) notFound();
    throw err;
  };
  const project = await getProjectBySlug(scope, slug).catch(notFoundOn);
  const [state, assets] = await Promise.all([
    getLabellingState(scope, assetId).catch(notFoundOn),
    listAssets(scope, project.id),
  ]);
  if (state.asset.projectId !== project.id) notFound();

  const index = assets.findIndex((a) => a.id === assetId);
  const href = (i: number) => {
    const a = assets[i];
    return a ? `/projects/${slug}/label/${a.id}` : null;
  };

  const source = state.annotation ? "annotation" : state.prediction ? "prediction" : "empty";
  const words = state.annotation
    ? wordsFromAnnotation(state.annotation.data)
    : state.prediction
      ? wordsFromPrediction(state.prediction.result)
      : [];
  const waitingForOcr =
    source === "empty" && (state.asset.status === "new" || state.asset.status === "prelabelling");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar title={project.name} />
      <AutoRefresh active={waitingForOcr} intervalMs={3000} />
      <div className="min-h-0 flex-1">
        <Editor
          // Remount when the draft source changes (e.g. OCR finishes while open).
          key={`${assetId}:${source}:${String(state.annotation?.version ?? 0)}`}
          assetId={assetId}
          assetName={state.asset.originalName}
          imageUrl={`/api/assets/${assetId}/file`}
          initialWords={words}
          baseVersion={state.annotation?.version ?? 0}
          source={source}
          engine={state.prediction?.engineVersion ?? null}
          prevHref={href(index - 1)}
          nextHref={href(index + 1)}
          backHref={`/projects/${slug}`}
        />
      </div>
    </div>
  );
}
