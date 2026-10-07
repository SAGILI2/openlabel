import { Database, HardDrive } from "lucide-react";
import type { HealthReport } from "@/server/health";
import { cn } from "@/lib/utils";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "relative flex size-2.5 rounded-full ring-4",
        ok ? "ring-success/15" : "ring-destructive/15",
      )}
      aria-hidden
    >
      <span
        className={cn("relative inline-flex size-2.5 rounded-full", ok ? "bg-success" : "bg-destructive")}
      />
    </span>
  );
}

function Row({
  icon: Icon,
  name,
  detail,
  ok,
  latencyMs,
  error,
}: {
  icon: typeof Database;
  name: string;
  detail: string;
  ok: boolean;
  latencyMs: number;
  error?: string | undefined;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icon className="text-muted-foreground size-4" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-muted-foreground truncate text-[13px]">{error ?? detail}</p>
      </div>
      <span className="text-muted-foreground font-mono text-[12px]">{latencyMs} ms</span>
      <StatusDot ok={ok} />
      <span className="sr-only">{ok ? "operational" : "unavailable"}</span>
    </li>
  );
}

/** Live dependency status, rendered on the server from the same check as /api/health. */
export function SystemStatus({ report }: { report: HealthReport }) {
  const { database, storage } = report.checks;
  return (
    <section aria-labelledby="status-heading" className="bg-card rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="status-heading" className="font-semibold">
          System status
        </h2>
        <span className="text-muted-foreground text-[13px]">
          {report.status === "ok" ? "All systems operational" : "Some services are unavailable"} · v
          {report.version}
        </span>
      </div>
      <ul className="divide-y">
        <Row
          icon={Database}
          name="Database"
          detail="PostgreSQL"
          ok={database.status === "ok"}
          latencyMs={database.latencyMs}
          error={database.error}
        />
        <Row
          icon={HardDrive}
          name="Object storage"
          detail={storage.driver === "s3" ? "S3-compatible bucket" : "Local disk"}
          ok={storage.status === "ok"}
          latencyMs={storage.latencyMs}
          error={storage.error}
        />
      </ul>
    </section>
  );
}
