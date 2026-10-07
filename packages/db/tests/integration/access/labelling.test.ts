import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  AccessError,
  assetStatusCounts,
  claimJobs,
  completeJob,
  createOrganization,
  createProject,
  failJob,
  getLabellingState,
  listAssets,
  listProjects,
  loadPrelabelTarget,
  registerAsset,
  resolveOrgScope,
  saveAnnotation,
  storePrediction,
} from "../../../src/access/index.js";
import { users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

async function setup() {
  const [ada] = await conn.db.insert(users).values({ email: "ada@x.test", name: "Ada" }).returning();
  if (!ada) throw new Error("seed failed");
  const org = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
  const scope = await resolveOrgScope(conn.db, ada.id, org.id);
  const project = await createProject(scope, {
    name: "Invoices",
    slug: "invoices",
    description: "",
    modality: "document",
    taskType: "document.ocr",
  });
  return { ada, org, scope, project };
}

const file = (sha: string) => ({
  kind: "image" as const,
  storageKey: `orgs/x/${sha}`,
  sha256: sha,
  byteSize: 10,
  mimeType: "image/png",
  originalName: `${sha}.png`,
  mediaMeta: { width: 100, height: 50 },
});

async function expectCode(promise: Promise<unknown>, code: AccessError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AccessError && e.code === code);
}

beforeAll(async () => {
  pg = await startPostgres(55435, "labelling_test");
  await runMigrations(pg.url);
  conn = createDb({ url: pg.url, max: 4 });
});

afterAll(async () => {
  await conn.close();
  pg.stop();
});

beforeEach(async () => {
  await conn.sql`truncate users, organizations, jobs, audit_events restart identity cascade`;
});

describe("projects and assets", () => {
  it("registers an asset once per content hash and queues one pre-label job", async () => {
    const { scope, project } = await setup();
    const first = await registerAsset(scope, { projectId: project.id, ...file("aaa") });
    const again = await registerAsset(scope, { projectId: project.id, ...file("aaa") });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.asset.id).toBe(first.asset.id);
    const [jobs] = await conn.sql<
      { n: number }[]
    >`select count(*)::int as n from jobs where kind = 'prelabel'`;
    expect(jobs?.n).toBe(1);
    expect((await listProjects(scope))[0]?.assetCount).toBe(1);
  });

  it("keeps projects and assets inside their organisation", async () => {
    const { project, scope } = await setup();
    const asset = (await registerAsset(scope, { projectId: project.id, ...file("bbb") })).asset;
    const [bob] = await conn.db.insert(users).values({ email: "bob@x.test", name: "Bob" }).returning();
    if (!bob) throw new Error("seed failed");
    const other = await createOrganization(conn.db, bob.id, { name: "Other", slug: "other" });
    const bobScope = await resolveOrgScope(conn.db, bob.id, other.id);
    expect(await listProjects(bobScope)).toEqual([]);
    await expectCode(listAssets(bobScope, project.id), "NOT_FOUND");
    await expectCode(getLabellingState(bobScope, asset.id), "NOT_FOUND");
    await expectCode(registerAsset(bobScope, { projectId: project.id, ...file("ccc") }), "NOT_FOUND");
  });

  it("rejects a task type that doesn't match the modality", async () => {
    const { scope } = await setup();
    await expect(
      createProject(scope, {
        name: "X",
        slug: "x",
        description: "",
        modality: "audio",
        taskType: "document.ocr",
      }),
    ).rejects.toThrow();
  });
});

describe("job queue", () => {
  it("never hands the same job to two workers", async () => {
    const { scope, project } = await setup();
    for (const sha of ["1", "2", "3", "4", "5", "6"])
      await registerAsset(scope, { projectId: project.id, ...file(sha) });
    const claims = await Promise.all(["w1", "w2", "w3"].map((w) => claimJobs(conn.db, "prelabel", w, 4)));
    const ids = claims.flat().map((j) => j.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("retries a failed job later and gives up after max attempts", async () => {
    const { scope, project } = await setup();
    await registerAsset(scope, { projectId: project.id, ...file("r") });
    const [job] = await claimJobs(conn.db, "prelabel", "w1");
    if (!job) throw new Error("no job");
    expect(await failJob(conn.db, job, "boom")).toBe("retry");
    expect(await claimJobs(conn.db, "prelabel", "w1")).toEqual([]);
    expect(await failJob(conn.db, { ...job, attempts: job.maxAttempts }, "boom")).toBe("failed");
  });

  it("re-claims a job abandoned by a crashed worker", async () => {
    const { scope, project } = await setup();
    await registerAsset(scope, { projectId: project.id, ...file("s") });
    const [job] = await claimJobs(conn.db, "prelabel", "crashed");
    expect(job).toBeDefined();
    expect(await claimJobs(conn.db, "prelabel", "w2", 1, 60_000)).toEqual([]);
    const reclaimed = await claimJobs(conn.db, "prelabel", "w2", 1, 0);
    expect(reclaimed.map((j) => j.id)).toEqual([job?.id]);
  });
});

describe("labelling", () => {
  it("stores a prediction, then saves versioned annotations with conflict detection", async () => {
    const { scope, project } = await setup();
    const { asset } = await registerAsset(scope, { projectId: project.id, ...file("p") });
    const [job] = await claimJobs(conn.db, "prelabel", "w1");
    const target = await loadPrelabelTarget(conn.db, asset.id);
    if (!job || !target) throw new Error("setup failed");
    await storePrediction(conn.db, target, {
      engine: "doctr",
      engineVersion: "1",
      result: { lines: [] },
      minConf: 0.4,
      latencyMs: 12,
    });
    await completeJob(conn.db, job.id);

    const state = await getLabellingState(scope, asset.id);
    expect(state.asset.status).toBe("prelabelled");
    expect(state.prediction?.engine).toBe("doctr");
    expect(state.annotation).toBeNull();

    expect(await saveAnnotation(scope, asset.id, { regions: [] }, 0)).toEqual({ version: 1 });
    expect(await saveAnnotation(scope, asset.id, { regions: [] }, 1)).toEqual({ version: 2 });
    await expectCode(saveAnnotation(scope, asset.id, { regions: [] }, 1), "CONFLICT");
    expect((await assetStatusCounts(scope, project.id)).submitted).toBe(1);
  });
});
