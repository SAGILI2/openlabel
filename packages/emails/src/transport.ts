import type { Config } from "@openlabel/contracts";
import { createTransport } from "nodemailer";
import type { RenderedEmail } from "./render.js";

export interface OutgoingMail extends RenderedEmail {
  to: string;
}

/** Where mail goes. Swappable so tests and development never need a real provider. */
export interface MailTransport {
  readonly name: string;
  send(mail: OutgoingMail): Promise<void>;
}

type MailConfig = Pick<
  Config,
  | "MAIL_TRANSPORT"
  | "MAIL_FROM"
  | "MAIL_REDIRECT_ALL_TO"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASSWORD"
  | "SMTP_SECURE"
>;

/**
 * Builds the transport chosen by MAIL_TRANSPORT. With MAIL_REDIRECT_ALL_TO set, every message goes
 * to that inbox instead, with the intended recipient noted in the subject.
 */
export function createMailTransport(
  cfg: MailConfig,
  log: (msg: string, fields?: Record<string, unknown>) => void,
): MailTransport {
  const base = baseTransport(cfg, log);
  const redirect = cfg.MAIL_REDIRECT_ALL_TO;
  if (!redirect) return base;
  return {
    name: `${base.name}+redirect`,
    send: (mail) => base.send({ ...mail, to: redirect, subject: `[to ${mail.to}] ${mail.subject}` }),
  };
}

function baseTransport(
  cfg: MailConfig,
  log: (msg: string, fields?: Record<string, unknown>) => void,
): MailTransport {
  switch (cfg.MAIL_TRANSPORT) {
    case "noop":
      return { name: "noop", send: () => Promise.resolve() };
    case "log":
      return {
        name: "log",
        send: (mail) => {
          // Development: the text version carries the links, so flows can be followed from the log.
          log("mail (not sent, MAIL_TRANSPORT=log)", { to: mail.to, subject: mail.subject, text: mail.text });
          return Promise.resolve();
        },
      };
    case "smtp": {
      const smtp = createTransport({
        host: cfg.SMTP_HOST,
        port: cfg.SMTP_PORT,
        secure: cfg.SMTP_SECURE,
        ...(cfg.SMTP_USER && cfg.SMTP_PASSWORD
          ? { auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASSWORD } }
          : {}),
      });
      return {
        name: "smtp",
        send: async (mail) => {
          await smtp.sendMail({
            from: cfg.MAIL_FROM,
            to: mail.to,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          });
        },
      };
    }
  }
}
