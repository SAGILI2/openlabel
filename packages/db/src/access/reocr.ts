import { and, eq, inArray, sql } from "drizzle-orm";
import { assets, auditEvents, jobs, predictions } from "../schema/index.js";
import { AccessError } from "./errors.js";
import { requireRole, type OrgScope } from "./scope.js";

/**
 * Re-running OCR. A fresh prediction is added next to the old one (the latest wins), so labels
 * people already saved are never touched; a labelled file just gets a new draft to compare with.
 */

const MAX_FILES = 100_000;

/** Files in the project whose latest OCR read found no words on some page. */
function noTextCondition(projectId: string) {
  return sql`exists (
    select 1 from (
      select distinct on (p.page) p.words from ${predictions} p
      where p.asset_id = ${assets.id} order by p.page, p.created_at desc
    ) latest where latest.words = 0
  ) and ${assets.projectId} = ${projectId}`;
}

/** How many files in the project came back with no text (offered as "Re-run OCR on N pages"). */
export async function countNoText(scope: OrgScope, projectId: string): Promise<number> {
  const [row] = await scope.db
    .select({ n: sql<number>`count(*)::int` })
    .from(assets)
    .where(and(eq(assets.orgId, scope.orgId), noTextCondition(projectId)));
  return row?.n ?? 0;
}

/**
 * Queues OCR again for the given files of a project, or for every file with no text
 * (`which: "no-text"`). Files already queued or being read are left alone. Returns how many went.
 */
export async function queueReocr(
  scope: OrgScope,
  projectId: string,
  which: { assetIds: string[] } | "no-text",
): Promise<{ queued: number; skipped: number }> {
  requireRole(scope, "manager");
  const ids =
    which === "no-text"
      ? (
          await scope.db
            .select({ id: assets.id })
            .from(assets)
            .where(and(eq(assets.orgId, scope.orgId), noTextCondition(projectId)))
            .limit(MAX_FILES)
        ).map((r) => r.id)
      : (
          await scope.db
            .select({ id: assets.id })
            .from(assets)
            .where(
              and(
                eq(assets.orgId, scope.orgId),
                eq(assets.projectId, projectId),
                inArray(assets.id, which.assetIds.slice(0, MAX_FILES)),
              ),
            )
        ).map((r) => r.id);
  if (ids.length === 0) {
    if (which !== "no-text" && which.assetIds.length > 0) {
      throw new AccessError("NOT_FOUND", "Those files aren't in this project.");
    }
    return { queued: 0, skipped: 0 };
  }
  return enqueue(scope, projectId, ids, {}, which === "no-text" ? "no-text" : "selected");
}

/**
 * Reads one page again turned the way a person says it is (degrees counter-clockwise). The turn
 * is remembered as the person's answer, which orientation metrics compare the model against.
 */
export async function reocrTurned(scope: OrgScope, assetId: string, rotate: number, page = 1): Promise<void> {
  requireRole(scope, "labeller");
  const turn = (((Math.round(rotate / 90) * 90) % 360) + 360) % 360;
  const [asset] = await scope.db
    .select({ id: assets.id, projectId: assets.projectId, mediaMeta: assets.mediaMeta })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.orgId, scope.orgId)));
  if (!asset) throw new AccessError("NOT_FOUND", "File not found.");
  const byPerson =
    asset.mediaMeta.rotationByPerson && typeof asset.mediaMeta.rotationByPerson === "object"
      ? (asset.mediaMeta.rotationByPerson as Record<string, number>)
      : {};
  await scope.db
    .update(assets)
    .set({ mediaMeta: { ...asset.mediaMeta, rotationByPerson: { ...byPerson, [String(page)]: turn } } })
    .where(eq(assets.id, assetId));
  // Someone is waiting in the editor: ahead of any bulk re-run.
  await enqueue(scope, asset.projectId, [assetId], { page, rotate: turn }, "turned", 10);
}

async function enqueue(
  scope: OrgScope,
  projectId: string,
  ids: string[],
  options: { page?: number; rotate?: number },
  reason: "selected" | "no-text" | "turned",
  priority = 0,
): Promise<{ queued: number; skipped: number }> {
  let queued = 0;
  await scope.db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      // A person's turn replaces a plain re-run still waiting for the same file.
      if (reason === "turned") {
        await tx
          .delete(jobs)
          .where(
            and(
              eq(jobs.kind, "prelabel"),
              eq(jobs.status, "queued"),
              inArray(sql`${jobs.payload}->>'assetId'`, chunk),
            ),
          );
      }
      // One open OCR job per file: a file already waiting or being read isn't queued twice.
      const busy = new Set(
        (
          await tx
            .select({ id: sql<string>`${jobs.payload}->>'assetId'` })
            .from(jobs)
            .where(
              and(
                eq(jobs.kind, "prelabel"),
                inArray(jobs.status, ["queued", "running"]),
                inArray(sql`${jobs.payload}->>'assetId'`, chunk),
              ),
            )
        ).map((r) => r.id),
      );
      const fresh = chunk.filter((id) => !busy.has(id));
      if (fresh.length === 0) continue;
      await tx.insert(jobs).values(
        fresh.map((assetId) => ({
          orgId: scope.orgId,
          kind: "prelabel",
          payload: { assetId, reocr: true, ...options },
          priority,
        })),
      );
      queued += fresh.length;
    }
    await tx.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: "ocr.rerun",
      resourceType: "project",
      resourceId: projectId,
      details: { files: queued, reason, ...options },
    });
  });
  return { queued, skipped: ids.length - queued };
}

/** Whether OCR is waiting or running for a file (the editor refreshes until it's done). */
export async function ocrPending(scope: OrgScope, assetId: string): Promise<boolean> {
  const [row] = await scope.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.orgId, scope.orgId),
        eq(jobs.kind, "prelabel"),
        inArray(jobs.status, ["queued", "running"]),
        sql`${jobs.payload}->>'assetId' = ${assetId}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}
