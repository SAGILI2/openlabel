"use client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateProjectForm, type TaskOption } from "./create-project-form";

export function NewProjectDialog({ taskTypes }: { taskTypes: TaskOption[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project holds one kind of data and its labels. You can upload files right after.
          </DialogDescription>
        </DialogHeader>
        <CreateProjectForm taskTypes={taskTypes} />
      </DialogContent>
    </Dialog>
  );
}
