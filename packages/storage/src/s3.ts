import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertSafeKey, type ObjectStore } from "./store.js";

export interface S3StoreOptions {
  bucket: string;
  region: string;
  endpoint?: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Any S3-compatible service: AWS S3, SeaweedFS (bundled), R2, MinIO, GCS interop. */
export class S3Store implements ObjectStore {
  readonly driver = "s3" as const;
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(opts: S3StoreOptions) {
    this.#bucket = opts.bucket;
    this.#client = new S3Client({
      region: opts.region,
      forcePathStyle: opts.forcePathStyle,
      ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.#client.send(
      new PutObjectCommand({ Bucket: this.#bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
    assertSafeKey(key);
    try {
      const res = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
      if (!res.Body) return null;
      return {
        body: await res.Body.transformToByteArray(),
        contentType: res.ContentType ?? "application/octet-stream",
      };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
      return true;
    } catch (err) {
      if (err instanceof NotFound || err instanceof NoSuchKey) return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }
}
