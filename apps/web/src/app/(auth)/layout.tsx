import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoMark, ThemeToggle } from "@/components/shell";
import { WorkbenchPreview } from "@/features/overview";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Sign-in frame: the form on a sheet, and the product's own material (a page being labelled)
 * on the paper side, so the first screen already shows what OpenLabel does.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getSession()) redirect("/");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(420px,520px)_1fr]">
      <main className="bg-card flex flex-col px-8 py-8 sm:px-14 lg:border-r">
        <div className="flex items-center justify-between">
          <Link href="/sign-in" className="flex items-center gap-2 font-semibold tracking-tight">
            <LogoMark className="size-7" />
            OpenLabel
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 flex-col justify-center py-12">
          <div className="w-full max-w-[360px]">{children}</div>
        </div>
        <p className="text-muted-foreground text-[12px]">Open source under the Apache License 2.0.</p>
      </main>
      <aside className="hidden flex-col justify-center gap-6 p-14 lg:flex" aria-hidden>
        <div className="max-w-[640px]">
          <WorkbenchPreview />
        </div>
        <p className="text-muted-foreground max-w-[520px] leading-relaxed">
          Models draft the labels. People correct them. Every fix is versioned, reviewed and ready for
          training, or for scoring the next model.
        </p>
      </aside>
    </div>
  );
}
