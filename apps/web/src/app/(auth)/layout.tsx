import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SplitFrame } from "@/components/shell";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getSession()) redirect("/");
  return <SplitFrame homeHref="/sign-in">{children}</SplitFrame>;
}
