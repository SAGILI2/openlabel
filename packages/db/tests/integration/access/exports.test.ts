import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  AccessError,
  createExport,
  createOrganization,
  createProject,
  getExport,
  loadExportJob,
  registerAsset,
  resolveOrgScope,
  saveAnnotation,
  submitForReview,
} from "../../../src/access/index.js";
import { users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

const file = (sha: string) => ({
  kind: "image" as const,
  storageKey: `k/${sha}`,
  sha256: sha,
  byteSize: 1,
  mimeType: "image/png",
  originalName: `${sha}.png`,
  mediaMeta: { width: 10, height: 10 },
});

const allTrain = (ids: string[]) => new Map(ids.map((id) => [id, "train" as const]));

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
  return { scope, project };
}

beforeAll(async () => {
  pg = await startPostgres(55436, "exports_test");
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

describe("exports", () => {
  it("refuses an export with nothing labelled", async () => {
    const { scope, project } = await setup();
    await registerAsset(scope, { projectId: project.id, ...file("a") });
    await expect(
      createExport(scope, {
        projectId: project.id,
        include: "reviewed",
        name: "x",
        format: "jsonl",
        options: {},
        assign: allTrain,
      }),
    ).rejects.toSatisfy((e: unknown) => e instanceof AccessError && e.code === "CONFLICT");
  });

  it("freezes the annotation version at creation time", async () => {
    const { scope, project } = await setup();
    const { asset } = await registerAsset(scope, { projectId: project.id, ...file("a") });
    await registerAsset(scope, { projectId: project.id, ...file("unlabelled") });
    await saveAnnotation(scope, asset.id, { tags: [], regions: [], marker: "v1" }, 0);
    await submitForReview(scope, asset.id, []);

    const exp = await createExport(scope, {
      projectId: project.id,
      include: "reviewed",
      name: "first",
      format: "jsonl",
      options: {},
      assign: allTrain,
    });
    expect(exp.itemCount).toBe(1);

    await saveAnnotation(scope, asset.id, { tags: [], regions: [], marker: "v2" }, 1);
    const job = await loadExportJob(conn.db, exp.id);
    expect(job?.items.map((i) => [i.annotationVersion, i.annotation.marker])).toEqual([[1, "v1"]]);
    const [queued] = await conn.sql<
      { n: number }[]
    >`select count(*)::int as n from jobs where kind = 'export'`;
    expect(queued?.n).toBe(1);
  });

  it("keeps exports inside their organisation", async () => {
    const { scope, project } = await setup();
    const { asset } = await registerAsset(scope, { projectId: project.id, ...file("a") });
    await saveAnnotation(scope, asset.id, { tags: [], regions: [] }, 0);
    await submitForReview(scope, asset.id, []);
    const exp = await createExport(scope, {
      projectId: project.id,
      include: "reviewed",
      name: "x",
      format: "jsonl",
      options: {},
      assign: allTrain,
    });
    const [bob] = await conn.db.insert(users).values({ email: "bob@x.test", name: "Bob" }).returning();
    if (!bob) throw new Error("seed failed");
    const other = await createOrganization(conn.db, bob.id, { name: "O", slug: "o" });
    const bobScope = await resolveOrgScope(conn.db, bob.id, other.id);
    await expect(getExport(bobScope, exp.id)).rejects.toThrow(AccessError);
    await expect(
      createExport(bobScope, {
        projectId: project.id,
        include: "reviewed",
        name: "y",
        format: "jsonl",
        options: {},
        assign: allTrain,
      }),
    ).rejects.toThrow(AccessError);
  });

  it("exports approved pages only by default", async () => {
    const { scope, project } = await setup();
    const { asset } = await registerAsset(scope, { projectId: project.id, ...file("a") });
    await saveAnnotation(scope, asset.id, { tags: [], regions: [] }, 0);
    await expect(
      createExport(scope, {
        projectId: project.id,
        name: "x",
        format: "jsonl",
        options: {},
        assign: allTrain,
      }),
    ).rejects.toThrow(/No approved pages/);
    await conn.sql`update assets set status = 'approved' where id = ${asset.id}`;
    const exp = await createExport(scope, {
      projectId: project.id,
      name: "x",
      format: "jsonl",
      options: {},
      assign: allTrain,
    });
    expect(exp.itemCount).toBe(1);
  });
});
