import { redirect } from "next/navigation";

/** Settings opens on the first section. */
export default function SettingsPage() {
  redirect("/settings/security");
}
