"use client";

import { useState } from "react";
import { MoreHorizontal, Copy, Merge, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MergeSetSheet } from "@/components/sets/merge-set-sheet";
import { SessionMergeDialog } from "@/components/sessions/session-merge-dialog";

// Two different merges, named by intent (2026-10-20): "Same shoot as…" joins this
// set's session with another (the sets stay); "Same release imported twice…"
// folds a duplicate set into this one.

type SetActionsMenuProps = {
  setId: string;
  setTitle: string;
  setType: string;
  /** The set's primary session — offers "Same shoot as…" */
  sessionId?: string;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
  redirectTo?: string;
};

export function SetActionsMenu({ setId, setTitle, setType, sessionId, onDelete, redirectTo }: SetActionsMenuProps) {
  const router = useRouter();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [sameShootOpen, setSameShootOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await onDelete();
    setPending(false);
    if (result.success) {
      toast.success("Deleted successfully");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } else {
      toast.error(result.error ?? "Delete failed");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions">
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {sessionId && (
            <DropdownMenuItem onSelect={() => setSameShootOpen(true)}>
              <Merge size={14} className="mr-2 shrink-0" />
              Same shoot as…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
            <Copy size={14} className="mr-2 shrink-0" />
            Same release imported twice…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 size={14} className="mr-2 shrink-0" />
            Delete set
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MergeSetSheet
        setId={setId}
        setTitle={setTitle}
        setType={setType}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />

      {sessionId && <SessionMergeDialog sessionId={sessionId} open={sameShootOpen} onOpenChange={setSameShootOpen} />}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete set?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the set and all credits. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={pending}
              variant="destructive"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
