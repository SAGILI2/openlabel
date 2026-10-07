import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import { NextResponse } from "next/server";
import { AccessError, getProjectById, registerAsset, requireRole } from "@openlabel/db";
import { assetKey } from "@openlabel/storage";
import { requireOrgScope } from "@/server/orgs";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/tiff": "tif",
  "image/bmp": "bmp",
};

function problem(status: number, title: string, detail: string) {
  return NextResponse.json(
    { type: "about:blank", title, status, detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

/**
 * Upload one image to a project (multipart field `file`). Stores the original in object
 * storage, content-addressed, and queues it for OCR pre-labelling. Re-uploading the same bytes
 * returns the existing asset.
 */
export async function POST(request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const { scope } = await requireOrgScope();
  try {
    // Check access before any bytes are written to storage.
    requireRole(scope, "manager");
    await getProjectById(scope, projectId);
  } catch (err) {
    if (err instanceof AccessError) {
      return problem(err.code === "NOT_FOUND" ? 404 : 403, "Not allowed", err.message);
    }
    throw err;
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return problem(400, "No file", "Send the image in a multipart field named file.");
  if (file.size === 0 || file.size > MAX_BYTES) {
    return problem(413, "File size not allowed", "Images must be between 1 byte and 25 MB.");
  }
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return problem(415, "Unsupported type", "Upload PNG, JPEG, WebP, TIFF or BMP images.");

  const body = new Uint8Array(await file.arrayBuffer());
  let dims: { width?: number; height?: number };
  try {
    dims = imageSize(body);
  } catch {
    return problem(415, "Unreadable image", "The file isn't a valid image.");
  }
  const sha256 = createHash("sha256").update(body).digest("hex");
  const key = assetKey(scope.orgId, projectId, sha256, ext);

  try {
    // Store the bytes before registering: registering queues pre-labelling, and a worker may
    // pick the job up immediately. Content-addressed keys make a repeated put harmless.
    if (!(await getStore().exists(key))) await getStore().put(key, body, file.type);
    const { asset, created } = await registerAsset(scope, {
      projectId,
      kind: "image",
      storageKey: key,
      sha256,
      byteSize: body.byteLength,
      mimeType: file.type,
      originalName: file.name.slice(0, 255),
      mediaMeta: { width: dims.width, height: dims.height },
    });
    return NextResponse.json(
      { id: asset.id, created, status: asset.status },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof AccessError) {
      return problem(err.code === "NOT_FOUND" ? 404 : 403, "Not allowed", err.message);
    }
    throw err;
  }
}
