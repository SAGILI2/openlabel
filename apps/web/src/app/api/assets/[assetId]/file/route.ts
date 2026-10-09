import { NextResponse } from "next/server";
import { AccessError, getAsset } from "@openlabel/db";
import { pageKey } from "@openlabel/storage";
import { requireOrgScope } from "@/server/orgs";
import { pageCountOf, pageMetaOf, pageParam, uprightJpeg } from "@/server/media/upright";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Streams an asset's page to members of its organisation. A page the OCR read turned (a sideways
 * photo) is served turned the same way, so it and its boxes line up; `?original=1` gives the bytes
 * as uploaded. For a PDF, `?page=N` (from 1) is that page rendered as an image.
 */
export async function GET(request: Request, ctx: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await ctx.params;
  const { scope } = await requireOrgScope();
  try {
    const asset = await getAsset(scope, assetId);
    const store = getStore();
    const params = new URL(request.url).searchParams;
    const original = params.has("original");
    if (original && asset.kind === "pdf") return send(await store.get(asset.storageKey), asset.mimeType);

    const pdf = asset.kind === "pdf";
    const page = pdf ? pageParam(params.get("page"), pageCountOf(asset.mediaMeta)) : 1;
    // The page as it sits in the file: the original image, or the PDF page the worker rendered.
    const source = pdf ? pageKey(asset.storageKey, page) : asset.storageKey;
    const rotation = original ? 0 : pageMetaOf(asset.mediaMeta, page).rotation;
    // Content + page + turn: a page turned again gets a new tag, so the browser never shows a stale one.
    const etag = `"${asset.sha256.slice(0, 16)}-${String(page)}-${String(rotation)}"`;
    if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304 });
    if (!rotation) {
      const object = await store.get(source);
      if (!object && pdf) return new NextResponse("Page not ready yet", { status: 404 });
      return send(object, pdf ? "image/jpeg" : asset.mimeType, etag);
    }
    const key = `${source}.upright${String(rotation)}.jpg`;
    let body = (await store.get(key))?.body;
    if (!body) {
      const object = await store.get(source);
      if (!object) return new NextResponse("Not found", { status: 404 });
      body = await uprightJpeg(object.body, rotation);
      await store.put(key, body, "image/jpeg");
    }
    return send({ body }, "image/jpeg", etag);
  } catch (err) {
    if (err instanceof AccessError) return new NextResponse("Not found", { status: 404 });
    throw err;
  }
}

function send(object: { body: Uint8Array } | null, type: string, etag?: string) {
  if (!object) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(object.body), {
    headers: {
      "content-type": type,
      ...(etag ? { etag } : {}),
      // The page only changes if OCR runs again with a different turn, so revalidate.
      "cache-control": "private, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
