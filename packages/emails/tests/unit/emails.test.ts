import { describe, expect, it } from "vitest";
import { createMailTransport, isTemplateName, renderEmail, type OutgoingMail } from "../../src/index.js";

const base = {
  MAIL_TRANSPORT: "log" as const,
  MAIL_FROM: "OpenLabel <no-reply@x.test>",
  MAIL_REDIRECT_ALL_TO: undefined,
  SMTP_HOST: undefined,
  SMTP_PORT: 587,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_SECURE: false,
};

describe("renderEmail", () => {
  it("renders an invitation as HTML and plain text with the link in both", async () => {
    const mail = await renderEmail("invitation", {
      orgName: "Acme",
      inviterName: "Ada",
      role: "admin",
      url: "https://ol.test/invite/abc",
      expiresAt: "14 Oct 2026",
    });
    expect(mail.subject).toBe("You're invited to Acme on OpenLabel");
    expect(mail.html).toContain('href="https://ol.test/invite/abc"');
    expect(mail.text).toContain("https://ol.test/invite/abc");
    expect(mail.text).toContain("as an admin");
  });

  it("escapes user-provided text", async () => {
    const mail = await renderEmail("changes-requested", {
      reviewerName: "<script>x</script>",
      projectName: "P",
      pageName: "a.png",
      comment: "<b>bold</b>",
      url: "https://ol.test/p",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("rejects a payload that doesn't match the template", async () => {
    await expect(renderEmail("reset-password", { name: "A", url: "not a url" })).rejects.toThrow();
    expect(isTemplateName("reset-password")).toBe(true);
    expect(isTemplateName("toString")).toBe(false);
  });
});

describe("createMailTransport", () => {
  const mail: OutgoingMail = { to: "real@x.test", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

  it("logs instead of sending by default", async () => {
    const logged: Record<string, unknown>[] = [];
    const t = createMailTransport(base, (_m, f) => logged.push(f ?? {}));
    await t.send(mail);
    expect(t.name).toBe("log");
    expect(logged).toEqual([{ to: "real@x.test", subject: "Hi", text: "Hi" }]);
  });

  it("redirects every message to one inbox and keeps the intended recipient in the subject", async () => {
    const logged: { to?: string; subject?: string }[] = [];
    const t = createMailTransport({ ...base, MAIL_REDIRECT_ALL_TO: "dev@x.test" }, (_m, f) =>
      logged.push(f ?? {}),
    );
    await t.send(mail);
    expect(logged[0]?.to).toBe("dev@x.test");
    expect(logged[0]?.subject).toBe("[to real@x.test] Hi");
  });
});
