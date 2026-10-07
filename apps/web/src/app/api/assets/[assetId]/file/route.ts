import { NextResponse } from "next/server";
import { AccessError, getAsset } from "@openlabel/db";
import { requireOrgScope } from "@/server/orgs";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Streams an asset's original file to members of its organisation. */
export async function GET(_request: Request, ctx: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await ctx.params;
  const { scope } = await requireOrgScope();
  try {
    const asset = await getAsset(scope, assetId);
    const object = await getStore().get(asset.storageKey);
    if (!object) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(Buffer.from(object.body), {
      headers: {
        "content-type": asset.mimeType,
        // Content-addressed: the bytes behind this URL never change.
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AccessError) return new NextResponse("Not found", { status: 404 });
    throw err;
  }
}
