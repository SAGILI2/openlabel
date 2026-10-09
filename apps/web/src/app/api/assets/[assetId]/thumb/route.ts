import sharp from "sharp";
import { NextResponse } from "next/server";
import { AccessError, getAsset } from "@openlabel/db";
import { pageKey } from "@openlabel/storage";
import { requireOrgScope } from "@/server/orgs";
import { pageCountOf, pageMetaOf, pageParam } from "@/server/media/upright";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const WIDTH = 320;

/**
 * Small WebP preview of an asset for grids and film-strips. Generated on first request and kept
 * next to the original in object storage (content-addressed, so it never goes stale). For a PDF
 * it shows `?page=N` (default the first page), once the worker has rendered it.
 */
export async function GET(request: Request, ctx: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await ctx.params;
  const { scope } = await requireOrgScope();
  try {
    const asset = await getAsset(scope, assetId);
    const pdf = asset.kind === "pdf";
    const page = pdf
      ? pageParam(new URL(request.url).searchParams.get("page"), pageCountOf(asset.mediaMeta))
      : 1;
    const source = pdf ? pageKey(asset.storageKey, page) : asset.storageKey;
    const { rotation } = pageMetaOf(asset.mediaMeta, page);
    const key = `${source}.thumb${String(WIDTH)}${rotation ? `.r${String(rotation)}` : ""}.webp`;
    // The key names the exact picture (file content + turn), so the browser can revalidate cheaply.
    const etag = `"${asset.sha256.slice(0, 16)}-${String(page)}-${String(rotation)}"`;
    if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304 });
    const store = getStore();
    let thumb = (await store.get(key))?.body;
    if (!thumb) {
      const original = await store.get(source);
      if (!original) return new NextResponse("Not found", { status: 404 });
      thumb = new Uint8Array(
        await sharp(await sharp(original.body).rotate().toBuffer())
          .rotate(-rotation)
          .resize({ width: WIDTH, withoutEnlargement: true })
          .webp({ quality: 72 })
          .toBuffer(),
      );
      await store.put(key, thumb, "image/webp");
    }
    return new NextResponse(Buffer.from(thumb), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "private, max-age=0, must-revalidate",
        etag,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AccessError) return new NextResponse("Not found", { status: 404 });
    throw err;
  }
}
