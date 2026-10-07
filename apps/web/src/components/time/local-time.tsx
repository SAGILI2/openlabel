"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

const FORMATS = {
  datetime: new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
  date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }),
} as const;

/**
 * A timestamp in the viewer's own time zone. The server doesn't know that zone, so it renders
 * the ISO value and the browser swaps in the local format after hydration (no mismatch).
 */
export function LocalTime({ iso, format = "datetime" }: { iso: string; format?: keyof typeof FORMATS }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso} title={iso} className="whitespace-nowrap">
      {isClient
        ? FORMATS[format].format(new Date(iso))
        : iso.slice(0, format === "date" ? 10 : 16).replace("T", " ")}
    </time>
  );
}
