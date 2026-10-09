import { notFound } from "next/navigation";
import { imageAnnotationSchema } from "@openlabel/contracts";
import {
  AccessError,
  getLabellingState,
  getReviewState,
  assetNeighbours,
  folderPath,
  getPreferences,
  ocrPending,
  listEligibleReviewers,
  REVIEWER_ROLES,
  subtreeFolderIds,
} from "@openlabel/db";
import { AutoRefresh } from "@/features/projects";
import { Editor, wordsFromAnnotation, wordsFromPrediction } from "@/features/labelling";
import { getDb } from "@/server/db";
import { pageCountOf, pageMetaOf, pageParam } from "@/server/media/upright";
import { loadProject } from "@/server/projects/load";

export const metadata = { title: "Label" };

export default async function LabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; assetId: string }>;
  searchParams: Promise<{ folder?: string; page?: string }>;
}) {
  const [{ slug, assetId }, query] = await Promise.all([params, searchParams]);
  const { scope, project } = await loadProject(slug);
  const folder =
    query.folder === "root"
      ? "root"
      : query.folder &&
          /^[0-9a-f-]{36}$/i.test(query.folder) &&
          (await folderPath(scope, project.id, query.folder))
        ? query.folder
        : null;

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
  const [review, reviewers, preferences, reading] = await Promise.all([
    getReviewState(scope, assetId),
    listEligibleReviewers(scope),
    getPreferences(getDb().db, scope.userId),
    ocrPending(scope, assetId),
  ]);

  const suffix = folder ? `?folder=${folder}` : "";
  const meta = state.asset.mediaMeta;

  // A PDF is one file; the editor shows one of its pages (?page=N), with a page strip if several.
  const isPdf = state.asset.kind === "pdf";
  const pageCount = isPdf ? pageCountOf(meta) : 1;
  const page = isPdf ? pageParam(query.page ?? null, pageCount) : 1;
  const saved = state.annotation ? imageAnnotationSchema.safeParse(state.annotation.data) : null;
  const savedDoc = saved?.success ? saved.data : null;
  const checkedPages = savedDoc?.pages ?? (savedDoc ? [1] : []);
  const pagePrediction = isPdf ? state.pagePredictions.get(page) : state.prediction?.result;
  // A page someone saved shows their labels; any other page shows its OCR draft.
  const pageSaved = isPdf ? checkedPages.includes(page) : state.annotation !== null;
  const source = pageSaved ? "annotation" : pagePrediction ? "prediction" : "empty";
  const words =
    pageSaved && state.annotation
      ? wordsFromAnnotation(state.annotation.data, isPdf ? page : undefined)
      : pagePrediction
        ? wordsFromPrediction(pagePrediction, isPdf ? page : undefined)
        : [];
  const pageHrefBase = `/projects/${slug}/label/${assetId}?${new URLSearchParams({ ...(folder ? { folder } : {}), page: "" }).toString()}`;
  const document =
    isPdf && pageCount > 1
      ? {
          page,
          pageCount,
          otherRegions: (savedDoc?.regions ?? []).filter((r) => (r.page ?? 1) !== page),
          checkedPages,
          pageHrefBase,
          pages: Array.from({ length: pageCount }, (_, i) => {
            const r = state.pagePredictions.get(i + 1);
            const lines = Array.isArray(r?.lines) ? (r.lines as { words?: unknown[] }[]) : [];
            return {
              words: lines.reduce((n, l) => n + (Array.isArray(l.words) ? l.words.length : 0), 0),
              rotation: pageMetaOf(meta, i + 1).rotation,
            };
          }),
        }
      : undefined;
  const pageMeta = pageMetaOf(meta, page);
  // Refresh while OCR is waiting or running (first reading, or a re-run after turning the page).
  const waitingForOcr = reading;

  return (
    <>
      <AutoRefresh active={waitingForOcr} intervalMs={3000} />
      <Editor
        // Remount when the draft source changes (e.g. OCR finishes while open).
        key={`${assetId}:${String(page)}:${source}:${String(state.annotation?.version ?? 0)}:${String(pageMeta.rotation)}:${String(state.prediction?.createdAt.getTime() ?? 0)}`}
        document={document}
        assetId={assetId}
        preferences={preferences}
        assetName={state.asset.originalName}
        projectName={project.name}
        // The turn is part of the URL so a page turned again is never shown from the browser's cache.
        imageUrl={`/api/assets/${assetId}/file?${isPdf ? `page=${String(page)}&` : ""}r=${String(pageMeta.rotation)}`}
        imageWidth={pageMeta.width}
        imageHeight={pageMeta.height}
        rotation={pageMeta.rotation}
        reading={reading}
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
