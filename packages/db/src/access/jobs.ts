import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { jobs } from "../schema/index.js";

/** A transaction or the database itself. */
type Executor = Pick<Database, "insert" | "update" | "select" | "execute">;

export interface JobRow {
  id: string;
  orgId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

/** Queues work. A repeated `dedupeKey` is ignored, so callers can enqueue idempotently. */
export async function enqueueJob(
  db: Executor,
  job: {
    orgId: string | null;
    kind: string;
    payload: Record<string, unknown>;
    dedupeKey?: string;
    runAfter?: Date;
    /** Higher runs first (default 0). */
    priority?: number;
  },
): Promise<void> {
  await db
    .insert(jobs)
    .values({
      orgId: job.orgId,
      kind: job.kind,
      payload: job.payload,
      dedupeKey: job.dedupeKey ?? null,
      ...(job.runAfter ? { runAfter: job.runAfter } : {}),
      ...(job.priority ? { priority: job.priority } : {}),
    })
    .onConflictDoNothing({ target: jobs.dedupeKey });
}

/**
 * Claims up to `limit` due jobs of `kind` for `workerId`. `FOR UPDATE SKIP LOCKED` lets many
 * workers poll at once without taking the same job. Jobs locked longer than `staleAfterMs`
 * (a crashed worker) are claimable again.
 */
export async function claimJobs(
  db: Database,
  kind: string,
  workerId: string,
  limit = 1,
  staleAfterMs = 5 * 60_000,
): Promise<JobRow[]> {
  const rows = await db.execute<{
    id: string;
    org_id: string | null;
    kind: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>(sql`
    update ${jobs} set status = 'running', locked_by = ${workerId}, locked_at = now(), attempts = attempts + 1
    where id in (
      select id from ${jobs}
      where kind = ${kind}
        and run_after <= now()
        and (status = 'queued'
             or (status = 'running' and locked_at < now() - make_interval(secs => ${staleAfterMs / 1000})))
      order by priority desc, run_after
      limit ${limit}
      for update skip locked
    )
    returning id, org_id, kind, payload, attempts, max_attempts`);
  return rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    kind: r.kind,
    payload: r.payload,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
  }));
}

export async function completeJob(db: Database, jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "done", finishedAt: new Date(), lockedBy: null, lockedAt: null, lastError: null })
    .where(eq(jobs.id, jobId));
}

/** Records a failure; retries with exponential back-off until attempts run out. */
export async function failJob(db: Database, job: JobRow, error: string): Promise<"retry" | "failed"> {
  const exhausted = job.attempts >= job.maxAttempts;
  const delayMs = Math.min(2 ** job.attempts * 5_000, 10 * 60_000);
  await db
    .update(jobs)
    .set({
      status: exhausted ? "failed" : "queued",
      lastError: error.slice(0, 2000),
      lockedBy: null,
      lockedAt: null,
      runAfter: new Date(Date.now() + delayMs),
      ...(exhausted ? { finishedAt: new Date() } : {}),
    })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, "running")));
  return exhausted ? "failed" : "retry";
}
