import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "@openlabel/contracts";
import { createDb } from "@openlabel/db";
import { runMigrations } from "@openlabel/db/migrate";
import { createAuth } from "@/server/auth/auth";
import { startPostgres, truncateAll } from "../../../support/postgres";

const APP_URL = "http://localhost:3999";
const PASSWORD = "integration-test-pass";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

function authWith(env: Record<string, string> = {}) {
  const cfg = loadConfig({
    DATABASE_URL: pg.url,
    STORAGE_DRIVER: "local",
    APP_URL,
    AUTH_SECRET: "integration-test-secret-integration-test",
    ...env,
  });
  return createAuth(cfg, conn.db);
}

function post(auth: ReturnType<typeof authWith>, path: string, body: unknown, cookie?: string) {
  return auth.handler(
    new Request(`${APP_URL}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP_URL,
        "x-forwarded-for": `10.0.0.${String(Math.floor(Math.random() * 250))}`,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

function cookiesOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

beforeAll(async () => {
  pg = await startPostgres(55433);
  await runMigrations(pg.url);
  conn = createDb({ url: pg.url, max: 2 });
});

afterAll(async () => {
  await conn.close();
  pg.stop();
});

beforeEach(async () => {
  await truncateAll(pg.url);
});

describe("auth", () => {
  it("signs up, signs in and stores an argon2id hash", async () => {
    const auth = authWith();
    expect(
      (await post(auth, "/sign-up/email", { name: "A", email: "a@x.test", password: PASSWORD })).status,
    ).toBe(200);
    const signIn = await post(auth, "/sign-in/email", { email: "a@x.test", password: PASSWORD });
    expect(signIn.status).toBe(200);
    const [row] = await conn.sql<{ password: string }[]>`select password from accounts`;
    expect(row?.password).toMatch(/^\$argon2id\$/);
  });

  it("answers a duplicate sign-up exactly like a new one, without creating a second user", async () => {
    const auth = authWith();
    await post(auth, "/sign-up/email", { name: "A", email: "a@x.test", password: PASSWORD });
    const dup = await post(auth, "/sign-up/email", { name: "B", email: "a@x.test", password: PASSWORD });
    expect(dup.status).toBe(200);
    expect(((await dup.json()) as { token: unknown }).token).toBeNull();
    const [count] = await conn.sql<{ n: number }[]>`select count(*)::int as n from users`;
    expect(count?.n).toBe(1);
  });

  it("gives the same error for an unknown email and a wrong password", async () => {
    const auth = authWith();
    await post(auth, "/sign-up/email", { name: "A", email: "a@x.test", password: PASSWORD });
    const wrong = await post(auth, "/sign-in/email", { email: "a@x.test", password: "nope-nope-nope" });
    const unknown = await post(auth, "/sign-in/email", { email: "b@x.test", password: "nope-nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("enforces the configured minimum password length", async () => {
    const auth = authWith({ AUTH_PASSWORD_MIN_LENGTH: "6" });
    expect(
      (await post(auth, "/sign-up/email", { name: "A", email: "a@x.test", password: "12345" })).status,
    ).toBe(400);
    expect(
      (await post(auth, "/sign-up/email", { name: "A", email: "a@x.test", password: "123456" })).status,
    ).toBe(200);
  });

  it("lets only the first user register when sign-up is closed", async () => {
    const auth = authWith({ AUTH_ALLOW_SIGNUP: "false" });
    expect(
      (await post(auth, "/sign-up/email", { name: "Owner", email: "o@x.test", password: PASSWORD })).status,
    ).toBe(200);
    await post(auth, "/sign-up/email", { name: "Other", email: "p@x.test", password: PASSWORD });
    const emails = await conn.sql<{ email: string }[]>`select email from users`;
    expect(emails.map((e) => e.email)).toEqual(["o@x.test"]);
  });

  it("revokes all sessions on sign-out everywhere", async () => {
    const auth = authWith();
    await post(auth, "/sign-up/email", { name: "A", email: "a@x.test", password: PASSWORD });
    const first = cookiesOf(await post(auth, "/sign-in/email", { email: "a@x.test", password: PASSWORD }));
    await post(auth, "/sign-in/email", { email: "a@x.test", password: PASSWORD });
    const [before] = await conn.sql<{ n: number }[]>`select count(*)::int as n from sessions`;
    expect(before?.n).toBe(2);
    expect((await post(auth, "/revoke-sessions", {}, first)).status).toBe(200);
    const [after] = await conn.sql<{ n: number }[]>`select count(*)::int as n from sessions`;
    expect(after?.n).toBe(0);
  });
});
