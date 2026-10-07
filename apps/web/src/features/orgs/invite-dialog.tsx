"use client";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { OrgRole } from "@openlabel/db";
import { InviteForm } from "./invite-form";

/** "Invite people" button that opens the invite form in a dialog. */
export function InviteDialog({ assignable, orgName }: { assignable: OrgRole[]; orgName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden />
          Invite people
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Invite people to {orgName}</DialogTitle>
          <DialogDescription>
            They get a one-time link that works for 7 days. Copy it and send it to them.
          </DialogDescription>
        </DialogHeader>
        <InviteForm assignable={assignable} />
      </DialogContent>
    </Dialog>
  );
}
