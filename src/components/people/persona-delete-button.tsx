"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { removePersona } from "@/lib/actions/persona-actions";

type PersonaDeleteButtonProps = {
  personaId: string;
  personId: string;
  label: string;
};

export function PersonaDeleteButton({
  personaId,
  personId,
  label,
}: PersonaDeleteButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await removePersona(personaId, personId);
    setPending(false);

    if (result.success) {
      toast.success("Persona removed");
    } else {
      toast.error(result.error ?? "Failed to remove persona");
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive">
          <Trash2 size={14} />
          <span className="sr-only">Delete persona</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete persona?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the &ldquo;{label}&rdquo; persona entry. The remaining
            chain will be renumbered and the current state recalculated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
