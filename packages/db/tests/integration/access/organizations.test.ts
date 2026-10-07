import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import {
  AccessError,
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  createOrganization,
  listMembers,
  listRecentAudit,
  listMyOrganizations,
  listPendingInvitations,
  previewInvitation,
  removeMember,
  resolveOrgScope,
  revokeInvitation,
  type OrgRole,
} from "../../../src/access/index.js";
import { users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

async function makeUser(email: string) {
  const [u] = await conn.db
    .insert(users)
    .values({ email, name: email.split("@")[0] ?? email })
    .returning();
  if (!u) throw new Error("seed failed");
  return u;
}

async function expectCode(promise: Promise<unknown>, code: AccessError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AccessError && e.code === code);
}

/** Adds `email` to the org with `role` through a real invitation. */
async function join(ownerId: string, orgId: string, email: string, role: OrgRole) {
  const owner = await resolveOrgScope(conn.db, ownerId, orgId);
  const user = await makeUser(email);
  const invite = await createInvitation(owner, { email, role });
  await acceptInvitation(conn.db, user, invite.token);
  return user;
}

async function twoOrgs() {
  const ada = await makeUser("ada@x.test");
  const bob = await makeUser("bob@x.test");
  const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
  const bobco = await createOrganization(conn.db, bob.id, { name: "Bobco", slug: "bobco" });
  return { ada, bob, acme, bobco };
}

beforeAll(async () => {
  pg = await startPostgres(55434, "access_test");
  await runMigrations(pg.url);
  conn = createDb({ url: pg.url, max: 2 });
});

afterAll(async () => {
  await conn.close();
  pg.stop();
});

beforeEach(async () => {
  await conn.sql`truncate users, organizations, audit_events restart identity cascade`;
});

describe("organisations", () => {
  it("makes the creator the owner and lists it", async () => {
    const ada = await makeUser("ada@x.test");
    const org = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    expect(org.role).toBe("owner");
    expect(await listMyOrganizations(conn.db, ada.id)).toEqual([org]);
  });

  it("rejects a duplicate slug", async () => {
    const ada = await makeUser("ada@x.test");
    await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    await expectCode(createOrganization(conn.db, ada.id, { name: "Other", slug: "acme" }), "CONFLICT");
  });

  it("writes an audit event", async () => {
    const ada = await makeUser("ada@x.test");
    await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const [row] = await conn.sql<{ action: string }[]>`select action from audit_events`;
    expect(row?.action).toBe("organization.created");
  });
});

describe("isolation between organisations", () => {
  it("refuses a scope for an organisation the user isn't in", async () => {
    const { bob, acme } = await twoOrgs();
    await expectCode(resolveOrgScope(conn.db, bob.id, acme.id), "NOT_A_MEMBER");
  });

  it("shows each organisation only its own members and invitations", async () => {
    const { ada, bob, acme, bobco } = await twoOrgs();
    await createInvitation(await resolveOrgScope(conn.db, ada.id, acme.id), {
      email: "c@x.test",
      role: "viewer",
    });
    const bobScope = await resolveOrgScope(conn.db, bob.id, bobco.id);
    expect((await listMembers(bobScope)).map((m) => m.email)).toEqual(["bob@x.test"]);
    expect(await listPendingInvitations(bobScope)).toEqual([]);
  });

  it("can't revoke another organisation's invitation by id", async () => {
    const { ada, bob, acme, bobco } = await twoOrgs();
    const invite = await createInvitation(await resolveOrgScope(conn.db, ada.id, acme.id), {
      email: "c@x.test",
      role: "viewer",
    });
    await expectCode(
      revokeInvitation(await resolveOrgScope(conn.db, bob.id, bobco.id), invite.id),
      "NOT_FOUND",
    );
  });

  it("can't change or remove a member of another organisation", async () => {
    const { ada, bob, bobco } = await twoOrgs();
    const bobScope = await resolveOrgScope(conn.db, bob.id, bobco.id);
    await expectCode(changeMemberRole(bobScope, ada.id, "viewer"), "NOT_FOUND");
    await expectCode(removeMember(bobScope, ada.id), "NOT_FOUND");
  });
});

