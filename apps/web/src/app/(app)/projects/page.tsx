import { FolderKanban } from "lucide-react";
import { TopBar } from "@/components/shell";
import { ComingSoon } from "@/components/states";

export const metadata = { title: "Projects" };

export default function Page() {
  return (
    <>
      <TopBar title="Projects" />
      <ComingSoon
        icon={FolderKanban}
        title="No projects yet"
        description="A project holds the data you label, its label set, the people who work on it and the models that pre-label it."
        ticket="OL-11"
      />
    </>
  );
}
