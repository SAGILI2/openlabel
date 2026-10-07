"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { DialogsProvider } from "@/components/dialogs";
import { TooltipProvider } from "@/components/ui/tooltip";

/** Client-side providers shared by every page: theme, tooltips and in-app dialogs. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        <DialogsProvider>{children}</DialogsProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
