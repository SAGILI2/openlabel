"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Tracks "a link inside the browser was clicked and the next page hasn't arrived yet", so
 * folder, page and filter changes can show a loader immediately. Next.js changes the URL only
 * once the server answers; until then we hold the href that was clicked.
 */
const Ctx = createContext<{ pending: string | null; start: (href: string) => void }>({
  pending: null,
  start: () => undefined,
});

export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<string | null>(null);
  const url = `${usePathname()}?${useSearchParams().toString()}`;
  // The URL changed: the new page is here.
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl !== url) {
    setSeenUrl(url);
    setPending(null);
  }
  // Never spin forever (e.g. a click that didn't navigate).
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      setPending(null);
    }, 20000);
    return () => {
      clearTimeout(t);
    };
  }, [pending]);
  return <Ctx.Provider value={{ pending, start: setPending }}>{children}</Ctx.Provider>;
}

export function useNavigationPending() {
  return useContext(Ctx);
}
