"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes server data every few seconds while background work is still running. */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [active, intervalMs, router]);
  return null;
}
