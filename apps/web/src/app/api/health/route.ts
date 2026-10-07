import { NextResponse } from "next/server";
import { ConfigError } from "@openlabel/contracts";
import { getConfig } from "@/server/env";
import { checkHealth } from "@/server/health";

export const dynamic = "force-dynamic";

const VERSION = process.env.OPENLABEL_VERSION ?? "0.0.0-dev";

/** Liveness + dependency health. 200 when every dependency is up, 503 otherwise. */
export async function GET() {
  try {
    const report = await checkHealth(getConfig(), VERSION);
    return NextResponse.json(report, {
      status: report.status === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      return NextResponse.json(
        {
          type: "about:blank",
          title: "Server misconfigured",
          status: 503,
          code: err.code,
          detail: err.issues.join("; "),
        },
        { status: 503, headers: { "content-type": "application/problem+json" } },
      );
    }
    throw err;
  }
}
