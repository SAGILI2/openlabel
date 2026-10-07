import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-muted-foreground font-mono text-[13px]">404</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="text-muted-foreground mt-2">Check the address, or go back to the overview.</p>
      <Button className="mt-6" variant="outline" asChild>
        <Link href="/">Go to overview</Link>
      </Button>
    </main>
  );
}
