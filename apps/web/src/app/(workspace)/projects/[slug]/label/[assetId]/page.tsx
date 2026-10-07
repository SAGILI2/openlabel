import { notFound } from "next/navigation";
import {
  AccessError,
  getLabellingState,
  getReviewState,
  assetNeighbours,
  listEligibleReviewers,
  REVIEWER_ROLES,
  subtreeFolderIds,
} from "@openlabel/db";
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

  const state = await getLabellingState(scope, assetId).catch((err: unknown) => {
    if (err instanceof AccessError) notFound();
    throw err;
  });
  if (state.asset.projectId !== project.id) notFound();
  // Only the files around this one: the film-strip and prev/next stay fast in huge projects.
  const around = await assetNeighbours(
    scope,
    project.id,
    assetId,
    folder === null
      ? undefined
      : folder === "root"
        ? null
        : await subtreeFolderIds(scope, project.id, folder),
  );
  const assets = around.rows;
  const [review, reviewers] = await Promise.all([
    getReviewState(scope, assetId),
    listEligibleReviewers(scope),
  ]);

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
        position={around.position}
        total={around.total}
        strip={assets.map((a) => ({
          id: a.id,
          name: a.originalName,
          href: `/projects/${slug}/label/${a.id}${suffix}`,
          done: a.status === "approved",
        }))}
        review={{
          status: review.status,
          currentVersion: review.currentVersion,
          submittedByMe: review.submittedByUserId === scope.userId,
          requiredApprovals: review.requiredApprovals,
          allowSelfApproval: review.allowSelfApproval,
          approvals: review.approvals,
          requested: review.requested.map((r) => ({
            userId: r.userId,
            name: r.name,
            latest: r.latest,
            stale: r.stale,
          })),
          history: review.history.map((h) => ({
            id: h.id,
            reviewerName: h.reviewerName,
            decision: h.decision,
            body: h.body,
            annotationVersion: h.annotationVersion,
            createdAt: h.createdAt.toISOString(),
          })),
        }}
        reviewers={reviewers
          .filter((r) => r.userId !== scope.userId || review.allowSelfApproval)
          .map((r) => ({ userId: r.userId, name: r.name, email: r.email }))}
        canReview={REVIEWER_ROLES.includes(scope.role)}
      />
    </>
  );
}
