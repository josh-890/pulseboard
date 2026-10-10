"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteTagsAction } from "@/lib/actions/tag-actions";
import type { TagCounts } from "@/lib/services/tag-browse-service";

export type DeletableTag = { id: string; name: string; counts: TagCounts };

export type TagDeleteDialogProps = {
  tags: DeletableTag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a successful delete (refresh, clear a selection, leave a page) */
  onDeleted?: () => void;
};

const KINDS: { key: keyof TagCounts; label: string }[] = [
  { key: "person", label: "people" },
  { key: "session", label: "sessions" },
  { key: "set", label: "sets" },
  { key: "media", label: "images" },
  { key: "project", label: "projects" },
  { key: "archive", label: "archive folders" },
];

// Deleting is the one tag action that cannot be taken back, so it says exactly
// what goes: per kind of item, how many lose the tag — and what happens on disk.
export function TagDeleteDialog({ tags, open, onOpenChange, onDeleted }: TagDeleteDialogProps) {
  const [isPending, startTransition] = useTransition();
  const sum = (k: keyof TagCounts) => tags.reduce((n, t) => n + t.counts[k], 0);
  const lines = KINDS.map((k) => ({ ...k, n: sum(k.key) })).filter((k) => k.n > 0);
  const title = tags.length === 1 ? `Delete “${tags[0].name}”?` : `Delete ${tags.length} tags?`;

  const confirm = () =>
    startTransition(async () => {
      const res = await deleteTagsAction(tags.map((t) => t.id));
      if (!res.success) {
        toast.error(res.error ?? "Could not delete");
        return;
      }
      toast.success(tags.length === 1 ? `Deleted “${tags[0].name}”` : `Deleted ${tags.length} tags`);
      onOpenChange(false);
      onDeleted?.();
    });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {tags.length > 1 && <p className="break-words font-mono text-xs">{tags.map((t) => t.name).join(", ")}</p>}
              {lines.length === 0 ? (
                <p>Not used anywhere — nothing loses it.</p>
              ) : (
                <>
                  <p>These lose the tag:</p>
                  <ul className="list-inside list-disc">
                    {lines.map((l) => (
                      <li key={l.key}>
                        <span className="tabular-nums">{l.n}</span> {l.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p>Sub-tags move up a level. Aliases go with the tag.</p>
              {sum("archive") > 0 && (
                <p>
                  Archive folders keep their <code className="rounded bg-muted px-1">.pb\#…</code> files; the next scan shows
                  them as unknown names instead of deleting them.
                </p>
              )}
              <p className="font-medium text-foreground">This cannot be undone. To keep the assignments, merge instead.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
