import type { ReactNode } from "react";
import { SettingsNav } from "@/features/settings";

/**
 * Settings frame. Desktop: a 220px sub-navigation column whose header lines up with the top
 * bar, content beside it. The frame fills the window and only the content column scrolls, so
 * the sub-navigation never slides under the top bar or leaves a gap below it. Smaller screens:
 * each page renders the nav as a tab row under its top bar (see SettingsTabs).
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="bg-sidebar border-sidebar-border hidden w-[220px] shrink-0 flex-col border-r lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b px-6 text-[15px] font-semibold tracking-tight">
          Settings
        </div>
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
          <SettingsNav />
        </div>
      </aside>
      <div className="scrollbar-none flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
