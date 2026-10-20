"use client";

import { useState } from "react";
import { MoreHorizontal, Merge, ShoppingBasket, Trash2 } from "lucide-react";
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
import { SessionMergeDialog } from "@/components/sessions/session-merge-dialog";
import { useMergeBasket } from "@/components/sessions/merge-basket";

type SessionActionsMenuProps = {
  sessionId: string;
  /** Name and cover for the merge basket */
  sessionName: string;
  thumbUrl: string | null;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
  redirectTo?: string;
};

export function SessionActionsMenu({ sessionId, sessionName, thumbUrl, onDelete, redirectTo }: SessionActionsMenuProps) {
  const router = useRouter();
  const [mergeOpen, setMergeOpen] = useState(false);
  const basket = useMergeBasket();
  const inBasket = basket.has(sessionId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await onDelete();
    setPending(false);
    if (result.success) {
      basket.remove(sessionId);
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
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
            <Merge size={14} className="mr-2 shrink-0" />
            Same shoot as…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => basket.toggle({ id: sessionId, name: sessionName, thumbUrl })}>
            <ShoppingBasket size={14} className="mr-2 shrink-0" />
            {inBasket ? "Take out of merge basket" : "Add to merge basket"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 size={14} className="mr-2 shrink-0" />
            Delete session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SessionMergeDialog
        sessionId={sessionId}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the session, its participants, media items, and set links. This action cannot be undone.
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
