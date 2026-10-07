import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  AccessError,
  acceptInvitation,
  createInvitation,
  createOrganization,
  createProject,
  getReviewState,
  myReviewQueue,
  registerAsset,
  resolveOrgScope,
  reviewAsset,
  saveAnnotation,
  setReviewRules,
  submitForReview,
  submitManyForReview,
  reviewManyAssets,
  type OrgRole,
} from "../../../src/access/index.js";
import { jobs, users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

const empty = { tags: [], regions: [] };

async function makeUser(email: string) {
  const [u] = await conn.db
    .insert(users)
    .values({ email, name: email.split("@")[0] ?? email })
    .returning();
  if (!u) throw new Error("seed failed");
  return u;
}

async function join(ownerId: string, orgId: string, email: string, role: OrgRole) {
  const user = await makeUser(email);
  const invite = await createInvitation(await resolveOrgScope(conn.db, ownerId, orgId), { email, role });
  await acceptInvitation(conn.db, user, invite.token);
  return { user, scope: await resolveOrgScope(conn.db, user.id, orgId) };
}

async function setup() {
  const owner = await makeUser("owner@x.test");
  const org = await createOrganization(conn.db, owner.id, { name: "Acme", slug: "acme" });
  const ownerScope = await resolveOrgScope(conn.db, owner.id, org.id);
  const project = await createProject(ownerScope, {
    name: "P",
    slug: "p",
    description: "",
    modality: "document",
    taskType: "document.ocr",
  });
  const labeller = await join(owner.id, org.id, "lab@x.test", "labeller");
  const rev1 = await join(owner.id, org.id, "rev1@x.test", "reviewer");
  const rev2 = await join(owner.id, org.id, "rev2@x.test", "reviewer");
  const { asset } = await registerAsset(ownerScope, {
    projectId: project.id,
    kind: "image",
    storageKey: "k/a",
    sha256: "a",
    byteSize: 1,
    mimeType: "image/png",
    originalName: "a.png",
    mediaMeta: {},
  });
  await saveAnnotation(labeller.scope, asset.id, empty, 0);
  return { owner, ownerScope, project, labeller, rev1, rev2, asset };
}

async function expectCode(p: Promise<unknown>, code: AccessError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AccessError && e.code === code);
}

