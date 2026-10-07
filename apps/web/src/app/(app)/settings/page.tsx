import { Settings } from "lucide-react";
import { TopBar } from "@/components/shell";
import { ComingSoon } from "@/components/states";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <TopBar title="Settings" />
      <ComingSoon
        icon={Settings}
        title="Settings arrive with sign-in"
        description="Organisation, members, roles, single sign-on, API keys and storage live here."
        ticket="OL-9"
      />
    </>
  );
}
