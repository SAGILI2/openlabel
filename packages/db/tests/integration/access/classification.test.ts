import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  AccessError,
  cleanClasses,
  createOrganization,
  createProject,
  registerAsset,
  resolveOrgScope,
  saveAnnotation,
  setProjectClasses,
} from "../../../src/access/index.js";
import { jobs, users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

async function setup() {
  const [ada] = await conn.db.insert(users).values({ email: "ada@x.test", name: "Ada" }).returning();
  if (!ada) throw new Error("seed failed");
  const org = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
  const scope = await resolveOrgScope(conn.db, ada.id, org.id);
  const project = await createProject(scope, {
    name: "Mail room",
    slug: "mail",
    description: "",
    modality: "document",
    taskType: "document.classification",
    classes: [{ name: "Invoice" }, { name: "Receipt" }, { name: " invoice " }],
  });
  return { scope, project };
}

async function expectCode(promise: Promise<unknown>, code: AccessError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AccessError && e.code === code);
}

beforeAll(async () => {
  pg = await startPostgres(55439, "classification_test");
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

describe("classification projects", () => {
  it("derives class keys from names and drops duplicates", async () => {
    const { project } = await setup();
    expect(project.classes).toEqual([
      { key: "invoice", name: "Invoice" },
      { key: "receipt", name: "Receipt" },
    ]);
    expect(cleanClasses([{ name: "Credit note" }, { name: "  " }])).toEqual([
      { key: "credit_note", name: "Credit note" },
    ]);
  });

  it("starts uploads at to-do without queueing OCR", async () => {
    const { scope, project } = await setup();
    const { asset } = await registerAsset(scope, {
      projectId: project.id,
      kind: "image",
      storageKey: "k/a",
      sha256: "a",
      byteSize: 1,
      mimeType: "image/png",
      originalName: "a.png",
      mediaMeta: {},
    });
    expect(asset.status).toBe("in_progress");
    expect(await conn.db.select().from(jobs).where(eq(jobs.kind, "prelabel"))).toEqual([]);
  });

  it("renames freely but refuses to remove a class already used in labels", async () => {
    const { scope, project } = await setup();
    const { asset } = await registerAsset(scope, {
      projectId: project.id,
      kind: "image",
      storageKey: "k/b",
      sha256: "b",
      byteSize: 1,
      mimeType: "image/png",
      originalName: "b.png",
      mediaMeta: {},
    });
    await saveAnnotation(scope, asset.id, { labels: ["invoice"] }, 0);

    const renamed = await setProjectClasses(scope, project.id, {
      classes: [
        { key: "invoice", name: "Supplier invoice" },
        { key: "receipt", name: "Receipt" },
      ],
      multiLabel: true,
    });
    expect(renamed.classes[0]).toEqual({ key: "invoice", name: "Supplier invoice" });
    expect(renamed.multiLabel).toBe(true);

    await expectCode(
      setProjectClasses(scope, project.id, {
        classes: [{ key: "receipt", name: "Receipt" }],
        multiLabel: true,
      }),
      "CONFLICT",
    );
    // An unused class can go.
    const trimmed = await setProjectClasses(scope, project.id, {
      classes: [{ key: "invoice", name: "Supplier invoice" }],
      multiLabel: false,
    });
    expect(trimmed.classes.map((c) => c.key)).toEqual(["invoice"]);
    await expectCode(setProjectClasses(scope, project.id, { classes: [], multiLabel: false }), "CONFLICT");
  });
});
