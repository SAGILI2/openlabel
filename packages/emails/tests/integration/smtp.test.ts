import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMailTransport, renderEmail } from "../../src/index.js";

/**
 * Sends through real SMTP to Mailpit (a local mail catcher) and reads the message back over its
 * API. Uses MAILPIT_URL/MAILPIT_SMTP when set (CI service), otherwise starts a container.
 */
let api: string;
let smtpHost: string;
let smtpPort: number;
let stop = () => undefined as unknown;

beforeAll(async () => {
  if (process.env.MAILPIT_URL && process.env.MAILPIT_SMTP) {
    api = process.env.MAILPIT_URL;
    const [host, port] = process.env.MAILPIT_SMTP.split(":");
    smtpHost = host ?? "localhost";
    smtpPort = Number(port);
  } else {
    const id = execFileSync(
      "docker",
      ["run", "-d", "--rm", "-p", "58025:8025", "-p", "51025:1025", "axllent/mailpit:v1.27"],
      { encoding: "utf8" },
    ).trim();
    stop = () => execFileSync("docker", ["rm", "-f", id], { stdio: "ignore" });
    api = "http://localhost:58025";
    smtpHost = "localhost";
    smtpPort = 51025;
  }
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(`${api}/api/v1/messages`)).ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("Mailpit didn't start");
    await new Promise((r) => setTimeout(r, 300));
  }
  await fetch(`${api}/api/v1/messages`, { method: "DELETE" });
}, 60_000);

afterAll(() => {
  stop();
});

describe("smtp transport", () => {
  it("delivers HTML and text over SMTP", async () => {
    const transport = createMailTransport(
      {
        MAIL_TRANSPORT: "smtp",
        MAIL_FROM: "OpenLabel <no-reply@x.test>",
        MAIL_REDIRECT_ALL_TO: undefined,
        SMTP_HOST: smtpHost,
        SMTP_PORT: smtpPort,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SMTP_SECURE: false,
      },
      () => undefined,
    );
    const mail = await renderEmail("reset-password", { name: "Ada", url: "https://ol.test/reset/t1" });
    await transport.send({ ...mail, to: "ada@x.test" });

    const list = (await (await fetch(`${api}/api/v1/messages`)).json()) as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    const msg = list.messages[0];
    expect(msg?.Subject).toBe("Reset your OpenLabel password");
    expect(msg?.To[0]?.Address).toBe("ada@x.test");
    const full = (await (await fetch(`${api}/api/v1/message/${msg?.ID ?? ""}`)).json()) as {
      HTML: string;
      Text: string;
    };
    expect(full.HTML).toContain("https://ol.test/reset/t1");
    expect(full.Text).toContain("https://ol.test/reset/t1");
  });
});
