import { eq, sql } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { users } from "../schema/index.js";

/**
 * A person's own display settings. They follow the user across files, projects, organisations
 * and browsers. Unknown keys are ignored and missing or invalid values fall back to the defaults.
 */
export interface Preferences {
  /** Draw the word boxes over the page in the labelling editor. */
  showBoxes: boolean;
  /** Draw the line linking the selected box to its word. */
  showLink: boolean;
  /** Hide the strip of neighbouring files under the editor. */
  hideFileStrip: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { showBoxes: true, showLink: true, hideFileStrip: false };

const KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[];

/** Stored JSON to settings: only known boolean keys survive. */
export function readPreferences(stored: unknown): Preferences {
  const out = { ...DEFAULT_PREFERENCES };
  if (stored && typeof stored === "object") {
    for (const k of KEYS) {
      const v = (stored as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

export async function getPreferences(db: Database, userId: string): Promise<Preferences> {
  const [row] = await db.select({ p: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  return readPreferences(row?.p);
}

/** Merges a partial change into the stored settings and returns the result. */
export async function updatePreferences(
  db: Database,
  userId: string,
  change: Partial<Record<keyof Preferences, unknown>>,
): Promise<Preferences> {
  const clean: Partial<Preferences> = {};
  for (const k of KEYS) {
    const v = change[k];
    if (typeof v === "boolean") clean[k] = v;
  }
  const [row] = await db
    .update(users)
    .set({ preferences: sql`${users.preferences} || ${JSON.stringify(clean)}::jsonb` })
    .where(eq(users.id, userId))
    .returning({ p: users.preferences });
  return readPreferences(row?.p);
}
