import type { ReactNode } from "react";
import { SettingsNav } from "@/features/settings";

/**
 * Settings frame. Desktop: a 220px sub-navigation column whose header lines up with the top
 * bar, content beside it. Smaller screens: each page renders the nav as a tab row under its
 * top bar (see SettingsTabs), so the top bar stays first.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh w-[220px] shrink-0 border-r lg:block">
        <div className="flex h-16 items-center border-b px-6 text-[15px] font-semibold tracking-tight">
          Settings
        </div>
        <SettingsNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
