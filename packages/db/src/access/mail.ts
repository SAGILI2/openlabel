import { eq } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { jobs } from "../schema/index.js";
import { enqueueJob } from "./jobs.js";

/** Job kind for queued email; the worker renders and sends it (see @openlabel/emails). */
export const SEND_EMAIL_JOB = "send-email";

type Executor = Pick<Database, "insert" | "update" | "select" | "execute">;

export interface QueuedEmail {
  orgId: string | null;
  to: string;
  /** Template name in @openlabel/emails. */
  template: string;
  /**
   * Template props. A `path` (e.g. "/invite/abc") is turned into an absolute `url` with APP_URL by
   * the worker, so callers here never need to know the public origin.
   */
  props: Record<string, unknown>;
  /** Send no earlier than this (scheduled mail). */
  sendAt?: Date;
  /** Repeated keys are ignored, so a retried request can't send the same mail twice. */
  dedupeKey?: string;
}

/**
 * Queues an email. Pass the transaction that records the event, so the mail exists exactly when
 * the event does (no mail for a rolled-back invite, no lost mail for a committed one).
 */
export async function queueEmail(db: Executor, mail: QueuedEmail): Promise<void> {
  await enqueueJob(db, {
    orgId: mail.orgId,
    kind: SEND_EMAIL_JOB,
    payload: { to: mail.to, template: mail.template, props: mail.props },
    ...(mail.dedupeKey ? { dedupeKey: `mail:${mail.dedupeKey}` } : {}),
    ...(mail.sendAt ? { runAfter: mail.sendAt } : {}),
  });
}

/**
 * Drops the message body from a sent email job. Payloads can hold one-time links (invites,
 * password resets); once delivered they shouldn't sit in the jobs table.
 */
export async function redactSentEmail(db: Database, jobId: string): Promise<void> {
  const [row] = await db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.id, jobId));
  if (!row) return;
  await db
    .update(jobs)
    .set({ payload: { to: row.payload.to, template: row.payload.template, redacted: true } })
    .where(eq(jobs.id, jobId));
}
