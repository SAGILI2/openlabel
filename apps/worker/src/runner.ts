import { claimJobs, completeJob, failJob, type Database, type JobRow } from "@openlabel/db";

export type Handler = (job: JobRow) => Promise<void>;

export interface RunnerOptions {
  db: Database;
  workerId: string;
  kind: string;
  handler: Handler;
  /** Called once when a job has used all its attempts, to mark the affected record as failed. */
  onGiveUp?: (job: JobRow, error: string) => Promise<void>;
  concurrency: number;
  idleDelayMs?: number;
  log: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Polls the queue and runs up to `concurrency` jobs at once. Stops claiming on `stop()` and
 * resolves once in-flight jobs finish, so restarts never drop work (unfinished jobs are
 * re-claimed after the stale timeout anyway).
 */
export function startRunner(opts: RunnerOptions): { stop: () => Promise<void> } {
  const idleDelay = opts.idleDelayMs ?? 1000;
  const inFlight = new Set<Promise<void>>();
  let stopping = false;

  async function runOne(job: JobRow): Promise<void> {
    try {
      await opts.handler(job);
      await completeJob(opts.db, job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcome = await failJob(opts.db, job, message);
      opts.log(`job ${outcome}`, { jobId: job.id, kind: job.kind, attempt: job.attempts, error: message });
      if (outcome === "failed") await opts.onGiveUp?.(job, message);
    }
  }

  async function loop(): Promise<void> {
    while (!stopping) {
      const free = opts.concurrency - inFlight.size;
      const jobs = free > 0 ? await claimJobs(opts.db, opts.kind, opts.workerId, free) : [];
      for (const job of jobs) {
        const p = runOne(job).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
      if (jobs.length === 0) {
        await Promise.race([new Promise((r) => setTimeout(r, idleDelay)), ...inFlight]);
      }
    }
  }

  const looping = loop().catch((err: unknown) => {
    opts.log("runner crashed", { error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  });

  return {
    stop: async () => {
      stopping = true;
      await looping;
      await Promise.allSettled(inFlight);
    },
  };
}
