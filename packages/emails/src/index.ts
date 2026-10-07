/**
 * Transactional email: React Email templates, rendering, and the transport that delivers them.
 * Sending is queued (`send-email` jobs) so mail is retried and can be scheduled; see the worker.
 */
export { templates, type TemplateName, type TemplateProps } from "./templates/index.js";
export { isTemplateName, renderEmail, type RenderedEmail } from "./render.js";
export { createMailTransport, type MailTransport, type OutgoingMail } from "./transport.js";

/** Job kind used for queued email. */
export const SEND_EMAIL_JOB = "send-email";
