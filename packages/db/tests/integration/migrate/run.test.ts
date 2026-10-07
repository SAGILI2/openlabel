import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { runMigrations } from "../../../src/migrate/run.js";

/**
 * Applies the real migrations to a throwaway Postgres container and checks the result.
 * Uses TEST_DATABASE_URL when provided (CI service container); otherwise starts one with Docker.
 */
const IMAGE = "postgres:17-alpine";
const PORT = 55432;
let containerId: string | undefined;
let url = process.env.TEST_DATABASE_URL ?? "";

async function waitForPostgres(target: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const sql = postgres(target, { max: 1, connect_timeout: 2, onnotice: () => undefined });
    try {
      await sql`select 1`;
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
}

beforeAll(async () => {
  if (!url) {
    containerId = execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--rm",
        "-e",
        "POSTGRES_PASSWORD=test",
        "-e",
        "POSTGRES_DB=openlabel_test",
        "-p",
        `${PORT}:5432`,
        IMAGE,
      ],
      { encoding: "utf8" },
    ).trim();
    url = `postgres://postgres:test@localhost:${PORT}/openlabel_test`;
  }
  await waitForPostgres(url);
}, 120_000);

afterAll(() => {
  if (containerId) execFileSync("docker", ["rm", "-f", containerId], { stdio: "ignore" });
});

describe("runMigrations", () => {
  it("creates every table from an empty database", async () => {
    await runMigrations(url);
    const sql = postgres(url, { max: 1 });
    try {
      const rows = await sql<{ table_name: string }[]>`
        select table_name from information_schema.tables where table_schema = 'public' order by table_name`;
      expect(rows.map((r) => r.table_name)).toEqual([
        "accounts",
        "annotations",
        "assets",
        "audit_events",
        "export_items",
        "exports",
        "invitations",
        "jobs",
        "memberships",
        "organizations",
        "predictions",
        "projects",
        "rate_limits",
        "sessions",
        "two_factors",
        "users",
        "verifications",
      ]);
    } finally {
      await sql.end();
    }
  });

  it("is idempotent when run again", async () => {
    await expect(runMigrations(url)).resolves.toBeUndefined();
  });

  it("enforces one membership per org and user", async () => {
    const sql = postgres(url, { max: 1 });
    try {
      const [org] = await sql<
        { id: string }[]
      >`insert into organizations (name, slug) values ('Acme', 'acme') returning id`;
      const [user] = await sql<
        { id: string }[]
      >`insert into users (email, name) values ('a@example.com', 'A') returning id`;
      if (!org || !user) throw new Error("seed failed");
      await sql`insert into memberships (org_id, user_id, role) values (${org.id}, ${user.id}, 'owner')`;
      await expect(
        sql`insert into memberships (org_id, user_id, role) values (${org.id}, ${user.id}, 'viewer')`,
      ).rejects.toThrow(/memberships_org_user_uq/);
    } finally {
      await sql.end();
    }
  });

  it("keeps a project's task type consistent with its modality", async () => {
    const sql = postgres(url, { max: 1 });
    try {
      const [org] = await sql<
        { id: string }[]
      >`insert into organizations (name, slug) values ('T', 'task-org') returning id`;
      if (!org) throw new Error("seed failed");
      await sql`insert into projects (org_id, name, slug, modality, task) values (${org.id}, 'A', 'a', 'image', 'image.detection')`;
      await expect(
        sql`insert into projects (org_id, name, slug, modality, task) values (${org.id}, 'B', 'b', 'audio', 'image.detection')`,
      ).rejects.toThrow(/projects_task_type_matches_modality/);
      await expect(
        sql`insert into projects (org_id, name, slug, modality, task) values (${org.id}, 'C', 'c', 'image', 'imageXdetection')`,
      ).rejects.toThrow(/projects_task_type_matches_modality/);
    } finally {
      await sql.end();
    }
  });
});
