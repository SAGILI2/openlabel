import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";

/** Current session or null; cached per request. */
export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

/** Session for pages that require sign-in; redirects to /sign-in otherwise. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}
