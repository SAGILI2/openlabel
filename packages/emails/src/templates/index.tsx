import { z } from "zod";
import { Layout, P } from "./layout.js";

/**
 * Every email OpenLabel sends. Each template has a payload schema (validated again in the worker,
 * since payloads sit in the job queue as JSON), a subject and a React body.
 */
export const templates = {
  invitation: {
    schema: z.object({
      orgName: z.string(),
      inviterName: z.string(),
      role: z.string(),
      url: z.url(),
      expiresAt: z.string(),
    }),
    subject: (p: { orgName: string }) => `You're invited to ${p.orgName} on OpenLabel`,
    Body: (p: { orgName: string; inviterName: string; role: string; url: string; expiresAt: string }) => (
      <Layout
        preview={`${p.inviterName} invited you to ${p.orgName}`}
        action={{ label: "Accept invitation", href: p.url }}
        footer={`This invitation expires on ${p.expiresAt}. If you weren't expecting it, you can ignore this email.`}
      >
        <P>
          {p.inviterName} invited you to join <strong>{p.orgName}</strong> on OpenLabel as {article(p.role)}{" "}
          {p.role}.
        </P>
      </Layout>
    ),
  },
  "reset-password": {
    schema: z.object({ name: z.string(), url: z.url() }),
    subject: () => "Reset your OpenLabel password",
    Body: (p: { name: string; url: string }) => (
      <Layout
        preview="Choose a new password"
        action={{ label: "Choose a new password", href: p.url }}
        footer="The link works for one hour. If you didn't ask to reset your password, ignore this email; your password stays the same."
      >
        <P>Hi {p.name},</P>
        <P>
          Someone asked to reset the password for your OpenLabel account. Use the button to choose a new one.
        </P>
      </Layout>
    ),
  },
  "verify-email": {
    schema: z.object({ name: z.string(), url: z.url() }),
    subject: () => "Confirm your email address",
    Body: (p: { name: string; url: string }) => (
      <Layout
        preview="Confirm your email for OpenLabel"
        action={{ label: "Confirm email", href: p.url }}
        footer="If you didn't create an OpenLabel account, ignore this email."
      >
        <P>Hi {p.name},</P>
        <P>Confirm this is your email address to finish setting up your OpenLabel account.</P>
      </Layout>
    ),
  },
  "review-requested": {
    schema: z.object({
      requesterName: z.string(),
      projectName: z.string(),
      pageName: z.string(),
      url: z.url(),
    }),
    subject: (p: { projectName: string; pageName: string }) =>
      `Review requested: ${p.pageName} in ${p.projectName}`,
    Body: (p: { requesterName: string; projectName: string; pageName: string; url: string }) => (
      <Layout
        preview={`${p.requesterName} asked you to review ${p.pageName}`}
        action={{ label: "Review page", href: p.url }}
        footer="You're getting this because you were requested as a reviewer."
      >
        <P>
          {p.requesterName} asked you to review <strong>{p.pageName}</strong> in {p.projectName}.
        </P>
      </Layout>
    ),
  },
  "changes-requested": {
    schema: z.object({
      reviewerName: z.string(),
      projectName: z.string(),
      pageName: z.string(),
      comment: z.string(),
      url: z.url(),
    }),
    subject: (p: { pageName: string }) => `Changes requested on ${p.pageName}`,
    Body: (p: {
      reviewerName: string;
      projectName: string;
      pageName: string;
      comment: string;
      url: string;
    }) => (
      <Layout
        preview={`${p.reviewerName}: ${p.comment.slice(0, 80)}`}
        action={{ label: "Open page", href: p.url }}
        footer="You're getting this because you sent this page for review."
      >
        <P>
          {p.reviewerName} requested changes on <strong>{p.pageName}</strong> in {p.projectName}:
        </P>
        <P>“{p.comment}”</P>
      </Layout>
    ),
  },
} as const;

export type TemplateName = keyof typeof templates;
export type TemplateProps<T extends TemplateName> = z.infer<(typeof templates)[T]["schema"]>;

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
