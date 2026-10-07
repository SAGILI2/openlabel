import type { ReactNode } from "react";
import { NavRail } from "@/components/shell";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/server/orgs";

export const dynamic = "force-dynamic";

/** App frame: icon rail + page. Requires sign-in and an organisation (else onboarding). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { active } = await getOrgContext();
  if (!active) redirect("/onboarding");
  return (
    <div className="flex h-dvh overflow-hidden">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
