"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { deleteScalarDeltaAction } from "@/lib/actions/appearance-actions";
import { cn } from "@/lib/utils";

// Takes one recorded value back (2026-10-20) — a single ScalarDelta, after a
// red confirmation. Compact: an icon, or an icon with a label.

export type RemoveValueButtonProps = {
  deltaId: string;
  personId: string;
  /** e.g. "Eye Pattern: sectoral-heterochromia" — named in the dialog */
  what: string;
  /** Where it sits, e.g. "Undated changes" */
  where: string;
  label?: string;
  className?: string;
  onRemoved?: () => void;
};

export function RemoveValueButton({ deltaId, personId, what, where, label, className, onRemoved }: RemoveValueButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    setPending(true);
    const result = await deleteScalarDeltaAction(deltaId, personId);
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not remove the value");
      return;
    }
    toast.success("Value removed");
    onRemoved?.();
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          aria-label={`Remove ${what} (${where})`}
          title="Remove this value"
          className={cn(
            "inline-flex items-center gap-1 rounded-md p-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Trash2 size={12} aria-hidden="true" />
          {label}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this value?</AlertDialogTitle>
          <AlertDialogDescription>
            {what} goes out of {where}. Whatever else is recorded for it shows again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRemove} disabled={pending} variant="destructive">
            {pending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
