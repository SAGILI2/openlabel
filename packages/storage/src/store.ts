/**
 * Object storage for media and model outputs (architecture §2, ADR-0005). Keys are
 * slash-separated paths; implementations never interpret them beyond that.
 */
export interface ObjectStore {
  readonly driver: "local" | "s3";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Whole object, or null when the key doesn't exist. */
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/** Key of one rendered page (JPEG, as it sits in the file) of a multi-page document. */
export function pageKey(storageKey: string, page: number): string {
  return `${storageKey}.p${String(page)}.jpg`;
}

/** Key for an uploaded original: content-addressed inside its organisation and project. */
export function assetKey(orgId: string, projectId: string, sha256: string, extension: string): string {
  const ext = extension
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 8);
  return `orgs/${orgId}/projects/${projectId}/assets/${sha256}${ext ? `.${ext}` : ""}`;
}

/** Key for an export archive. */
export function exportKey(orgId: string, projectId: string, exportId: string): string {
  return `orgs/${orgId}/projects/${projectId}/exports/${exportId}.zip`;
}

/** Rejects keys that could escape the store root (`..`, absolute paths, backslashes). */
export function assertSafeKey(key: string): void {
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new Error(`unsafe storage key: ${JSON.stringify(key)}`);
  }
}
