import { describe, expect, it } from "vitest";
import type { JobRow } from "@openlabel/db";
import type { MailTransport, OutgoingMail } from "@openlabel/emails";
import { runSendEmail } from "../../src/jobs/send-email.js";

function job(payload: Record<string, unknown>): JobRow {
  return { id: "j1", orgId: null, kind: "send-email", payload, attempts: 1, maxAttempts: 5 };
}

function capture() {
  const sent: OutgoingMail[] = [];
  const transport: MailTransport = {
    name: "test",
    send: (m) => {
      sent.push(m);
      return Promise.resolve();
    },
  };
  return { sent, deps: { transport, appUrl: "https://ol.example.com", log: () => undefined } };
}

describe("runSendEmail", () => {
  it("turns the payload path into an absolute link and sends", async () => {
    const { sent, deps } = capture();
    await runSendEmail(
      deps,
      job({ to: "a@x.test", template: "reset-password", props: { name: "Ada", path: "/reset/abc" } }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("a@x.test");
    expect(sent[0]?.text).toContain("https://ol.example.com/reset/abc");
  });

  it("drops malformed jobs instead of retrying them forever", async () => {
    const { sent, deps } = capture();
    await runSendEmail(deps, job({ to: "a@x.test", template: "nope", props: {} }));
    await runSendEmail(deps, job({ to: "a@x.test", template: "reset-password", props: { name: "A" } }));
    expect(sent).toEqual([]);
  });

  it("lets transport failures throw so the job is retried", async () => {
    const { deps } = capture();
    const failing = {
      ...deps,
      transport: { name: "down", send: () => Promise.reject(new Error("ECONNREFUSED")) },
    };
    await expect(
      runSendEmail(
        failing,
        job({ to: "a@x.test", template: "verify-email", props: { name: "A", url: "https://x.test/v" } }),
      ),
    ).rejects.toThrow("ECONNREFUSED");
  });
});
