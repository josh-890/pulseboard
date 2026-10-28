"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { previewUndoAction, undoRunAction } from "@/lib/actions/catalogue-load-actions";
import type { UndoPreview } from "@/lib/services/catalogue-load-service";

type CatalogueUndoButtonProps = { runId: string };

const n = (v: number, one: string, many: string) => `${v.toLocaleString()} ${v === 1 ? one : many}`;

/** Undo the latest run: preview first — what goes, what stays because you used it, what goes back */
export function CatalogueUndoButton({ runId }: CatalogueUndoButtonProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<UndoPreview | null>(null);
  const [isPending, start] = useTransition();

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={isPending}
        onClick={() =>
          start(async () => {
            const res = await previewUndoAction(runId);
            if (!res.success) toast.error(res.error);
            else setPreview(res.preview);
          })
        }
      >
        {isPending && !preview ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
        Undo run
      </Button>
      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && !isPending && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this run?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {preview && (
                  <ul className="space-y-1">
                    <li>{n(preview.contactsRemoved, "Contact it created is", "Contacts it created are")} removed</li>
                    <li>
                      {n(preview.contactsKept, "Contact it created stays", "Contacts it created stay")} — you worked with
                      them (name, portrait, note, ignored, credits, links, archive folders); only their catalogue data goes
                    </li>
                    <li>{n(preview.contactsRestored, "Contact that existed gets", "Contacts that existed get")} their earlier catalogue data back</li>
                    <li>
                      {n(preview.setsRemoved, "catalogue set", "catalogue sets")} removed, {preview.setsRestored.toLocaleString()} put back as they were
                    </li>
                    <li>
                      {n(preview.foldersRemoved, "folder", "folders")} removed, {preview.foldersRestored.toLocaleString()} put back
                    </li>
                  </ul>
                )}
                <p>Your Persons are never touched by a run, nor by its Undo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await undoRunAction(runId);
                  if (!res.success) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Run undone");
                  setPreview(null);
                  router.refresh();
                });
              }}
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Undo run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
