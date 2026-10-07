import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getOrgContext } from "@/server/orgs";

export const dynamic = "force-dynamic";

/** Full-screen tools (the labelling workspace): signed in with an organisation, no app chrome. */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { active } = await getOrgContext();
  if (!active) redirect("/onboarding");
  return <div className="h-dvh overflow-hidden">{children}</div>;
}
