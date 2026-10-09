"use server";
import { updatePreferences, type Preferences } from "@openlabel/db";
import { requireSession } from "../auth";
import { getDb } from "../db";

/** Saves one or more of the signed-in person's display settings. */
export async function savePreferencesAction(change: Partial<Preferences>): Promise<Preferences> {
  const session = await requireSession();
  return updatePreferences(getDb().db, session.user.id, change);
}
