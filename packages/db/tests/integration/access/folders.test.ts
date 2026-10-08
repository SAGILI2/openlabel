import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  AccessError,
  createExport,
  createFolder,
  createOrganization,
  createProject,
  assetNeighbours,
  deleteFolder,
  folderAncestors,
  folderChildren,
  projectFileCounts,
  searchFolders,
  pageAssets,
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

  it("deletes a folder with its sub-folders, files and labels when asked", async () => {
    const { scope, project } = await setup();
    const top = await ensureFolderPath(scope, project.id, "scans/2026");
    const parent = (await folderTree(scope, project.id)).roots[0];
    const { asset } = await registerAsset(scope, { projectId: project.id, ...file("9", top?.id ?? null) });
    await registerAsset(scope, { projectId: project.id, ...file("10", null) });
    await saveAnnotation(scope, asset.id, { tags: [], regions: [] }, 0);
    if (!parent) throw new Error("no folder");

    const result = await deleteFolder(scope, project.id, parent.id, { withFiles: true });
    expect(result.deletedFiles).toBe(1);
    expect(result.orphanKeys).toEqual([`k/9`]);
    expect((await folderTree(scope, project.id)).roots).toEqual([]);
    expect((await listAssets(scope, project.id)).map((a) => a.sha256)).toEqual(["10"]);
  });

  it("loads the tree one level at a time with subtree counts", async () => {
    const { scope, project } = await setup();
    const leaf = await ensureFolderPath(scope, project.id, "HDFC/ATM1");
    await ensureFolderPath(scope, project.id, "HDFC/ATM2");
    await ensureFolderPath(scope, project.id, "ICICI");
    await registerAsset(scope, { projectId: project.id, ...file("x1", leaf?.id ?? null) });
    await registerAsset(scope, { projectId: project.id, ...file("x2", leaf?.id ?? null) });
    await registerAsset(scope, { projectId: project.id, ...file("x3", null) });

    const top = await folderChildren(scope, project.id, null);
    expect(top.map((f) => [f.name, f.totalCount, f.hasChildren])).toEqual([
      ["HDFC", 2, true],
      ["ICICI", 0, false],
    ]);
    const hdfc = top[0];
    if (!hdfc) throw new Error("no HDFC");
    const kids = await folderChildren(scope, project.id, hdfc.id);
    expect(kids.map((f) => [f.path, f.totalCount, f.hasChildren])).toEqual([
      ["HDFC/ATM1", 2, false],
      ["HDFC/ATM2", 0, false],
    ]);
    expect((await folderAncestors(scope, project.id, leaf?.id ?? "")).map((f) => f.path)).toEqual([
      "HDFC",
      "HDFC/ATM1",
    ]);
    expect(await projectFileCounts(scope, project.id)).toEqual({ totalCount: 3, rootFileCount: 1 });
    expect((await searchFolders(scope, project.id, "atm")).map((f) => f.path)).toEqual([
      "HDFC/ATM1",
      "HDFC/ATM2",
    ]);
  });

  it("pages and filters files in the database", async () => {
    const { scope, project } = await setup();
    for (const n of ["p1", "p2", "p3", "p4", "p5"]) {
      await registerAsset(scope, { projectId: project.id, ...file(n, null) });
    }
    const page2 = await pageAssets(scope, project.id, { filter: "all", page: 2, pageSize: 2 });
    expect(page2.rows.map((r) => r.sha256)).toEqual(["p3", "p4"]);
    expect([page2.total, page2.counts.all, page2.counts.ocr]).toEqual([5, 5, 5]);
    const named = await pageAssets(scope, project.id, {
      filter: "all",
      page: 1,
      pageSize: 10,
      search: "P4",
      sort: "name-desc",
    });
    expect(named.rows.map((r) => r.sha256)).toEqual(["p4"]);
    const desc = await pageAssets(scope, project.id, {
      filter: "all",
      page: 1,
      pageSize: 2,
      sort: "name-desc",
    });
    expect(desc.rows.map((r) => r.sha256)).toEqual(["p5", "p4"]);
    const around = await assetNeighbours(scope, project.id, page2.rows[0]?.id ?? "", undefined, 1);
    expect(around.rows.map((r) => r.sha256)).toEqual(["p2", "p3", "p4"]);
    expect([around.index, around.total]).toEqual([1, 5]);
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
