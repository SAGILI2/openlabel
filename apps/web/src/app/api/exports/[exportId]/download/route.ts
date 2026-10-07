import { NextResponse } from "next/server";
import { AccessError, getExport } from "@openlabel/db";
import { requireOrgScope } from "@/server/orgs";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

function fileName(name: string, id: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "export"}-${id.slice(0, 8)}.zip`;
}

/** Downloads a finished export's ZIP for members of its organisation. */
export async function GET(_request: Request, ctx: { params: Promise<{ exportId: string }> }) {
  const { exportId } = await ctx.params;
  const { scope } = await requireOrgScope();
  try {
    const exp = await getExport(scope, exportId);
    if (exp.status !== "ready" || !exp.storageKey) {
      return new NextResponse("Export is not ready yet.", { status: 409 });
    }
    const object = await getStore().get(exp.storageKey);
    if (!object) return new NextResponse("Export file is missing.", { status: 410 });
    return new NextResponse(Buffer.from(object.body), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${fileName(exp.name, exp.id)}"`,
        "content-length": String(object.body.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof AccessError) return new NextResponse("Not found", { status: 404 });
    throw err;
  }
}
