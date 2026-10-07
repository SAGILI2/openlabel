import { BarChart3 } from "lucide-react";
import { TopBar } from "@/components/shell";
import { ComingSoon } from "@/components/states";

export const metadata = { title: "Evaluation" };

export default function Page() {
  return (
    <>
      <TopBar title="Evaluation" />
      <ComingSoon
        icon={BarChart3}
        title="No evaluations yet"
        description="Run any OCR engine or API against your verified labels and compare accuracy, cost and speed."
        ticket="OL-32"
      />
    </>
  );
}
