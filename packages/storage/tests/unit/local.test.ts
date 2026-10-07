import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStore } from "../../src/local.js";
import { assetKey, assertSafeKey } from "../../src/store.js";

let root: string;
let store: LocalStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ol-store-"));
  store = new LocalStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("LocalStore", () => {
  it("round-trips bytes and content type", async () => {
    await store.put("a/b/c.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(await store.exists("a/b/c.png")).toBe(true);
    const got = await store.get("a/b/c.png");
    expect(got?.contentType).toBe("image/png");
    expect([...(got?.body ?? [])]).toEqual([1, 2, 3]);
  });

  it("returns null for a missing key and deletes", async () => {
    expect(await store.get("missing")).toBeNull();
    await store.put("x", new Uint8Array([9]), "text/plain");
    await store.delete("x");
    expect(await store.exists("x")).toBe(false);
  });

  it("refuses keys that escape the root", async () => {
    for (const key of ["../evil", "/abs", "a/../../b", "a\\b", "a//b", ""]) {
      await expect(store.put(key, new Uint8Array(), "x")).rejects.toThrow(/unsafe/);
    }
  });
});

describe("assetKey", () => {
  it("is content-addressed inside org and project, with a cleaned extension", () => {
    expect(assetKey("o1", "p1", "abc", ".PNG")).toBe("orgs/o1/projects/p1/assets/abc.png");
    expect(assetKey("o1", "p1", "abc", "../x")).toBe("orgs/o1/projects/p1/assets/abc.x");
    expect(() => {
      assertSafeKey(assetKey("o1", "p1", "abc", ""));
    }).not.toThrow();
  });
});
