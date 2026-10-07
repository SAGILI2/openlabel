"use client";
import { Laptop, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { describeDevice } from "./describe-device";

export interface SessionRow {
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  current: boolean;
}

export function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current).length;

  async function revoke(token: string) {
    setBusy(token);
    await authClient.revokeSession({ token });
    setBusy(null);
    router.refresh();
  }

  async function revokeOthers() {
    setBusy("others");
    await authClient.revokeOtherSessions();
    setBusy(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="sessions-heading" className="bg-card rounded-lg border">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 id="sessions-heading" className="font-semibold">
            Signed-in devices
          </h2>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Sign out anywhere you don&apos;t recognise. Changing your password signs out every device.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={others === 0 || busy !== null}
          onClick={() => void revokeOthers()}
        >
          Sign out other devices
        </Button>
      </div>
      <ul className="divide-y">
        {sessions.map((s) => {
          const device = describeDevice(s.userAgent);
          const Icon = device.mobile ? Smartphone : Laptop;
          return (
            <li key={s.token} className="flex items-center gap-4 px-5 py-3.5">
              <Icon className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {device.label}
                  {s.current && <Badge variant="secondary">This device</Badge>}
                </p>
                <p className="text-muted-foreground text-[12px] tabular-nums">
                  {s.ipAddress ?? "IP unknown"} · signed in <LocalTime iso={s.createdAt} />
                </p>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void revoke(s.token)}
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
