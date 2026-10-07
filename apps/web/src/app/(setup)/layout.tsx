import type { ReactNode } from "react";
import { requireSession } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Signed-in pages that come before the app shell, such as creating the first organisation. */
export default async function SetupLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return children;
}