describe("invitations", () => {
  it("adds the invitee with the invited role", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const cy = await join(ada.id, acme.id, "cy@x.test", "labeller");
    expect((await resolveOrgScope(conn.db, cy.id, acme.id)).role).toBe("labeller");
  });

  it("stores only a hash of the token", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const invite = await createInvitation(await resolveOrgScope(conn.db, ada.id, acme.id), {
      email: "c@x.test",
      role: "viewer",
    });
    const [row] = await conn.sql<{ token_hash: string }[]>`select token_hash from invitations`;
    expect(row?.token_hash).not.toContain(invite.token);
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("can be used once only", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const cy = await makeUser("cy@x.test");
    const invite = await createInvitation(await resolveOrgScope(conn.db, ada.id, acme.id), {
      email: "cy@x.test",
      role: "viewer",
    });
    await acceptInvitation(conn.db, cy, invite.token);
    await expectCode(acceptInvitation(conn.db, cy, invite.token), "INVITATION_INVALID");
    expect(await previewInvitation(conn.db, invite.token)).toBeNull();
  });

  it("must be accepted by the invited email", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const mallory = await makeUser("mallory@x.test");
    const invite = await createInvitation(await resolveOrgScope(conn.db, ada.id, acme.id), {
      email: "cy@x.test",
      role: "admin",
    });
    await expectCode(acceptInvitation(conn.db, mallory, invite.token), "INVITATION_INVALID");
  });

  it("expires after 7 days", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const cy = await makeUser("cy@x.test");
    const invite = await createInvitation(await resolveOrgScope(conn.db, ada.id, acme.id), {
      email: "cy@x.test",
      role: "viewer",
    });
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await expectCode(acceptInvitation(conn.db, cy, invite.token, later), "INVITATION_INVALID");
  });

  it("stops working when revoked, and re-inviting replaces the old link", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const owner = await resolveOrgScope(conn.db, ada.id, acme.id);
    const first = await createInvitation(owner, { email: "cy@x.test", role: "viewer" });
    const second = await createInvitation(owner, { email: "cy@x.test", role: "reviewer" });
    expect(await previewInvitation(conn.db, first.token)).toBeNull();
    expect((await previewInvitation(conn.db, second.token))?.role).toBe("reviewer");
    await revokeInvitation(owner, second.id);
    expect(await previewInvitation(conn.db, second.token)).toBeNull();
  });

  it("only lets managers and above invite, never above their own role", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const lab = await join(ada.id, acme.id, "lab@x.test", "labeller");
    const mgr = await join(ada.id, acme.id, "mgr@x.test", "manager");
    await expectCode(
      createInvitation(await resolveOrgScope(conn.db, lab.id, acme.id), {
        email: "z@x.test",
        role: "viewer",
      }),
      "FORBIDDEN",
    );
    await expectCode(
      createInvitation(await resolveOrgScope(conn.db, mgr.id, acme.id), { email: "z@x.test", role: "admin" }),
      "FORBIDDEN",
    );
  });

  it("refuses to invite an existing member (email case-insensitive)", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    await expectCode(
      createInvitation(await resolveOrgScope(conn.db, ada.id, acme.id), {
        email: "ADA@x.test",
        role: "viewer",
      }),
      "CONFLICT",
    );
  });
});

describe("roles and removal", () => {
  it("keeps at least one owner", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const owner = await resolveOrgScope(conn.db, ada.id, acme.id);
    await expectCode(changeMemberRole(owner, ada.id, "admin"), "LAST_OWNER");
    await expectCode(removeMember(owner, ada.id), "LAST_OWNER");
  });

  it("stops an admin from demoting or removing an owner", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const adm = await join(ada.id, acme.id, "adm@x.test", "admin");
    const admin = await resolveOrgScope(conn.db, adm.id, acme.id);
    await expectCode(changeMemberRole(admin, ada.id, "viewer"), "FORBIDDEN");
    await expectCode(removeMember(admin, ada.id), "FORBIDDEN");
  });

  it("stops a labeller from changing roles", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const lab = await join(ada.id, acme.id, "lab@x.test", "labeller");
    const other = await join(ada.id, acme.id, "v@x.test", "viewer");
    await expectCode(
      changeMemberRole(await resolveOrgScope(conn.db, lab.id, acme.id), other.id, "labeller"),
      "FORBIDDEN",
    );
  });

  it("lets any member leave", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const cy = await join(ada.id, acme.id, "cy@x.test", "viewer");
    await removeMember(await resolveOrgScope(conn.db, cy.id, acme.id), cy.id);
    await expectCode(resolveOrgScope(conn.db, cy.id, acme.id), "NOT_A_MEMBER");
  });

  it("lets an owner add a second owner, after which the first can step down", async () => {
    const ada = await makeUser("ada@x.test");
    const acme = await createOrganization(conn.db, ada.id, { name: "Acme", slug: "acme" });
    const cy = await join(ada.id, acme.id, "cy@x.test", "admin");
    const owner = await resolveOrgScope(conn.db, ada.id, acme.id);
    await changeMemberRole(owner, cy.id, "owner");
    await changeMemberRole(owner, ada.id, "admin");
    expect((await listMembers(owner)).map((m) => [m.email, m.role])).toEqual([
      ["ada@x.test", "admin"],
      ["cy@x.test", "owner"],
    ]);
  });
});

describe("audit log", () => {
  it("shows an organisation only its own events, newest first, to managers and above", async () => {
    const { ada, bob, acme, bobco } = await twoOrgs();
    const owner = await resolveOrgScope(conn.db, ada.id, acme.id);
    await createInvitation(owner, { email: "c@x.test", role: "viewer" });
    expect((await listRecentAudit(owner)).map((e) => e.action)).toEqual([
      "invitation.created",
      "organization.created",
    ]);
    expect(
      (await listRecentAudit(await resolveOrgScope(conn.db, bob.id, bobco.id))).map((e) => e.action),
    ).toEqual(["organization.created"]);
    const lab = await join(ada.id, acme.id, "lab@x.test", "labeller");
    await expectCode(listRecentAudit(await resolveOrgScope(conn.db, lab.id, acme.id)), "FORBIDDEN");
  });
});
