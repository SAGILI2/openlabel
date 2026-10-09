import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  claimJobs,
  completeJob,
  countNoText,
  createOrganization,
  createProject,
  loadPrelabelTarget,
  orientationStats,
  queueReocr,
  registerAsset,
  reocrTurned,
  resolveOrgScope,
  storePrediction,
} from "../../../src/access/index.js";
import { jobs, users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

beforeAll(async () => {
  pg = await startPostgres(55441, "reocr_test");
  await runMigrations(pg.url);
  conn = createDb({ url: pg.url, max: 2 });
});

afterAll(async () => {
  await conn.close();
  pg.stop();
});

beforeEach(async () => {
  await conn.sql`truncate users, organizations, jobs, audit_events restart identity cascade`;
});

const orientation = (predicted: number, applied: number, method = "model") => ({
  meta: {
    orientation: { model: "m", predicted, predictedConf: 0.9, applied, method, candidates: [] },
  },
});

async function setup() {
  const [ada] = await conn.db.insert(users).values({ email: "ada@x.test", name: "Ada" }).returning();
  if (!ada) throw new Error("seed failed");
  const org = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
  const scope = await resolveOrgScope(conn.db, ada.id, org.id);
  const project = await createProject(scope, {
    name: "P",
    slug: "p",
    description: "",
    modality: "document",
    taskType: "document.ocr",
  });
  /** Registers a file and stores an OCR result for it, as the worker would. */
  const read = async (sha: string, words: number, result: Record<string, unknown> = {}) => {
    const { asset } = await registerAsset(scope, {
      projectId: project.id,
      kind: "image",
      storageKey: `k/${sha}`,
      sha256: sha,
      byteSize: 1,
      mimeType: "image/png",
      originalName: `${sha}.png`,
      mediaMeta: {},
    });
    const [job] = await claimJobs(conn.db, "prelabel", "w");
    const target = await loadPrelabelTarget(conn.db, asset.id);
    if (!job || !target) throw new Error("setup failed");
    await storePrediction(conn.db, target, {
      engine: "doctr",
      engineVersion: "1",
      result: { lines: [], ...result },
      minConf: words ? 0.9 : null,
      latencyMs: 1,
      words,
    });
    await completeJob(conn.db, job.id);
    return asset.id;
  };
  return { scope, project, read };
}

describe("re-running OCR", () => {
  it("finds files with no text and queues each once", async () => {
    const { scope, project, read } = await setup();
    const empty = await read("a", 0);
    await read("b", 12);
    expect(await countNoText(scope, project.id)).toBe(1);

    expect(await queueReocr(scope, project.id, "no-text")).toEqual({ queued: 1, skipped: 0 });
    // Already waiting: not queued twice.
    expect(await queueReocr(scope, project.id, { assetIds: [empty] })).toEqual({ queued: 0, skipped: 1 });
    const queued = await conn.db
      .select({ payload: jobs.payload })
      .from(jobs)
      .where(eq(jobs.status, "queued"));
    expect(queued.map((j) => j.payload)).toEqual([{ assetId: empty, reocr: true }]);
  });

  it("re-reads chosen files, and refuses files from another project", async () => {
    const { scope, project, read } = await setup();
    const a = await read("a", 5);
    const b = await read("b", 7);
    expect(await queueReocr(scope, project.id, { assetIds: [a, b] })).toEqual({ queued: 2, skipped: 0 });
    await expect(
      queueReocr(scope, project.id, { assetIds: ["00000000-0000-0000-0000-000000000000"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("turning a page by hand queues it that way and counts against the model", async () => {
    const { scope, project, read } = await setup();
    const right = await read("a", 9, orientation(90, 90));
    const wrong = await read("b", 9, orientation(90, 90));
    await read("c", 9, orientation(180, 0, "model+confidence"));

    // A plain re-run already waiting is replaced by the person's turn, which jumps the queue.
    await queueReocr(scope, project.id, { assetIds: [wrong] });
    await reocrTurned(scope, wrong, 270);
    const open = await conn.db
      .select({ priority: jobs.priority })
      .from(jobs)
      .where(eq(jobs.status, "queued"));
    expect(open).toEqual([{ priority: 10 }]);
    const [job] = await conn.db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.status, "queued"));
    expect(job?.payload).toEqual({ assetId: wrong, reocr: true, page: 1, rotate: 270 });

    const [stats] = await orientationStats(scope, project.id);
    expect(stats).toMatchObject({ model: "m", judged: 3, correct: 1, corrected: 1, turnedByPeople: 1 });
    expect(stats?.applied).toEqual({ "0": 1, "90": 1, "270": 1 });
    expect(right).toBeTruthy();
  });
});
