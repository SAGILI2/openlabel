import { execFileSync } from "node:child_process";
import postgres from "postgres";

/**
 * Throwaway Postgres for integration tests: TEST_DATABASE_URL (CI service container)
 * or a fresh Docker container on the given port.
 */
export async function startPostgres(port: number): Promise<{ url: string; stop: () => void }> {
  const fromEnv = process.env.TEST_DATABASE_URL;
  if (fromEnv) {
    // Own database on the shared server, so suites in other packages can run in parallel.
    await waitFor(fromEnv);
    const name = `auth_test_${String(process.pid)}`;
    const admin = postgres(fromEnv, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`drop database if exists ${name}`);
    await admin.unsafe(`create database ${name}`);
    await admin.end();
    const url = new URL(fromEnv);
    url.pathname = `/${name}`;
    return { url: url.toString(), stop: () => undefined };
  }
  const id = execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "-e",
      "POSTGRES_PASSWORD=test",
      "-e",
      "POSTGRES_DB=auth_test",
      "-p",
      `${String(port)}:5432`,
      "postgres:17-alpine",
    ],
    { encoding: "utf8" },
  ).trim();
  const url = `postgres://postgres:test@localhost:${String(port)}/auth_test`;
  await waitFor(url);
  return { url, stop: () => execFileSync("docker", ["rm", "-f", id], { stdio: "ignore" }) };
}

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => undefined });
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

/** Empties every application table between tests. */
export async function truncateAll(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql`truncate users, organizations, rate_limits, verifications restart identity cascade`;
  } finally {
    await sql.end();
  }
}
