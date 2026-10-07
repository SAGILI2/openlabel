import type { JobRow } from "@openlabel/db";
import { isTemplateName, renderEmail, type MailTransport } from "@openlabel/emails";

export interface SendEmailDeps {
  transport: MailTransport;
  /** Public origin of the web app; turns a payload `path` into an absolute `url`. */
  appUrl: string;
  log: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Renders and sends one queued email. Transport errors throw so the runner retries with back-off;
 * a malformed payload can't be fixed by retrying, so it's logged and dropped.
 */
export async function runSendEmail(deps: SendEmailDeps, job: JobRow): Promise<void> {
  const { to, template, props } = job.payload;
  if (typeof to !== "string" || !isTemplateName(template) || typeof props !== "object" || props === null) {
    deps.log("email job malformed, dropping", { jobId: job.id, template });
    return;
  }
  const withUrl: Record<string, unknown> = { ...props };
  if (typeof withUrl.path === "string") {
    withUrl.url = new URL(withUrl.path, deps.appUrl).toString();
    delete withUrl.path;
  }
  let mail;
  try {
    mail = await renderEmail(template, withUrl);
  } catch (err) {
    deps.log("email payload invalid, dropping", { jobId: job.id, template, error: String(err) });
    return;
  }
  await deps.transport.send({ ...mail, to });
  deps.log("email sent", { jobId: job.id, template, transport: deps.transport.name });
}
