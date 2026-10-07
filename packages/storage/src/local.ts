import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertSafeKey, type ObjectStore } from "./store.js";

/** Files under one directory; for single-node installs and tests. Content type kept in a sidecar. */
export class LocalStore implements ObjectStore {
  readonly driver = "local" as const;
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  #path(key: string): string {
    assertSafeKey(key);
    return join(this.#root, ...key.split("/"));
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const path = this.#path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    await writeFile(`${path}.type`, contentType);
  }

  async get(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
    const path = this.#path(key);
    try {
      const [body, type] = await Promise.all([
        readFile(path),
        readFile(`${path}.type`, "utf8").catch(() => ""),
      ]);
      return { body: new Uint8Array(body), contentType: type || "application/octet-stream" };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.#path(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.#path(key);
    await rm(path, { force: true });
    await rm(`${path}.type`, { force: true });
  }
}
