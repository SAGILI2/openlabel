import { Tags } from "lucide-react";
import { TopBar } from "@/components/shell";
import { ComingSoon } from "@/components/states";

export const metadata = { title: "Label sets" };

export default function Page() {
  return (
    <>
      <TopBar title="Label sets" />
      <ComingSoon
        icon={Tags}
        title="No label sets yet"
        description="Define the labels your team applies, with descriptions, example images, value types and version history."
        ticket="OL-17"
      />
    </>
  );
}