beforeAll(async () => {
  pg = await startPostgres(55438, "reviews_test");
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

describe("review workflow", () => {
  it("approves once the required number of reviewers approve the current version", async () => {
    const { ownerScope, project, labeller, rev1, rev2, asset } = await setup();
    await setReviewRules(ownerScope, project.id, {
      requiredApprovals: 2,
      allowSelfApproval: false,
      defaultReviewerIds: [],
    });
    await submitForReview(labeller.scope, asset.id, [rev1.user.id, rev2.user.id]);
    expect((await myReviewQueue(rev1.scope)).map((q) => q.assetId)).toEqual([asset.id]);

    const after1 = await reviewAsset(rev1.scope, asset.id, { decision: "approve", body: "", version: 1 });
    expect([after1.status, after1.approvals]).toEqual(["submitted", 1]);
    const after2 = await reviewAsset(rev2.scope, asset.id, { decision: "approve", body: "lgtm", version: 1 });
    expect([after2.status, after2.approvals]).toEqual(["approved", 2]);
    expect(await myReviewQueue(rev1.scope)).toEqual([]);
  });

  it("sends a page back when changes are requested, and needs a reason", async () => {
    const { labeller, rev1, asset } = await setup();
    await submitForReview(labeller.scope, asset.id, [rev1.user.id]);
    await expectCode(
      reviewAsset(rev1.scope, asset.id, { decision: "request_changes", body: " ", version: 1 }),
      "CONFLICT",
    );
    const state = await reviewAsset(rev1.scope, asset.id, {
      decision: "request_changes",
      body: "Line 3 date is wrong",
      version: 1,
    });
    expect(state.status).toBe("rejected");
    expect(state.history.at(-1)?.body).toBe("Line 3 date is wrong");
  });

  it("drops approvals when the labels change (stale approvals)", async () => {
    const { labeller, rev1, asset } = await setup();
    await submitForReview(labeller.scope, asset.id, [rev1.user.id]);
    await reviewAsset(rev1.scope, asset.id, { decision: "approve", body: "", version: 1 });
    await saveAnnotation(labeller.scope, asset.id, empty, 1);
    const state = await getReviewState(labeller.scope, asset.id);
    expect(state.approvals).toBe(0);
    expect(state.requested[0]?.stale).toBe(true);
    await expectCode(
      reviewAsset(rev1.scope, asset.id, { decision: "approve", body: "", version: 1 }),
      "CONFLICT",
    );
  });

  it("forbids approving your own submission unless the project allows it", async () => {
    const { ownerScope, project, asset } = await setup();
    await submitForReview(ownerScope, asset.id, []);
    await expectCode(
      reviewAsset(ownerScope, asset.id, { decision: "approve", body: "", version: 1 }),
      "FORBIDDEN",
    );
    await setReviewRules(ownerScope, project.id, {
      requiredApprovals: 1,
      allowSelfApproval: true,
      defaultReviewerIds: [],
    });
    const state = await reviewAsset(ownerScope, asset.id, { decision: "approve", body: "", version: 1 });
    expect(state.status).toBe("approved");
  });

  it("stops labellers from reviewing and from being requested as reviewers", async () => {
    const { labeller, rev1, asset } = await setup();
    await expectCode(submitForReview(rev1.scope, asset.id, [labeller.user.id]), "FORBIDDEN");
    await submitForReview(labeller.scope, asset.id, [rev1.user.id]);
    await expectCode(
      reviewAsset(labeller.scope, asset.id, { decision: "approve", body: "", version: 1 }),
      "FORBIDDEN",
    );
  });

  it("queues one email per reviewer and per version, and tells the labeller about requested changes", async () => {
    const { labeller, rev1, rev2, asset } = await setup();
    const mail = async () =>
      (await conn.db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.kind, "send-email"))).map(
        (j) => [j.payload.template, j.payload.to],
      );
    await submitForReview(labeller.scope, asset.id, [rev1.user.id, rev2.user.id]);
    await submitForReview(labeller.scope, asset.id, [rev1.user.id]); // same version: no resend
    expect((await mail()).filter(([t]) => t === "review-requested")).toEqual([
      ["review-requested", "rev1@x.test"],
      ["review-requested", "rev2@x.test"],
    ]);
    await reviewAsset(rev1.scope, asset.id, { decision: "request_changes", body: "Fix line 2", version: 1 });
    expect((await mail()).filter(([t]) => t === "changes-requested")).toEqual([
      ["changes-requested", "lab@x.test"],
    ]);
    const [job] = (
      await conn.db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.kind, "send-email"))
    ).filter((j) => j.payload.template === "review-requested");
    expect(job?.payload.props).toMatchObject({ pageName: "a.png", path: `/projects/p/label/${asset.id}` });
  });

  it("sends many pages at once, skips ones already in review or unlabelled, and emails each reviewer once", async () => {
    const { ownerScope, project, labeller, rev1, asset } = await setup();
    const extra = async (name: string) =>
      (
        await registerAsset(ownerScope, {
          projectId: project.id,
          kind: "image",
          storageKey: `k/${name}`,
          sha256: name,
          byteSize: 1,
          mimeType: "image/png",
          originalName: `${name}.png`,
          mediaMeta: {},
        })
      ).asset;
    const b = await extra("b");
    const unlabelled = await extra("c");
    await saveAnnotation(labeller.scope, b.id, empty, 0);
    await submitForReview(labeller.scope, b.id, [rev1.user.id]);
    await conn.sql`delete from jobs where kind = 'send-email'`;

    const d = await extra("d");
    await saveAnnotation(labeller.scope, d.id, empty, 0);
    const result = await submitManyForReview(
      labeller.scope,
      project.id,
      [asset.id, b.id, unlabelled.id, d.id],
      [rev1.user.id],
    );
    expect(result.sent).toBe(2);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      "Already in review.",
      "Not labelled yet (OCR draft only).",
    ]);
    expect((await getReviewState(labeller.scope, d.id)).status).toBe("submitted");
    const mail = await conn.db
      .select({ payload: jobs.payload })
      .from(jobs)
      .where(eq(jobs.kind, "send-email"));
    expect(mail).toHaveLength(1);
    expect(mail[0]?.payload).toMatchObject({ to: "rev1@x.test", props: { pageName: "2 pages" } });
  });

  it("approves many pages at once and skips ones not in review or sent by the reviewer", async () => {
    const { ownerScope, project, labeller, rev1, asset } = await setup();
    const { asset: second } = await registerAsset(ownerScope, {
      projectId: project.id,
      kind: "image",
      storageKey: "k/e",
      sha256: "e",
      byteSize: 1,
      mimeType: "image/png",
      originalName: "e.png",
      mediaMeta: {},
    });
    await saveAnnotation(labeller.scope, second.id, empty, 0);
    await submitForReview(labeller.scope, asset.id, [rev1.user.id]);

    await expectCode(
      reviewManyAssets(labeller.scope, project.id, [asset.id], { decision: "approve", body: "" }),
      "FORBIDDEN",
    );
    const result = await reviewManyAssets(rev1.scope, project.id, [asset.id, second.id], {
      decision: "approve",
      body: "",
    });
    expect(result.done).toBe(1);
    expect(result.skipped).toEqual([{ assetId: second.id, reason: "Not in review." }]);
    expect((await getReviewState(rev1.scope, asset.id)).status).toBe("approved");
  });

  it("adds the project's default reviewers on submit", async () => {
    const { ownerScope, project, labeller, rev2, asset } = await setup();
    await setReviewRules(ownerScope, project.id, {
      requiredApprovals: 1,
      allowSelfApproval: false,
      defaultReviewerIds: [rev2.user.id],
    });
    await submitForReview(labeller.scope, asset.id, []);
    const state = await getReviewState(labeller.scope, asset.id);
    expect(state.requested.map((r) => r.email)).toEqual(["rev2@x.test"]);
  });
});
