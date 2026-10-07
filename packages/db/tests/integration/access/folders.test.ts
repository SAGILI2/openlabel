import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  AccessError,
  createExport,
  createFolder,
  createOrganization,
  createProject,
  deleteFolder,
  ensureFolderPath,
  folderTree,
  listAssets,
  moveAssets,
  registerAsset,
  renameFolder,
  resolveOrgScope,
  saveAnnotation,
  submitForReview,
  subtreeFolderIds,
} from "../../../src/access/index.js";
import { users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

const file = (sha: string, folderId: string | null = null) => ({
  folderId,
  kind: "image" as const,
  storageKey: `k/${sha}`,
  sha256: sha,
  byteSize: 1,
  mimeType: "image/png",
  originalName: `${sha}.png`,
  mediaMeta: {},
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
  return { ada, scope, project };
}

async function expectCode(p: Promise<unknown>, code: AccessError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AccessError && e.code === code);
}

beforeAll(async () => {
  pg = await startPostgres(55437, "folders_test");
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

describe("folders", () => {
  it("creates nested folders and refuses duplicates or slashes", async () => {
    const { scope, project } = await setup();
    const july = await createFolder(scope, project.id, null, "2026-07");
    const ca = await createFolder(scope, project.id, july.id, " CA ");
    expect(ca.path).toBe("2026-07/CA");
    await expectCode(createFolder(scope, project.id, july.id, "CA"), "CONFLICT");
    await expectCode(createFolder(scope, project.id, null, "a/b"), "CONFLICT");
  });

  it("creates missing levels for an uploaded folder path, idempotently and concurrently", async () => {
    const { scope, project } = await setup();
    const results = await Promise.all([
      ensureFolderPath(scope, project.id, "scans/2026/july"),
      ensureFolderPath(scope, project.id, "scans/2026/july"),
      ensureFolderPath(scope, project.id, "scans/2026/august"),
    ]);
    expect(results[0]?.id).toBe(results[1]?.id);
    const tree = await folderTree(scope, project.id);
    expect(tree.roots.map((r) => r.path)).toEqual(["scans"]);
    expect(tree.roots[0]?.children[0]?.children.map((c) => c.name)).toEqual(["august", "july"]);
  });

  it("renames a folder and rewrites every descendant path", async () => {
    const { scope, project } = await setup();
    const leaf = await ensureFolderPath(scope, project.id, "a/b/c");
    const a = (await folderTree(scope, project.id)).roots[0];
    if (!a || !leaf) throw new Error("setup failed");
    await renameFolder(scope, project.id, a.id, "z");
    const tree = await folderTree(scope, project.id);
    expect(tree.roots[0]?.path).toBe("z");
    expect(tree.roots[0]?.children[0]?.children[0]?.path).toBe("z/b/c");
  });

  it("counts files per folder including sub-folders", async () => {
    const { scope, project } = await setup();
    const ca = await ensureFolderPath(scope, project.id, "july/CA");
    const july = (await folderTree(scope, project.id)).roots[0];
    if (!ca || !july) throw new Error("setup failed");
    await registerAsset(scope, { projectId: project.id, ...file("1", ca.id) });
    await registerAsset(scope, { projectId: project.id, ...file("2", ca.id) });
    await registerAsset(scope, { projectId: project.id, ...file("3", july.id) });
    await registerAsset(scope, { projectId: project.id, ...file("4") });
    const tree = await folderTree(scope, project.id);
    expect([tree.totalCount, tree.rootFileCount]).toEqual([4, 1]);
    expect([tree.roots[0]?.fileCount, tree.roots[0]?.totalCount]).toEqual([1, 3]);
    expect(await listAssets(scope, project.id, null)).toHaveLength(1);
    expect(
      await listAssets(scope, project.id, await subtreeFolderIds(scope, project.id, july.id)),
    ).toHaveLength(3);
  });

  it("moves files and only deletes empty folders", async () => {
    const { scope, project } = await setup();
    const f = await createFolder(scope, project.id, null, "inbox");
    const { asset } = await registerAsset(scope, { projectId: project.id, ...file("1", f.id) });
    await expectCode(deleteFolder(scope, project.id, f.id), "CONFLICT");
    expect(await moveAssets(scope, project.id, [asset.id], null)).toBe(1);
    await deleteFolder(scope, project.id, f.id);
    expect((await folderTree(scope, project.id)).roots).toEqual([]);
  });

  it("exports only the chosen folders", async () => {
    const { scope, project } = await setup();
    const a = await createFolder(scope, project.id, null, "a");
    const b = await createFolder(scope, project.id, null, "b");
    for (const [sha, folder] of [
      ["1", a.id],
      ["2", b.id],
    ] as const) {
      const { asset } = await registerAsset(scope, { projectId: project.id, ...file(sha, folder) });
      await saveAnnotation(scope, asset.id, { tags: [], regions: [] }, 0);
      await submitForReview(scope, asset.id, []);
    }
    const exp = await createExport(scope, {
      projectId: project.id,
      include: "reviewed",
      name: "a only",
      format: "jsonl",
      options: {},
      folderIds: [a.id],
      assign: (ids) => new Map(ids.map((id) => [id, "train" as const])),
    });
    expect(exp.itemCount).toBe(1);
  });

  it("keeps folders inside their project and organisation", async () => {
    const { scope, project } = await setup();
    const f = await createFolder(scope, project.id, null, "mine");
    const [bob] = await conn.db.insert(users).values({ email: "bob@x.test", name: "Bob" }).returning();
    if (!bob) throw new Error("seed failed");
    const other = await createOrganization(conn.db, bob.id, { name: "O", slug: "o" });
    const bobScope = await resolveOrgScope(conn.db, bob.id, other.id);
    await expectCode(folderTree(bobScope, project.id), "NOT_FOUND");
    await expectCode(renameFolder(bobScope, project.id, f.id, "x"), "NOT_FOUND");
    await expectCode(
      registerAsset(scope, { projectId: project.id, ...file("x", "00000000-0000-0000-0000-000000000000") }),
      "NOT_FOUND",
    );
  });
});
