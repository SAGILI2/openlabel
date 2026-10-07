"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * A timestamp in the viewer's own time zone. The server doesn't know that zone, so it renders
 * the ISO value and the browser swaps in the local format after hydration (no mismatch).
 */
export function LocalTime({ iso }: { iso: string }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso}>
      {isClient ? formatter.format(new Date(iso)) : iso.slice(0, 16).replace("T", " ")}
    </time>
  );
}
