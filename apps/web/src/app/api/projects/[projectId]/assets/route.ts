import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import { NextResponse } from "next/server";
import {
  AccessError,
  ensureFolderPath,
  folderTree,
  getProjectById,
  registerAsset,
  requireRole,
  type FolderNode,
} from "@openlabel/db";
import { assetKey } from "@openlabel/storage";
import { requireOrgScope } from "@/server/orgs";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/tiff": "tif",
  "image/bmp": "bmp",
  "application/pdf": "pdf",
};

function problem(status: number, title: string, detail: string) {
  return NextResponse.json(
    { type: "about:blank", title, status, detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

/**
 * Upload one image or PDF to a project (multipart field `file`). Stores the original in object
 * storage, content-addressed, and queues it for OCR pre-labelling. Re-uploading the same bytes
 * returns the existing asset.
 *
 * Optional fields: `folderId` (target folder) and `relativePath` (e.g. `july/CA/page1.jpg`
 * from a folder upload; its directory part is created under the target folder).
 */
/** Folder for an upload: the target folder, plus the sub-path of a folder upload if any. */
async function resolveFolder(
  scope: Awaited<ReturnType<typeof requireOrgScope>>["scope"],
  projectId: string,
  folderId: string | null,
  relativePath: string,
): Promise<string | null> {
  const dir = relativePath.split("/").slice(0, -1).filter(Boolean);
  if (dir.length === 0) return folderId;
  const base = folderId ? await folderTree(scope, projectId) : null;
  const prefix = base ? findPath(base.roots, folderId) : "";
  const folder = await ensureFolderPath(scope, projectId, [prefix, ...dir].filter(Boolean).join("/"));
  return folder?.id ?? folderId;
}

function findPath(nodes: FolderNode[], id: string | null): string {
  for (const n of nodes) {
    if (n.id === id) return n.path;
    const inner = findPath(n.children, id);
    if (inner) return inner;
  }
  return "";
}

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
    return problem(400, "No file", "Send the file in a multipart field named file.");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return problem(415, "Unsupported type", "Upload PDFs or PNG, JPEG, WebP, TIFF or BMP images.");
  const pdf = ext === "pdf";
  if (file.size === 0 || file.size > (pdf ? MAX_PDF_BYTES : MAX_BYTES)) {
    return problem(
      413,
      "File size not allowed",
      pdf ? "PDFs must be between 1 byte and 100 MB." : "Images must be between 1 byte and 25 MB.",
    );
  }

  const body = new Uint8Array(await file.arrayBuffer());
  // A PDF stays one file; its pages are counted and rendered by the OCR worker.
  let dims: { width?: number; height?: number } = {};
  if (pdf) {
    if (new TextDecoder().decode(body.subarray(0, 5)) !== "%PDF-") {
      return problem(415, "Unreadable PDF", "The file isn't a valid PDF.");
    }
  } else {
    try {
      dims = imageSize(body);
    } catch {
      return problem(415, "Unreadable image", "The file isn't a valid image.");
    }
  }
  const folderId = form?.get("folderId");
  const relativePath = form?.get("relativePath");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const key = assetKey(scope.orgId, projectId, sha256, ext);

  try {
    // Store the bytes before registering: registering queues pre-labelling, and a worker may
    // pick the job up immediately. Content-addressed keys make a repeated put harmless.
    if (!(await getStore().exists(key))) await getStore().put(key, body, file.type);
    const target = await resolveFolder(
      scope,
      projectId,
      typeof folderId === "string" && folderId ? folderId : null,
      typeof relativePath === "string" ? relativePath : "",
    );
    const { asset, created } = await registerAsset(scope, {
      projectId,
      folderId: target,
      kind: pdf ? "pdf" : "image",
      storageKey: key,
      sha256,
      byteSize: body.byteLength,
      mimeType: file.type,
      // Browsers send folder uploads with the path in the name; keep only the file name.
      originalName: (file.name.split(/[/\\]/).pop() || file.name).slice(0, 255),
      mediaMeta: pdf ? {} : { width: dims.width, height: dims.height },
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
