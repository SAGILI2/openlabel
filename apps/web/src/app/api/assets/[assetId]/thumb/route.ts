import sharp from "sharp";
import { NextResponse } from "next/server";
import { AccessError, getAsset } from "@openlabel/db";
import { requireOrgScope } from "@/server/orgs";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const WIDTH = 320;

/**
 * Small WebP preview of an asset for grids and film-strips. Generated on first request and kept
 * next to the original in object storage (content-addressed, so it never goes stale).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await ctx.params;
  const { scope } = await requireOrgScope();
  try {
    const asset = await getAsset(scope, assetId);
    const key = `${asset.storageKey}.thumb${String(WIDTH)}.webp`;
    const store = getStore();
    let thumb = (await store.get(key))?.body;
    if (!thumb) {
      const original = await store.get(asset.storageKey);
      if (!original) return new NextResponse("Not found", { status: 404 });
      thumb = new Uint8Array(
        await sharp(original.body)
          .rotate()
          .resize({ width: WIDTH, withoutEnlargement: true })
          .webp({ quality: 72 })
          .toBuffer(),
      );
      await store.put(key, thumb, "image/webp");
    }
    return new NextResponse(Buffer.from(thumb), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AccessError) return new NextResponse("Not found", { status: 404 });
    throw err;
  }
}
