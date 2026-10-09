import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../../../src/client/index.js";
import { runMigrations } from "../../../src/migrate/run.js";
import { DEFAULT_PREFERENCES, getPreferences, updatePreferences } from "../../../src/access/index.js";
import { users } from "../../../src/schema/index.js";
import { startPostgres } from "../../support/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let conn: ReturnType<typeof createDb>;

beforeAll(async () => {
  pg = await startPostgres(55440, "preferences_test");
  await runMigrations(pg.url);
  conn = createDb({ url: pg.url, max: 2 });
});

afterAll(async () => {
  await conn.close();
  pg.stop();
});

describe("preferences", () => {
  it("starts at the defaults, merges changes and ignores unknown or invalid keys", async () => {
    const [ada] = await conn.db.insert(users).values({ email: "ada@x.test", name: "Ada" }).returning();
    if (!ada) throw new Error("seed failed");
    expect(await getPreferences(conn.db, ada.id)).toEqual(DEFAULT_PREFERENCES);

    await updatePreferences(conn.db, ada.id, { showBoxes: false });
    const after = await updatePreferences(conn.db, ada.id, {
      hideFileStrip: true,
      showLink: "nope",
      ...({ admin: true } as object),
    });
    expect(after).toEqual({ showBoxes: false, showLink: true, hideFileStrip: true });
    expect(await getPreferences(conn.db, ada.id)).toEqual(after);
    const [row] = await conn.db.select({ p: users.preferences }).from(users);
    expect(row?.p).not.toHaveProperty("admin");
  });
});
