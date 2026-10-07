import { Database } from "lucide-react";
import { TopBar } from "@/components/shell";
import { ComingSoon } from "@/components/states";

export const metadata = { title: "Datasets" };

export default function Page() {
  return (
    <>
      <TopBar title="Datasets" />
      <ComingSoon
        icon={Database}
        title="No datasets yet"
        description="Freeze approved labels into a versioned dataset and export it to any training format or destination."
        ticket="OL-27"
      />
    </>
  );
}
