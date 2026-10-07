import type { ReactNode } from "react";
import { NavRail } from "@/components/shell";
import { requireSession } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Authenticated application frame: icon rail + scrollable page area. Redirects to sign-in. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="flex h-dvh overflow-hidden">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
