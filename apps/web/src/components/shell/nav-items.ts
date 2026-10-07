import { BarChart3, Database, FolderKanban, Gauge, Settings, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Keyboard shortcut shown in the tooltip, pressed as `g` then this key. */
  shortcut: string;
}

/** Primary navigation, in the order of the data workflow. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", icon: Gauge, shortcut: "o" },
  { href: "/projects", label: "Projects", icon: FolderKanban, shortcut: "p" },
  { href: "/taxonomies", label: "Label sets", icon: Tags, shortcut: "l" },
  { href: "/datasets", label: "Datasets", icon: Database, shortcut: "d" },
  { href: "/evaluation", label: "Evaluation", icon: BarChart3, shortcut: "e" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "s" },
];
